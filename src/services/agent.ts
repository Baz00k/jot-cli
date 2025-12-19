import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject, jsonSchema, type LanguageModel, stepCountIs, streamText } from "ai";
import { Deferred, Effect, Fiber, JSONSchema, Option, Queue, Ref, Schedule, Schema, Stream } from "effect";
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
import { Prompts } from "@/services/prompts";
import { edit_tools, explore_tools } from "@/tools";

const reviewResultJsonSchema = jsonSchema<Schema.Schema.Type<typeof ReviewResult>>(JSONSchema.make(ReviewResult));

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
}

const createModel = (
    apiKey: string,
    modelName: string,
    reasoning: boolean,
    reasoningEffort: Schema.Schema.Type<typeof reasoningOptions>,
): LanguageModel => {
    const openrouter = createOpenRouter({ apiKey });
    return openrouter(modelName, {
        reasoning: {
            effort: reasoningEffort,
            enabled: reasoning,
        },
    });
};

const runStreamingGeneration = (
    params: Parameters<typeof streamText>[0],
    eventQueue: Queue.Queue<AgentEvent>,
    phase: "drafting" | "reviewing" | "editing",
) =>
    Effect.gen(function* () {
        const response = streamText(params);

        yield* Stream.fromAsyncIterable(
            (async function* () {
                yield* response.textStream;
            })(),
            (error) => (error instanceof Error ? error : new Error(String(error))),
        ).pipe(
            Stream.runForEach((chunk) =>
                Queue.offer(eventQueue, {
                    _tag: "StreamChunk",
                    content: chunk,
                    phase,
                } as const),
            ),
        );

        // Get final text after stream completes
        const text = yield* Effect.tryPromise({
            try: () => response.text,
            catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        });

        if (!text || text.trim().length === 0) {
            return yield* Effect.fail(new Error("Generation failed: Empty response received."));
        }

        return text;
    }).pipe(
        Effect.retry({
            schedule: Schedule.exponential("1 seconds").pipe(Schedule.intersect(Schedule.recurs(3))),
            while: (error) => {
                if (error instanceof Error && "isRetryable" in error) {
                    return Boolean(error.isRetryable);
                }
                if (error instanceof Error && "statusCode" in error) {
                    const status = Number(error.statusCode);
                    if (typeof status === "number" && status >= 400 && status < 500) {
                        return false;
                    }
                }
                return true;
            },
        }),
        Effect.mapError(
            (error) =>
                new AgentLoopError({
                    cause: error,
                    message: error instanceof Error ? error.message : String(error),
                    phase,
                }),
        ),
    );

const runStructuredGeneration = (params: Parameters<typeof generateObject>[0]) =>
    Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
            try: async () => {
                const response = await generateObject(params);
                // Validate and decode using Effect Schema
                return Schema.decodeUnknownSync(ReviewResult)(response.object);
            },
            catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        });

        return result;
    }).pipe(
        Effect.retry({
            schedule: Schedule.exponential("1 seconds").pipe(Schedule.intersect(Schedule.recurs(3))),
            while: (error) => {
                if (error instanceof Error && "isRetryable" in error) {
                    return Boolean(error.isRetryable);
                }
                if (error instanceof Error && "statusCode" in error) {
                    const status = Number(error.statusCode);
                    if (typeof status === "number" && status >= 400 && status < 500) {
                        return false;
                    }
                }
                return true;
            },
        }),
        Effect.mapError(
            (error) =>
                new AgentLoopError({
                    cause: error,
                    message: error instanceof Error ? error.message : String(error),
                    phase: "reviewing",
                }),
        ),
    );

export class Agent extends Effect.Service<Agent>()("services/agent", {
    effect: Effect.gen(function* () {
        const prompts = yield* Prompts;
        const config = yield* Config;

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
                    const apiKey = userConfig.openRouterApiKey;

                    if (!apiKey) {
                        return yield* Effect.fail(
                            new AgentStreamError({
                                cause: "Missing API key",
                                message: "OpenRouter API key not configured",
                            }),
                        );
                    }

                    const maxIterations = options.maxIterations ?? userConfig.agentMaxIterations;
                    const reasoning = options.reasoning ?? true;
                    const reasoningEffort = options.reasoningEffort ?? "high";

                    const writerModel = createModel(
                        apiKey,
                        options.modelWriter ?? DEFAULT_MODEL_WRITER,
                        reasoning,
                        reasoningEffort,
                    );

                    const reviewerModel = createModel(
                        apiKey,
                        options.modelReviewer ?? DEFAULT_MODEL_REVIEWER,
                        reasoning,
                        reasoningEffort,
                    );

                    // Load prompt templates
                    const writerTask = yield* prompts.getWriterTask;
                    const reviewerTask = yield* prompts.getReviewerTask;
                    const editorTask = yield* prompts.getEditorTask;

                    // Create event queue and user action deferred
                    const eventQueue = yield* Queue.unbounded<AgentEvent>();
                    const userActionDeferred = yield* Ref.make<Deferred.Deferred<UserAction, UserCancel> | null>(null);

                    // Initialize workflow state
                    const stateRef = yield* Ref.make(WorkflowState.empty);

                    // The recursive step function
                    const step = (): Effect.Effect<
                        string,
                        AgentLoopError | MaxIterationsReached | UserCancel | AgentStreamError
                    > =>
                        Effect.gen(function* () {
                            const state = yield* Ref.get(stateRef);
                            const cycle = state.iterationCount + 1;

                            yield* Effect.logDebug(`Starting agent cycle ${cycle}`);

                            // 1. Safety Check: Max Iterations
                            if (state.iterationCount >= maxIterations) {
                                const lastDraft = Option.getOrElse(state.latestDraft, () => "");
                                yield* Queue.offer(eventQueue, {
                                    _tag: "IterationLimitReached",
                                    iterations: state.iterationCount,
                                    lastDraft,
                                });
                                return yield* Effect.fail(
                                    new MaxIterationsReached({
                                        iterations: state.iterationCount,
                                        lastDraft,
                                    }),
                                );
                            }

                            // 2. Drafting Phase
                            const isRevision = Option.isSome(state.latestDraft);
                            const latestFeedback = state.latestFeedback;

                            yield* Effect.logDebug("Starting drafting phase", { isRevision });

                            yield* Queue.offer(eventQueue, {
                                _tag: "Progress",
                                message: isRevision ? "Revising draft..." : "Drafting initial content...",
                                cycle,
                            });

                            const writerPrompt = writerTask.render({
                                goal: options.prompt,
                                context:
                                    isRevision && Option.isSome(latestFeedback)
                                        ? {
                                              draft: Option.getOrElse(state.latestDraft, () => ""),
                                              feedback: latestFeedback.value,
                                          }
                                        : undefined,
                            });

                            const newContent = yield* runStreamingGeneration(
                                {
                                    model: writerModel,
                                    tools: explore_tools,
                                    stopWhen: isRevision ? undefined : stepCountIs(MAX_STEP_COUNT),
                                    system: writerTask.system,
                                    prompt: writerPrompt,
                                },
                                eventQueue,
                                "drafting",
                            );

                            // Update state with new draft
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

                            yield* Queue.offer(eventQueue, {
                                _tag: "DraftComplete",
                                content: newContent,
                                cycle,
                            });

                            // 3. Review Phase
                            yield* Effect.logDebug("Starting review phase", { cycle });
                            yield* Queue.offer(eventQueue, {
                                _tag: "Progress",
                                message: "Reviewing draft...",
                                cycle,
                            });

                            const reviewPrompt = reviewerTask.render({
                                goal: options.prompt,
                                draft: newContent,
                            });

                            const reviewResult = yield* runStructuredGeneration({
                                model: reviewerModel,
                                system: reviewerTask.system,
                                prompt: reviewPrompt,
                                schema: reviewResultJsonSchema,
                            });

                            yield* Effect.logDebug("Review complete", { approved: reviewResult.approved });

                            // Update state with review
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

                            yield* Queue.offer(eventQueue, {
                                _tag: "ReviewComplete",
                                approved: reviewResult.approved,
                                critique: reviewResult.critique,
                                cycle,
                            });

                            // 4. Branching Logic
                            if (!reviewResult.approved) {
                                // AI rejected - recurse for revision
                                yield* Queue.offer(eventQueue, {
                                    _tag: "Progress",
                                    message: "AI review rejected. Starting revision...",
                                    cycle,
                                });
                                return yield* step();
                            }

                            // 5. User Feedback Phase (Human-in-the-loop)
                            yield* Queue.offer(eventQueue, {
                                _tag: "UserActionRequired",
                                draft: newContent,
                                cycle,
                            });

                            // Create a new deferred for user action and store it
                            const deferred = yield* Deferred.make<UserAction, UserCancel>();
                            yield* Ref.set(userActionDeferred, deferred);

                            // Wait for user decision
                            const userAction = yield* Deferred.await(deferred);

                            // Update state with user feedback
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
                                // User rejected - recurse for revision
                                yield* Queue.offer(eventQueue, {
                                    _tag: "Progress",
                                    message: "User requested changes. Starting revision...",
                                    cycle,
                                });
                                return yield* step();
                            }

                            // 6. Editing Phase
                            yield* Queue.offer(eventQueue, {
                                _tag: "Progress",
                                message: "Applying approved changes to project files...",
                                cycle,
                            });

                            const editPrompt = editorTask.render({
                                goal: options.prompt,
                                approvedContent: newContent,
                            });

                            yield* runStreamingGeneration(
                                {
                                    model: writerModel,
                                    tools: edit_tools,
                                    stopWhen: stepCountIs(MAX_STEP_COUNT),
                                    system: editorTask.system,
                                    prompt: editPrompt,
                                },
                                eventQueue,
                                "editing",
                            );

                            // Success - workflow complete
                            return newContent;
                        });

                    // Fork the workflow
                    const workflowFiber = yield* step().pipe(
                        Effect.ensuring(
                            Queue.shutdown(eventQueue).pipe(Effect.andThen(Effect.logDebug("Event queue shutdown"))),
                        ),
                        Effect.fork,
                    );

                    return {
                        events: Stream.fromQueue(eventQueue),
                        result: Effect.gen(function* () {
                            const content = yield* Fiber.join(workflowFiber);
                            const finalState = yield* Ref.get(stateRef);
                            return {
                                finalContent: content,
                                iterations: finalState.iterationCount,
                                state: finalState,
                            } satisfies RunResult;
                        }),
                        /**
                         * Submit user action to continue the workflow.
                         */
                        submitUserAction: (action: UserAction) =>
                            Effect.gen(function* () {
                                const deferred = yield* Ref.get(userActionDeferred);
                                if (!deferred) {
                                    return yield* Effect.fail(
                                        new NoUserActionPending({
                                            message:
                                                "No user action is pending. The agent may have already completed or not yet reached a user feedback point.",
                                        }),
                                    );
                                }
                                // Check if deferred is already done
                                const isDone = yield* Deferred.isDone(deferred);
                                if (isDone) {
                                    return yield* Effect.fail(
                                        new NoUserActionPending({
                                            message: "User action was already submitted for this cycle.",
                                        }),
                                    );
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
                                // Ensure queue is shutdown even if ensuring didn't run due to interruption
                                yield* Queue.shutdown(eventQueue);
                            }),
                    };
                }),
        };
    }),
    dependencies: [Prompts.Default, Config.Default],
}) {}
