import { DEFAULT_MODEL_REVIEWER, DEFAULT_MODEL_WRITER, MAX_STEP_COUNT } from "@/domain/constants";
import { AgentLoopError, AgentStreamError, FileWriteError, MaxIterationsReached, UserCancel } from "@/domain/errors";
import { DraftGenerated, ReviewCompleted, ReviewResult, UserFeedback, WorkflowState } from "@/domain/workflow";
import { Config } from "@/services/config";
import { Prompts } from "@/services/prompts";
import { tools } from "@/tools";
import { FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject, jsonSchema, type LanguageModel, stepCountIs, streamText } from "ai";
import { Deferred, Effect, Fiber, JSONSchema, Option, Queue, Ref, Schedule, Schema, Stream } from "effect";

// Create JSON schema for AI SDK from Effect Schema
const reviewResultJsonSchema = jsonSchema<Schema.Schema.Type<typeof ReviewResult>>(JSONSchema.make(ReviewResult));

// ============================================================================
// Types
// ============================================================================

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
          readonly phase: "drafting" | "reviewing";
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

// ============================================================================
// Model Creation
// ============================================================================

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

// ============================================================================
// LLM Interaction Helpers
// ============================================================================

const runStreamingGeneration = (
    params: Parameters<typeof streamText>[0],
    eventQueue: Queue.Queue<AgentEvent>,
    phase: "drafting" | "reviewing",
) =>
    Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
            try: async () => {
                const response = streamText(params);

                for await (const chunk of response.textStream) {
                    await Effect.runPromise(
                        Queue.offer(eventQueue, {
                            _tag: "StreamChunk",
                            content: chunk,
                            phase,
                        } as const),
                    );
                }

                const text = await response.text;
                if (!text || text.trim().length === 0) {
                    throw new Error("Generation failed: Empty response received.");
                }
                return text;
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
                    phase,
                }),
        ),
    );

const runStructuredGeneration = (model: LanguageModel, system: string, prompt: string) =>
    Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
            try: async () => {
                const response = await generateObject({
                    model,
                    schema: reviewResultJsonSchema,
                    system,
                    prompt,
                });
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

// ============================================================================
// Agent Service
// ============================================================================

export class Agent extends Effect.Service<Agent>()("services/agent", {
    effect: Effect.gen(function* () {
        const prompts = yield* Prompts;
        const config = yield* Config;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        return {
            /**
             * Run the autonomous agent loop.
             * Returns a stream of events and a result promise.
             */
            run: (options: RunOptions) =>
                Effect.gen(function* () {
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

                            yield* Queue.offer(eventQueue, {
                                _tag: "Progress",
                                message: isRevision
                                    ? `Revising draft (cycle ${cycle})...`
                                    : "Drafting initial content...",
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
                                    tools: isRevision ? undefined : tools,
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

                            yield* Queue.offer(eventQueue, {
                                _tag: "DraftComplete",
                                content: newContent,
                                cycle,
                            });

                            // 3. Review Phase
                            yield* Queue.offer(eventQueue, {
                                _tag: "Progress",
                                message: `Reviewing draft (cycle ${cycle})...`,
                                cycle,
                            });

                            const reviewPrompt = reviewerTask.render({
                                goal: options.prompt,
                                draft: newContent,
                            });

                            const reviewResult = yield* runStructuredGeneration(
                                reviewerModel,
                                reviewerTask.system,
                                reviewPrompt,
                            );

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

                            // Success - workflow complete
                            return newContent;
                        });

                    // Fork the workflow
                    const workflowFiber = yield* step().pipe(
                        Effect.tap(() => Queue.shutdown(eventQueue)),
                        Effect.tapError(() => Queue.shutdown(eventQueue)),
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
                         * Submit user action to continue the workflow
                         */
                        submitUserAction: (action: UserAction) =>
                            Effect.gen(function* () {
                                const deferred = yield* Ref.get(userActionDeferred);
                                if (deferred) {
                                    yield* Deferred.succeed(deferred, action);
                                }
                            }),
                        /**
                         * Cancel the workflow
                         */
                        cancel: () =>
                            Effect.gen(function* () {
                                const deferred = yield* Ref.get(userActionDeferred);
                                if (deferred) {
                                    yield* Deferred.fail(deferred, new UserCancel());
                                }
                                yield* Fiber.interrupt(workflowFiber);
                            }),
                    };
                }),

            /**
             * Execute a file write operation with safety checks
             */
            executeWrite: (filePath: string, content: string) =>
                Effect.gen(function* () {
                    const cwd = process.cwd();
                    const resolved = path.resolve(filePath);
                    const normalizedResolved = path.normalize(resolved).toLowerCase();
                    const normalizedCwd = path.normalize(cwd).toLowerCase();

                    if (!normalizedResolved.startsWith(normalizedCwd)) {
                        return yield* Effect.fail(
                            new FileWriteError({
                                cause: `Path ${resolved} is outside working directory ${cwd}`,
                                message: `Access denied: ${resolved} is outside of current working directory ${cwd}`,
                            }),
                        );
                    }

                    const targetPath = resolved;
                    const dir = path.dirname(targetPath);

                    yield* fs
                        .makeDirectory(dir, { recursive: true })
                        .pipe(
                            Effect.catchAll((error) =>
                                Effect.fail(
                                    new FileWriteError({ cause: error, message: "Failed to create directory" }),
                                ),
                            ),
                        );

                    yield* fs
                        .writeFileString(targetPath, content)
                        .pipe(
                            Effect.catchAll((error) =>
                                Effect.fail(new FileWriteError({ cause: error, message: "Failed to write file" })),
                            ),
                        );
                }),
        };
    }),
    dependencies: [Prompts.Default, Config.Default, BunContext.layer],
}) {}
