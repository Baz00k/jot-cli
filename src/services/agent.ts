import type { PlatformError } from "@effect/platform/Error";
import { Chunk, Deferred, Effect, Fiber, Option, Queue, Ref, Runtime, Schema, Stream } from "effect";
import { DEFAULT_MODEL_REVIEWER, DEFAULT_MODEL_WRITER, MAX_STEP_COUNT } from "@/domain/constants";
import {
    AgentLoopError,
    AgentStreamError,
    type FileReadError,
    type FileWriteError,
    MaxIterationsReached,
    NoUserActionPending,
    UserCancel,
    type VFSError,
} from "@/domain/errors";
import type { FilePatch } from "@/domain/vfs";
import { Config } from "@/services/config";
import { LLM, type ToolCallRecord } from "@/services/llm";
import { Prompts } from "@/services/prompts";
import { Session } from "@/services/session";
import { VFS } from "@/services/vfs";
import { Web } from "@/services/web";
import { makeReviewerTools, makeWriterTools } from "@/tools";

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
          readonly diffs: ReadonlyArray<FilePatch>;
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
        const vfs = yield* VFS;
        const runtime = yield* Effect.runtime<VFS>();

        return {
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

                    const eventQueue = yield* Queue.unbounded<AgentEvent>();
                    const userActionDeferred = yield* Ref.make<Deferred.Deferred<UserAction, UserCancel> | null>(null);

                    const lastFeedbackRef = yield* Ref.make<Option.Option<string>>(Option.none());

                    const writer_tools = makeWriterTools(runtime);
                    const reviewer_tools = makeReviewerTools(runtime);

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

                    const step = (
                        currentCycle: number,
                    ): Effect.Effect<
                        string,
                        | AgentLoopError
                        | MaxIterationsReached
                        | UserCancel
                        | AgentStreamError
                        | PlatformError
                        | FileReadError
                        | FileWriteError
                        | VFSError
                    > =>
                        Effect.gen(function* () {
                            const cycle = currentCycle + 1;
                            yield* sessionHandle.updateIterations(cycle);

                            yield* Effect.logDebug(`Starting agent cycle ${cycle}`);

                            if (cycle > maxIterations) {
                                const totalCost = yield* sessionHandle
                                    .getTotalCost()
                                    .pipe(Effect.orElseSucceed(() => 0));
                                yield* emitEvent({
                                    _tag: "IterationLimitReached",
                                    iterations: cycle,
                                    lastDraft: "",
                                });
                                return yield* new MaxIterationsReached({
                                    iterations: cycle,
                                    lastDraft: "",
                                    totalCost,
                                });
                            }

                            const isRevision = cycle > 1;

                            yield* emitEvent({
                                _tag: "Progress",
                                message: isRevision ? "Revising changes..." : "Drafting changes...",
                                cycle,
                            });

                            if (!isRevision) {
                                yield* vfs.reset();
                            }

                            const lastFeedback = yield* Ref.get(lastFeedbackRef);
                            const lastComments = yield* vfs.getComments();

                            const writerPrompt = writerTask.render({
                                goal: options.prompt,
                                latestComments: lastComments,
                                latestFeedback: lastFeedback,
                            });

                            const { content: _writerOutput, cost: draftCost } = yield* llm
                                .streamText(
                                    {
                                        model: writerModel,
                                        system: writerTask.system,
                                        prompt: writerPrompt,
                                        tools: writer_tools,
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

                            const summary = yield* vfs.getSummary();

                            yield* Effect.logDebug("Drafting complete", { files: summary.fileCount });

                            yield* emitEvent({
                                _tag: "DraftComplete",
                                content: `Staged ${summary.fileCount} files.`,
                                cycle,
                            });

                            yield* emitEvent({
                                _tag: "Progress",
                                message: "Reviewer inspecting changes...",
                                cycle,
                            });

                            const diffs = yield* vfs.getDiffs();
                            const reviewPrompt = reviewerTask.render({
                                goal: options.prompt,
                                diffs,
                            });

                            const { content: _reviewOutput, cost: reviewCost } = yield* llm
                                .streamText(
                                    {
                                        model: reviewerModel,
                                        system: reviewerTask.system,
                                        prompt: reviewPrompt,
                                        tools: reviewer_tools,
                                        maxSteps: MAX_STEP_COUNT,
                                    },
                                    (chunk) => {
                                        Runtime.runSync(runtime)(
                                            Effect.all(
                                                [
                                                    Queue.offer(eventQueue, {
                                                        _tag: "StreamChunk",
                                                        content: chunk,
                                                        phase: "reviewing",
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
                                                phase: "reviewing",
                                            }),
                                    ),
                                );

                            yield* sessionHandle.addCost(reviewCost);

                            const decision = yield* vfs.getDecision();
                            const comments = yield* vfs.getComments();
                            const approved = Option.getOrElse(decision, () => "rejected") === "approved";

                            yield* emitEvent({
                                _tag: "ReviewComplete",
                                approved,
                                critique: `Reviewer left ${Chunk.size(comments)} comments.`,
                                cycle,
                            });

                            if (!approved) {
                                yield* emitEvent({
                                    _tag: "Progress",
                                    message: "AI review rejected. Starting revision...",
                                    cycle,
                                });
                                yield* Ref.set(lastFeedbackRef, Option.some("Please address the review comments."));
                                return yield* step(cycle);
                            }

                            yield* emitEvent({
                                _tag: "UserActionRequired",
                                diffs: Chunk.toArray(diffs),
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

                            if (userAction.type === "reject") {
                                yield* emitEvent({
                                    _tag: "Progress",
                                    message: "User requested changes. Starting revision...",
                                    cycle,
                                });
                                yield* Ref.set(lastFeedbackRef, Option.some(userAction.comment ?? "Please revise."));
                                return yield* step(cycle);
                            }

                            yield* emitEvent({
                                _tag: "Progress",
                                message: "Applying approved changes to project files...",
                                cycle,
                            });

                            const flushedFiles = yield* vfs.flush();

                            return `Applied ${flushedFiles.length} file(s): ${flushedFiles.join(", ")}`;
                        });

                    const workflowFiber = yield* step(0).pipe(
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
                            const cycle = yield* sessionHandle.getIterations();
                            const totalCost = yield* sessionHandle.getTotalCost().pipe(Effect.orElseSucceed(() => 0));
                            return {
                                finalContent: content,
                                iterations: cycle,
                                totalCost,
                                sessionId: sessionHandle.id,
                                sessionPath: sessionHandle.path,
                            } satisfies RunResult;
                        }),

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

                        cancel: () =>
                            Effect.gen(function* () {
                                const deferred = yield* Ref.get(userActionDeferred);
                                if (deferred) {
                                    yield* Deferred.fail(deferred, new UserCancel());
                                }
                                yield* Fiber.interrupt(workflowFiber);
                                yield* Queue.shutdown(eventQueue);
                            }),

                        getCurrentState: () =>
                            Effect.gen(function* () {
                                const cycle = yield* sessionHandle.getIterations();
                                const totalCost = yield* sessionHandle
                                    .getTotalCost()
                                    .pipe(Effect.orElseSucceed(() => 0));
                                return {
                                    cycle,
                                    totalCost,
                                };
                            }),
                    };
                }),
        };
    }),
    dependencies: [Prompts.Default, Config.Default, Session.Default, LLM.Default, Web.Default, VFS.Default],
}) {}
