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
import { Prompts, type WriterContext } from "@/services/prompts";
import { Session, type SessionHandle } from "@/services/session";
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
      }
    | {
          readonly _tag: "StateUpdate";
          readonly files: ReadonlyArray<string>;
          readonly cost: number;
      };

export interface RunOptions {
    readonly prompt?: string;
    readonly sessionId?: string;
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
            run: Effect.fn("run")(function* (options: RunOptions) {
                const userConfig = yield* config.get;

                const maxIterations = options.maxIterations ?? userConfig.agentMaxIterations;
                const reasoning = options.reasoning ?? true;
                const reasoningEffort = options.reasoningEffort ?? "high";
                const modelWriter = options.modelWriter ?? userConfig.writerModel ?? DEFAULT_MODEL_WRITER;
                const modelReviewer = options.modelReviewer ?? userConfig.reviewerModel ?? DEFAULT_MODEL_REVIEWER;

                yield* Effect.logInfo("Starting agent run").pipe(
                    Effect.annotateLogs({
                        writer: modelWriter,
                        reviewer: modelReviewer,
                        reasoning: reasoning,
                        maxIterations: maxIterations,
                        sessionId: options.sessionId,
                    }),
                );

                const writerModel = yield* llm.createModel({
                    name: modelWriter,
                    role: "writer",
                    reasoning,
                    reasoningEffort,
                });

                const reviewerModel = yield* llm.createModel({
                    name: modelReviewer,
                    role: "reviewer",
                    reasoning,
                    reasoningEffort,
                });

                let sessionHandle: SessionHandle;
                let initialPrompt = options.prompt ?? "";
                let startCycle = 0;
                let replayCycleLimit = 0;
                let skipInitialVfsReset = false;

                let initialContext: WriterContext = {
                    filesRead: [],
                    filesModified: [],
                };
                let initialFeedback: Option.Option<string> = Option.none();

                const extractContextFromToolCall = (
                    name: string,
                    input: unknown,
                    output: unknown,
                ): Partial<WriterContext> => {
                    if (name === "read_file" && typeof input === "object" && input !== null) {
                        const filePath = (input as { filePath?: string }).filePath;
                        if (filePath) {
                            const summary =
                                typeof output === "string"
                                    ? output
                                          .split("\n")
                                          .find((l) => l.trim())
                                          ?.slice(0, 80)
                                    : undefined;
                            return { filesRead: [{ path: filePath, summary }] };
                        }
                    }
                    if (
                        (name === "write_file" || name === "edit_file") &&
                        typeof input === "object" &&
                        input !== null
                    ) {
                        const filePath = (input as { filePath?: string }).filePath;
                        if (filePath) {
                            return { filesModified: [filePath] };
                        }
                    }
                    return {};
                };

                if (options.sessionId) {
                    sessionHandle = yield* session.resume(options.sessionId).pipe(
                        Effect.mapError(
                            (error) =>
                                new AgentStreamError({
                                    cause: error,
                                    message: "message" in error ? error.message : "Failed to resume session",
                                }),
                        ),
                    );
                    const sessionData = yield* session.get(options.sessionId);
                    if (sessionData) {
                        const sessionIterations = sessionData.iterations;
                        startCycle = sessionIterations;
                        if (sessionData.status === "failed") {
                            startCycle = Math.max(0, sessionIterations - 1);
                        }

                        replayCycleLimit = sessionIterations;
                        skipInitialVfsReset = replayCycleLimit > 0;

                        let replayCycle = 0;
                        for (const entry of sessionData.entries) {
                            if (
                                entry._tag === "AgentEvent" &&
                                typeof entry.event === "object" &&
                                entry.event !== null &&
                                "cycle" in entry.event
                            ) {
                                replayCycle = (entry.event as { cycle: number }).cycle;
                            }

                            if (entry._tag === "ToolCall" && replayCycle <= replayCycleLimit) {
                                if (entry.name === "write_file") {
                                    const input = entry.input as { filePath: string; content: string };
                                    if (input?.filePath && typeof input.content === "string") {
                                        yield* vfs.writeFile(input.filePath, input.content, true).pipe(Effect.ignore);
                                    }
                                } else if (entry.name === "edit_file") {
                                    const input = entry.input as {
                                        filePath: string;
                                        oldString: string;
                                        newString: string;
                                        replaceAll?: boolean;
                                    };
                                    if (
                                        input?.filePath &&
                                        typeof input.oldString === "string" &&
                                        typeof input.newString === "string"
                                    ) {
                                        yield* vfs
                                            .editFile(
                                                input.filePath,
                                                input.oldString,
                                                input.newString,
                                                input.replaceAll ?? false,
                                            )
                                            .pipe(Effect.ignore);
                                    }
                                }
                            }
                        }

                        const promptEntry = sessionData.entries.find((e) => e._tag === "UserInput") as
                            | { prompt: string }
                            | undefined;
                        if (promptEntry) {
                            initialPrompt = promptEntry.prompt;
                        }

                        for (const entry of sessionData.entries) {
                            if (entry._tag === "ToolCall") {
                                const partial = extractContextFromToolCall(entry.name, entry.input, entry.output);
                                initialContext = {
                                    filesRead: [...initialContext.filesRead, ...(partial.filesRead ?? [])],
                                    filesModified: [...initialContext.filesModified, ...(partial.filesModified ?? [])],
                                };
                            }
                            if (
                                entry._tag === "AgentEvent" &&
                                typeof entry.event === "object" &&
                                entry.event !== null
                            ) {
                                const evt = entry.event as AgentEvent;
                                if (evt._tag === "ReviewComplete") {
                                    if (!evt.approved) {
                                        initialFeedback = Option.some(evt.critique);
                                    } else {
                                        initialFeedback = Option.none();
                                    }
                                }
                                if (evt._tag === "UserInput") {
                                    if (evt.content.startsWith("Rejected:")) {
                                        initialFeedback = Option.some(evt.content.replace("Rejected: ", ""));
                                    } else if (evt.content === "Approved") {
                                        initialFeedback = Option.none();
                                    }
                                }
                            }
                        }
                        initialContext = {
                            ...initialContext,
                            filesModified: [...new Set(initialContext.filesModified)],
                        };
                    }
                } else {
                    if (!options.prompt) {
                        return yield* new AgentStreamError({
                            message: "Prompt is required for new sessions",
                            cause: new Error("Missing prompt"),
                        });
                    }
                    initialPrompt = options.prompt;
                    sessionHandle = yield* session
                        .create({
                            prompt: options.prompt,
                            modelWriter,
                            modelReviewer,
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
                }

                yield* Effect.logDebug(`Session ID: ${sessionHandle.id}, Cycle: ${startCycle}`);

                const writerTask = yield* prompts.getWriterTask;
                const reviewerTask = yield* prompts.getReviewerTask;

                const eventQueue = yield* Queue.unbounded<AgentEvent>();
                const userActionDeferred = yield* Ref.make<Deferred.Deferred<UserAction, UserCancel> | null>(null);

                const lastFeedbackRef = yield* Ref.make<Option.Option<string>>(initialFeedback);
                const writerContextRef = yield* Ref.make<WriterContext>(initialContext);

                const writer_tools = makeWriterTools(runtime);
                const reviewer_tools = makeReviewerTools(runtime);

                const emitEvent = (event: AgentEvent) =>
                    Effect.all([Queue.offer(eventQueue, event), sessionHandle.addAgentEvent(event)], {
                        discard: true,
                    });

                const broadcastState = Effect.fn("broadcastState")(function* () {
                    const summary = yield* vfs.getSummary();
                    const cost = yield* sessionHandle.getTotalCost().pipe(Effect.orElseSucceed(() => 0));
                    yield* emitEvent({
                        _tag: "StateUpdate",
                        files: summary.files,
                        cost,
                    });
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
                                Effect.suspend(() => {
                                    const partial = extractContextFromToolCall(
                                        record.name,
                                        record.input,
                                        record.output,
                                    );
                                    const contextUpdate =
                                        Object.keys(partial).length > 0
                                            ? Ref.update(writerContextRef, (ctx) => ({
                                                  filesRead: [...ctx.filesRead, ...(partial.filesRead ?? [])],
                                                  filesModified: [
                                                      ...new Set([
                                                          ...ctx.filesModified,
                                                          ...(partial.filesModified ?? []),
                                                      ]),
                                                  ],
                                              }))
                                            : Effect.void;

                                    return Effect.all([contextUpdate, broadcastState()], { discard: true });
                                }),
                            ],
                            { discard: true },
                        ),
                    );
                };

                const step = Effect.fn("step")(function* (
                    currentCycle: number,
                ): Effect.fn.Return<
                    string,
                    | AgentStreamError
                    | AgentLoopError
                    | MaxIterationsReached
                    | UserCancel
                    | PlatformError
                    | FileReadError
                    | FileWriteError
                    | VFSError,
                    never
                > {
                    const cycle = currentCycle + 1;
                    yield* sessionHandle.updateIterations(cycle);

                    yield* Effect.logDebug(`Starting agent cycle ${cycle}`);

                    if (currentCycle === 0) {
                        yield* emitEvent({
                            _tag: "UserInput",
                            content: initialPrompt,
                            cycle,
                        });
                    }

                    if (cycle > maxIterations) {
                        const totalCost = yield* sessionHandle.getTotalCost().pipe(Effect.orElseSucceed(() => 0));
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

                    if (!isRevision && !skipInitialVfsReset) {
                        yield* vfs.reset();
                    }

                    const lastFeedback = yield* Ref.get(lastFeedbackRef);
                    const lastComments = yield* vfs.getComments();
                    const previousContext = yield* Ref.get(writerContextRef);

                    const writerPrompt = writerTask.render({
                        goal: initialPrompt,
                        latestComments: lastComments,
                        latestFeedback: lastFeedback,
                        previousContext: isRevision ? Option.some(previousContext) : Option.none(),
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
                    yield* broadcastState();

                    const summary = yield* vfs.getSummary();

                    yield* Effect.logDebug("Drafting complete", { files: summary.fileCount });

                    yield* emitEvent({
                        _tag: "DraftComplete",
                        content: _writerOutput,
                        cycle,
                    });

                    yield* emitEvent({
                        _tag: "Progress",
                        message: "Reviewer inspecting changes...",
                        cycle,
                    });

                    const diffs = yield* vfs.getDiffs();
                    const reviewPrompt = reviewerTask.render({
                        goal: initialPrompt,
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
                    yield* broadcastState();

                    const decision = yield* vfs.getDecision();
                    const comments = yield* vfs.getComments();
                    const decisionValue = Option.getOrElse(decision, () => ({
                        type: "rejected" as const,
                        message: undefined as string | undefined,
                    }));
                    const approved = decisionValue.type === "approved";

                    yield* emitEvent({
                        _tag: "ReviewComplete",
                        approved,
                        critique:
                            decisionValue.type === "rejected" && decisionValue.message
                                ? decisionValue.message
                                : `Reviewer left ${Chunk.size(comments)} comments.`,
                        cycle,
                    });

                    if (!approved) {
                        yield* emitEvent({
                            _tag: "Progress",
                            message: "AI review rejected. Starting revision...",
                            cycle,
                        });
                        yield* Ref.set(
                            lastFeedbackRef,
                            Option.some(
                                decisionValue.type === "rejected" && decisionValue.message
                                    ? decisionValue.message
                                    : "Please address the review comments.",
                            ),
                        );
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

                    const flushedFiles = yield* vfs.flush();

                    return `Applied ${flushedFiles.length} file(s): ${flushedFiles.join(", ")}`;
                });

                const workflowFiber = yield* step(startCycle).pipe(
                    Effect.tap((content) => sessionHandle.updateStatus("completed", content)),
                    Effect.tapError(
                        Effect.fn(function* (error) {
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

                    submitUserAction: Effect.fn("submitUserAction")(function* (action: UserAction) {
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

                    cancel: Effect.fn("cancel")(function* () {
                        const deferred = yield* Ref.get(userActionDeferred);
                        if (deferred) {
                            yield* Deferred.fail(deferred, new UserCancel());
                        }
                        yield* Fiber.interrupt(workflowFiber);
                        yield* Queue.shutdown(eventQueue);
                    }),

                    getCurrentState: Effect.fn("getCurrentState")(function* () {
                        const cycle = yield* sessionHandle.getIterations();
                        const totalCost = yield* sessionHandle.getTotalCost().pipe(Effect.orElseSucceed(() => 0));
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
