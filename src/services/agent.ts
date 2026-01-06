import { Deferred, Effect, Fiber, Option, Queue, Ref, Runtime, Schema, Stream } from "effect";
import { DEFAULT_MODEL_REVIEWER, DEFAULT_MODEL_WRITER, MAX_STEP_COUNT } from "@/domain/constants";
import {
    AgentLoopError,
    AgentStreamError,
    MaxIterationsReached,
    NoUserActionPending,
    UserCancel,
} from "@/domain/errors";
import { DraftGenerated, ReviewCompleted, ReviewResult, UserFeedback, WorkflowState } from "@/domain/workflow";
import { Config } from "@/services/config";
import { LLM, type ToolCallRecord } from "@/services/llm";
import { Prompts } from "@/services/prompts";
import { Session } from "@/services/session";
import { Web } from "@/services/web";
import { edit_tools, explore_tools } from "@/tools";

export const reasoningOptions = Schema.Literal("low", "medium", "high");

export type UserAction = {
    readonly type: "approve" | "reject";
    readonly comment?: string;
};

export type AgentEvent =
    | {
          readonly _tag: "Progress";
          readonly message: string;
          readonly cycle: number;
      }
    | {
          readonly _tag: "StreamChunk";
          readonly content: string;
          readonly phase: "drafting" | "reviewing" | "editing";
      }
    | {
          readonly _tag: "DraftComplete";
          readonly content: string;
          readonly cycle: number;
      }
    | {
          readonly _tag: "ReviewComplete";
          readonly approved: boolean;
          readonly critique: string;
          readonly cycle: number;
      }
    | {
          readonly _tag: "UserActionRequired";
          readonly draft: string;
          readonly cycle: number;
      }
    | {
          readonly _tag: "ToolCall";
          readonly name: string;
          readonly input: unknown;
          readonly output: unknown;
      }
    | {
          readonly _tag: "UserInput";
          readonly content: string;
          readonly cycle: number;
      }
    | {
          readonly _tag: "Error";
          readonly message: string;
          readonly cycle: number;
      }
    | {
          readonly _tag: "IterationLimitReached";
          readonly iterations: number;
          readonly lastDraft: string;
      };

export interface RunOptions {
    readonly prompt: string;
    readonly modelWriter?: string;
    readonly modelReviewer?: string;
    readonly reasoning?: boolean;
    readonly reasoningEffort?: Schema.Schema.Type<typeof reasoningOptions>;
    readonly maxIterations?: number;
}

export interface RunResult {
    readonly finalContent: string;
    readonly iterations: number;
    readonly state: WorkflowState;
    readonly totalCost: number;
    readonly sessionId: string;
    readonly sessionPath: string;
}

export class Agent extends Effect.Service<Agent>()("services/agent", {
    effect: Effect.gen(function* () {
        const prompts = yield* Prompts;
        const config = yield* Config;
        const session = yield* Session;
        const llm = yield* LLM;

        return {
            /**
             * Run the autonomous agent loop.
             * Returns a stream of events and a result promise.
             */
            run: (options: RunOptions) =>
                Effect.gen(function* () {
                    yield* Effect.logInfo("Starting agent run").pipe(
                        Effect.annotateLogs({
                            writer: options.modelWriter,
                            reviewer: options.modelReviewer,
                            reasoning: options.reasoning,
                            maxIterations: options.maxIterations,
                        }),
                    );

                    const userConfig = yield* config.get;

                    const maxIterations = options.maxIterations ?? userConfig.agentMaxIterations;
                    const reasoning = options.reasoning ?? true;
                    const reasoningEffort = options.reasoningEffort ?? "high";

                    const writerModel = yield* llm.createModel({
                        name: options.modelWriter ?? userConfig.writerModel ?? DEFAULT_MODEL_WRITER,
                        role: "writer",
                        reasoning,
                        reasoningEffort,
                    });

                    const reviewerModel = yield* llm.createModel({
                        name: options.modelReviewer ?? userConfig.reviewerModel ?? DEFAULT_MODEL_REVIEWER,
                        role: "reviewer",
                        reasoning,
                        reasoningEffort,
                    });

                    const writerModelName = options.modelWriter ?? DEFAULT_MODEL_WRITER;
                    const reviewerModelName = options.modelReviewer ?? DEFAULT_MODEL_REVIEWER;
                    const sessionHandle = yield* session
                        .create({
                            prompt: options.prompt,
                            modelWriter: writerModelName,
                            modelReviewer: reviewerModelName,
                            reasoning,
                            reasoningEffort,
                            maxIterations,
                        })
                        .pipe(
                            Effect.mapError(
                                (error) =>
                                    new AgentStreamError({
                                        cause: error,
                                        message: "message" in error ? error.message : "Failed to create session",
                                    }),
                            ),
                        );

                    yield* Effect.logDebug(`Session created: ${sessionHandle.id}`);

                    const writerTask = yield* prompts.getWriterTask;
                    const reviewerTask = yield* prompts.getReviewerTask;
                    const editorTask = yield* prompts.getEditorTask;

                    const eventQueue = yield* Queue.unbounded<AgentEvent>();
                    const userActionDeferred = yield* Ref.make<Deferred.Deferred<UserAction, UserCancel> | null>(null);

                    const stateRef = yield* Ref.make(WorkflowState.empty);

                    const runtime = yield* Effect.runtime<never>();

                    const emitEvent = (event: AgentEvent) =>
                        Effect.all([Queue.offer(eventQueue, event), sessionHandle.addAgentEvent(event)], {
                            discard: true,
                        });

                    const saveToolCall = (record: ToolCallRecord) => {
                        Runtime.runPromise(runtime)(
                            Effect.all(
                                [
                                    sessionHandle.addToolCall(record.name, record.input, record.output),
                                    Queue.offer(eventQueue, {
                                        _tag: "ToolCall",
                                        name: record.name,
                                        input: record.input,
                                        output: record.output,
                                    } as const),
                                ],
                                { discard: true },
                            ),
                        );
                    };

                    const step = (): Effect.Effect<
                        string,
                        AgentLoopError | MaxIterationsReached | UserCancel | AgentStreamError
                    > =>
                        Effect.gen(function* () {
                            const state = yield* Ref.get(stateRef);
                            const cycle = state.iterationCount + 1;

                            yield* Effect.logDebug(`Starting agent cycle ${cycle}`);

                            if (state.iterationCount >= maxIterations) {
                                const lastDraft = Option.getOrElse(state.latestDraft, () => "");
                                const totalCost = yield* sessionHandle
                                    .getTotalCost()
                                    .pipe(Effect.orElseSucceed(() => 0));
                                yield* emitEvent({
                                    _tag: "IterationLimitReached",
                                    iterations: state.iterationCount,
                                    lastDraft,
                                });
                                return yield* new MaxIterationsReached({
                                    iterations: state.iterationCount,
                                    lastDraft,
                                    totalCost,
                                });
                            }

                            const isRevision = Option.isSome(state.latestDraft);
                            const latestFeedback = state.latestFeedback;

                            // Extract previously read files to provide context during revision
                            const getSourceContext = Effect.gen(function* () {
                                if (!isRevision) return undefined;
                                const toolCalls = yield* sessionHandle.getToolCalls();
                                const readCalls = toolCalls.filter(
                                    (tc) =>
                                        tc.name === "read_file" &&
                                        typeof tc.output === "string" &&
                                        typeof tc.input === "object" &&
                                        tc.input !== null &&
                                        "filePath" in tc.input,
                                );

                                // Deduplicate by filePath, keeping the latest read
                                const fileMap = new Map<string, string>();
                                for (const call of readCalls) {
                                    const path = (call.input as { filePath: string }).filePath;
                                    fileMap.set(path, call.output as string);
                                }

                                if (fileMap.size === 0) return undefined;

                                return Array.from(fileMap.entries())
                                    .map(([path, content]) => `File: ${path}\n\`\`\`\n${content}\n\`\`\``)
                                    .join("\n\n");
                            });

                            const sourceFiles = yield* getSourceContext;

                            yield* Effect.logDebug("Starting drafting phase", {
                                isRevision,
                                hasSourceContext: !!sourceFiles,
                            });

                            yield* emitEvent({
                                _tag: "Progress",
                                message: isRevision ? "Revising draft..." : "Drafting initial content...",
                                cycle,
                            });

                            if (cycle === 1 && !isRevision) {
                                yield* emitEvent({
                                    _tag: "UserInput",
                                    content: options.prompt,
                                    cycle,
                                });
                            }

                            const writerPrompt = writerTask.render({
                                goal: options.prompt,
                                context:
                                    isRevision && Option.isSome(latestFeedback)
                                        ? {
                                              draft: Option.getOrElse(state.latestDraft, () => ""),
                                              feedback: latestFeedback.value,
                                              sourceFiles,
                                          }
                                        : undefined,
                            });

                            const { content: newContent, cost: draftCost } = yield* llm
                                .streamText(
                                    {
                                        model: writerModel,
                                        system: writerTask.system,
                                        prompt: writerPrompt,
                                        tools: isRevision ? {} : explore_tools,
                                        maxSteps: MAX_STEP_COUNT,
                                    },
                                    (chunk) => {
                                        Runtime.runSync(runtime)(
                                            Effect.all(
                                                [
                                                    Queue.offer(eventQueue, {
                                                        _tag: "StreamChunk",
                                                        content: chunk,
                                                        phase: "drafting",
                                                    } as const),
                                                ],
                                                { discard: true },
                                            ),
                                        );
                                    },
                                    saveToolCall,
                                )
                                .pipe(
                                    Effect.mapError(
                                        (error) =>
                                            new AgentLoopError({
                                                cause: error,
                                                message: error.message,
                                                phase: "drafting",
                                            }),
                                    ),
                                );

                            yield* sessionHandle.addCost(draftCost);

                            yield* Ref.update(stateRef, (s) =>
                                s.add(
                                    new DraftGenerated({
                                        cycle,
                                        content: newContent,
                                        timestamp: Date.now(),
                                    }),
                                ),
                            );

                            yield* Effect.logDebug("Drafting complete", { length: newContent.length });

                            yield* emitEvent({
                                _tag: "DraftComplete",
                                content: newContent,
                                cycle,
                            });

                            yield* Effect.logDebug("Starting review phase", { cycle });
                            yield* emitEvent({
                                _tag: "Progress",
                                message: "Reviewing draft...",
                                cycle,
                            });

                            const reviewPrompt = reviewerTask.render({
                                goal: options.prompt,
                                draft: newContent,
                                sourceFiles,
                            });

                            const { result: reviewResult, cost: reviewCost } = yield* llm
                                .generateObject({
                                    model: reviewerModel,
                                    system: reviewerTask.system,
                                    prompt: reviewPrompt,
                                    tools: explore_tools,
                                    schema: ReviewResult,
                                })
                                .pipe(
                                    Effect.mapError(
                                        (error) =>
                                            new AgentLoopError({
                                                cause: error,
                                                message: error.message,
                                                phase: "reviewing",
                                            }),
                                    ),
                                );

                            yield* sessionHandle.addCost(reviewCost);

                            yield* Effect.logDebug("Review complete", { approved: reviewResult.approved });

                            yield* Ref.update(stateRef, (s) =>
                                s.add(
                                    new ReviewCompleted({
                                        cycle,
                                        approved: reviewResult.approved,
                                        critique: reviewResult.critique,
                                        reasoning: reviewResult.reasoning,
                                        timestamp: Date.now(),
                                    }),
                                ),
                            );

                            yield* emitEvent({
                                _tag: "ReviewComplete",
                                approved: reviewResult.approved,
                                critique: reviewResult.critique,
                                cycle,
                            });

                            if (!reviewResult.approved) {
                                yield* emitEvent({
                                    _tag: "Progress",
                                    message: "AI review rejected. Starting revision...",
                                    cycle,
                                });
                                return yield* step();
                            }

                            yield* emitEvent({
                                _tag: "UserActionRequired",
                                draft: newContent,
                                cycle,
                            });

                            const deferred = yield* Deferred.make<UserAction, UserCancel>();
                            yield* Ref.set(userActionDeferred, deferred);

                            const userAction = yield* Deferred.await(deferred);

                            yield* emitEvent({
                                _tag: "UserInput",
                                content:
                                    userAction.type === "approve"
                                        ? "Approved"
                                        : `Rejected: ${userAction.comment ?? "No comment"}`,
                                cycle,
                            });

                            yield* Ref.update(stateRef, (s) =>
                                s.add(
                                    new UserFeedback({
                                        action: userAction.type,
                                        comment: userAction.comment,
                                        timestamp: Date.now(),
                                    }),
                                ),
                            );

                            if (userAction.type === "reject") {
                                yield* emitEvent({
                                    _tag: "Progress",
                                    message: "User requested changes. Starting revision...",
                                    cycle,
                                });
                                return yield* step();
                            }

                            yield* emitEvent({
                                _tag: "Progress",
                                message: "Applying approved changes to project files...",
                                cycle,
                            });

                            const editPrompt = editorTask.render({
                                goal: options.prompt,
                                approvedContent: newContent,
                            });

                            const { content: _editOutput, cost: editCost } = yield* llm
                                .streamText(
                                    {
                                        model: writerModel,
                                        system: editorTask.system,
                                        prompt: editPrompt,
                                        tools: edit_tools,
                                        maxSteps: MAX_STEP_COUNT,
                                    },
                                    (chunk) => {
                                        Runtime.runSync(runtime)(
                                            Effect.all(
                                                [
                                                    Queue.offer(eventQueue, {
                                                        _tag: "StreamChunk",
                                                        content: chunk,
                                                        phase: "editing",
                                                    } as const),
                                                ],
                                                { discard: true },
                                            ),
                                        );
                                    },
                                    saveToolCall,
                                )
                                .pipe(
                                    Effect.mapError(
                                        (error) =>
                                            new AgentLoopError({
                                                cause: error,
                                                message: error.message,
                                                phase: "editing",
                                            }),
                                    ),
                                );

                            yield* sessionHandle.addCost(editCost);

                            return newContent;
                        });

                    const workflowFiber = yield* step().pipe(
                        Effect.tap((content) => sessionHandle.updateStatus("completed", content)),
                        Effect.tapError((error) =>
                            Effect.gen(function* () {
                                if (error instanceof UserCancel) {
                                    return yield* sessionHandle.updateStatus("cancelled");
                                }
                                const message = error instanceof Error ? error.message : String(error);

                                yield* emitEvent({
                                    _tag: "Error",
                                    message,
                                    cycle: 0,
                                });
                                return yield* sessionHandle
                                    .addEntry({
                                        _tag: "Error",
                                        message,
                                        phase: "phase" in error ? String(error.phase) : undefined,
                                    })
                                    .pipe(Effect.andThen(sessionHandle.updateStatus("failed")));
                            }),
                        ),
                        Effect.ensuring(
                            Queue.shutdown(eventQueue).pipe(
                                Effect.andThen(Effect.logDebug("Event queue shutdown")),
                                Effect.andThen(sessionHandle.close()),
                            ),
                        ),
                        Effect.fork,
                    );

                    return {
                        events: Stream.fromQueue(eventQueue),
                        sessionId: sessionHandle.id,
                        sessionPath: sessionHandle.path,
                        result: Effect.gen(function* () {
                            const content = yield* Fiber.join(workflowFiber);
                            const finalState = yield* Ref.get(stateRef);
                            const totalCost = yield* sessionHandle.getTotalCost().pipe(Effect.orElseSucceed(() => 0));
                            return {
                                finalContent: content,
                                iterations: finalState.iterationCount,
                                state: finalState,
                                totalCost,
                                sessionId: sessionHandle.id,
                                sessionPath: sessionHandle.path,
                            } satisfies RunResult;
                        }),

                        /**
                         * Submit user action to continue the workflow.
                         */
                        submitUserAction: (action: UserAction) =>
                            Effect.gen(function* () {
                                const deferred = yield* Ref.get(userActionDeferred);
                                if (!deferred) {
                                    return yield* new NoUserActionPending({
                                        message:
                                            "No user action is pending. The agent may have already completed or not yet reached a user feedback point.",
                                    });
                                }
                                const isDone = yield* Deferred.isDone(deferred);
                                if (isDone) {
                                    return yield* new NoUserActionPending({
                                        message: "User action was already submitted for this cycle.",
                                    });
                                }
                                yield* Deferred.succeed(deferred, action);
                            }),

                        /**
                         * Cancel the workflow and cleanup resources
                         */
                        cancel: () =>
                            Effect.gen(function* () {
                                const deferred = yield* Ref.get(userActionDeferred);
                                if (deferred) {
                                    yield* Deferred.fail(deferred, new UserCancel());
                                }
                                yield* Fiber.interrupt(workflowFiber);
                                yield* Queue.shutdown(eventQueue);
                            }),

                        /**
                         * Get the current workflow state and cost.
                         * Useful for retrieving the last draft when an error occurs.
                         */
                        getCurrentState: () =>
                            Effect.gen(function* () {
                                const workflowState = yield* Ref.get(stateRef);
                                const totalCost = yield* sessionHandle
                                    .getTotalCost()
                                    .pipe(Effect.orElseSucceed(() => 0));
                                return {
                                    workflowState,
                                    totalCost,
                                };
                            }),
                    };
                }),
        };
    }),
    dependencies: [Prompts.Default, Config.Default, Session.Default, LLM.Default, Web.Default],
}) {}
