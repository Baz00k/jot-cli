import { cancel, intro, isCancel, log, note, outro, select, spinner, text } from "@clack/prompts";
import { Args, Command, Options } from "@effect/cli";
import { Effect, Fiber, Option, Stream } from "effect";
import { DEFAULT_MAX_AGENT_ITERATIONS, DEFAULT_MODEL_REVIEWER, DEFAULT_MODEL_WRITER } from "@/domain/constants";
import { AgentLoopError, AIGenerationError, MaxIterationsReached, UserCancel } from "@/domain/errors";
import { Messages } from "@/domain/messages";
import { WorkflowState } from "@/domain/workflow";
import type { AgentEvent, RunResult, UserAction } from "@/services/agent";
import { Agent, reasoningOptions } from "@/services/agent";
import { Config } from "@/services/config";
import { formatWindow, renderMarkdown, renderMarkdownSnippet } from "@/text/utils";

const runPrompt = <T>(promptFn: () => Promise<T | symbol>) =>
    Effect.tryPromise({
        try: async () => {
            const result = await promptFn();
            if (isCancel(result)) {
                throw new UserCancel();
            }
            return result as T;
        },
        catch: (e) => (e instanceof UserCancel ? e : new Error(String(e))),
    }).pipe(
        Effect.tap(() =>
            Effect.try({
                try: () => {
                    // Clean up any remaining listeners to prevent memory leaks
                    if (process.stdin?.listenerCount("keypress") > 0) {
                        process.stdin.removeAllListeners("keypress");
                    }
                },
                catch: () => {
                    // Silently handle cleanup errors to avoid breaking the prompt flow
                },
            }).pipe(Effect.orDie),
        ),
    );

/**
 * Handle user feedback when AI review approves the draft.
 * Returns the user's decision to approve or request changes.
 */
const getUserFeedback = (draft: string, cycle: number): Effect.Effect<UserAction, UserCancel | Error> =>
    Effect.gen(function* () {
        yield* Effect.sync(() => note(renderMarkdownSnippet(draft), `Draft (Cycle ${cycle}) - Preview`));

        const action = yield* runPrompt(() =>
            select({
                message: "AI review approved this draft. What would you like to do?",
                options: [
                    { value: "approve", label: "Approve and finalize" },
                    { value: "reject", label: "Request changes" },
                    { value: "view", label: "View full draft" },
                ],
            }),
        );

        if (action === "view") {
            yield* Effect.sync(() => note(renderMarkdown(draft), "Full Draft"));
            // Re-prompt after viewing
            const finalAction = yield* runPrompt(() =>
                select({
                    message: "What would you like to do with this draft?",
                    options: [
                        { value: "approve", label: "Approve and finalize" },
                        { value: "reject", label: "Request changes" },
                    ],
                }),
            );

            if (finalAction === "reject") {
                const comment = yield* runPrompt(() =>
                    text({
                        message: "What changes would you like?",
                        placeholder: "e.g., Make the tone more formal, add more examples...",
                    }),
                );
                return { type: "reject" as const, comment };
            }
            return { type: "approve" as const };
        }

        if (action === "reject") {
            const comment = yield* runPrompt(() =>
                text({
                    message: "What changes would you like?",
                    placeholder: "e.g., Make the tone more formal, add more examples...",
                }),
            );
            return { type: "reject" as const, comment };
        }

        return { type: "approve" as const };
    });

export const writeCommand = Command.make(
    "write",
    {
        args: Args.text({ name: "prompt" }).pipe(Args.withDescription("The writing instruction"), Args.optional),
        options: Options.all({
            writer: Options.text("writer").pipe(
                Options.optional,
                Options.withAlias("w"),
                Options.withDescription("Model for drafting"),
            ),
            reviewer: Options.text("reviewer").pipe(
                Options.optional,
                Options.withAlias("r"),
                Options.withDescription("Model for reviewing"),
            ),
            noReasoning: Options.boolean("no-reasoning").pipe(
                Options.optional,
                Options.withDescription("Disable reasoning for thinking models"),
            ),
            reasoningEffort: Options.choice("reasoning-effort", reasoningOptions.literals).pipe(
                Options.optional,
                Options.withDescription("Effort level for reasoning (low, medium, high)"),
            ),
            maxIterations: Options.integer("max-iterations").pipe(
                Options.optional,
                Options.withAlias("i"),
                Options.withDescription("Maximum revision cycles"),
            ),
        }),
    },
    ({ args: promptArgOption, options }) =>
        Effect.gen(function* () {
            const config = yield* Config;
            const promptArg = Option.getOrUndefined(promptArgOption);

            yield* Effect.sync(() => intro(`Jot CLI - AI Research Assistant`));

            const userConfig = yield* config.get;
            const apiKey = userConfig.openRouterApiKey;

            if (!apiKey) {
                yield* Effect.sync(() => outro(Messages.apiKeySetup(config.location)));
                return yield* Effect.fail(new Error("API key not configured"));
            }

            let userPrompt = promptArg;

            if (!userPrompt) {
                userPrompt = yield* runPrompt(() =>
                    text({
                        message: "What would you like me to write?",
                        placeholder: "e.g., Draft a section on the impact of transformers in NLP",
                        validate(value) {
                            if (value.length === 0) return "Value is required!";
                        },
                    }),
                );
            }

            const agent = yield* Agent;
            const s = spinner();
            yield* Effect.sync(() => s.start("Initializing agent..."));

            let currentWindowContent = "";

            const agentSession = yield* agent.run({
                prompt: userPrompt,
                modelWriter: Option.getOrElse(options.writer, () => userConfig.writerModel ?? DEFAULT_MODEL_WRITER),
                modelReviewer: Option.getOrElse(
                    options.reviewer,
                    () => userConfig.reviewerModel ?? DEFAULT_MODEL_REVIEWER,
                ),
                reasoningEffort: Option.getOrElse(options.reasoningEffort, () => userConfig.reasoningEffort ?? "high"),
                reasoning: Option.map(options.noReasoning, (no) => !no).pipe(
                    Option.getOrElse(() => userConfig.reasoning ?? true),
                ),
                maxIterations: Option.getOrElse(
                    options.maxIterations,
                    () => userConfig.agentMaxIterations ?? DEFAULT_MAX_AGENT_ITERATIONS,
                ),
            });

            const processEvent = (event: AgentEvent) =>
                Effect.gen(function* () {
                    yield* Effect.logDebug(`Processing agent event: ${event._tag}`);

                    switch (event._tag) {
                        case "Progress": {
                            yield* Effect.sync(() => {
                                log.step(`[Cycle ${event.cycle}] ${event.message}`);
                                currentWindowContent = "";
                            });
                            break;
                        }
                        case "StreamChunk": {
                            currentWindowContent += event.content;
                            yield* Effect.sync(() => s.message(formatWindow(currentWindowContent)));
                            break;
                        }
                        case "DraftComplete": {
                            yield* Effect.sync(() => {
                                s.stop(formatWindow(currentWindowContent));
                                log.success("Draft complete");
                                currentWindowContent = "";
                            });
                            break;
                        }
                        case "ReviewComplete": {
                            yield* Effect.sync(() => {
                                if (event.approved) {
                                    log.success("AI review approved");
                                } else {
                                    log.warn("AI review rejected");
                                    if (event.critique) {
                                        note(renderMarkdownSnippet(event.critique), "AI Critique");
                                    }
                                }
                            });
                            break;
                        }
                        case "UserActionRequired": {
                            yield* Effect.sync(() => s.stop("Awaiting your review..."));

                            const userAction = yield* getUserFeedback(event.draft, event.cycle);

                            yield* agentSession.submitUserAction(userAction);

                            if (userAction.type === "reject") {
                                yield* Effect.sync(() => s.start("Processing your feedback..."));
                            }
                            break;
                        }
                        case "IterationLimitReached": {
                            yield* Effect.sync(() => {
                                s.stop("Iteration limit reached");
                                log.warn(`Maximum iterations (${event.iterations}) reached.`);
                            });
                            break;
                        }
                    }
                });

            // Process events in the background
            const eventProcessor = yield* agentSession.events.pipe(Stream.runForEach(processEvent), Effect.fork);

            // Wait for the result, handling MaxIterationsReached specially to allow save
            const agentResult = yield* agentSession.result.pipe(
                Effect.catchTag("MaxIterationsReached", (error) =>
                    Effect.gen(function* () {
                        yield* Effect.sync(() => {
                            s.stop("Iteration limit reached");
                            log.warn(`Maximum iterations (${error.iterations}) reached.`);
                        });

                        // Wait for remaining events to process
                        yield* Fiber.join(eventProcessor);

                        if (error.lastDraft) {
                            yield* Effect.sync(() => {
                                note(renderMarkdownSnippet(error.lastDraft ?? ""), "Last Draft");
                            });

                            return {
                                finalContent: error.lastDraft,
                                iterations: error.iterations,
                                state: WorkflowState.empty,
                                totalCost: error.totalCost ?? 0,
                            } satisfies RunResult;
                        }

                        // No draft to save - re-fail
                        return yield* Effect.fail(error);
                    }),
                ),
                Effect.tapError(() => Effect.sync(() => s.stop())),
            );

            yield* Fiber.join(eventProcessor);

            yield* Effect.sync(() => {
                s.stop("Workflow complete");
                note(renderMarkdown(agentResult.finalContent), "Final Content");
                log.info(`Completed in ${agentResult.iterations} cycle(s)`);
                log.info(`Total cost: $${agentResult.totalCost.toFixed(6)}`);
            });

            yield* Effect.sync(() => outro("Done! Happy writing."));
        }).pipe(
            Effect.catchAll((error) => {
                if (error instanceof UserCancel) {
                    cancel("Operation cancelled.");
                    return Effect.void;
                }
                if (error instanceof MaxIterationsReached) {
                    // Only reaches here if no lastDraft was available (handled above otherwise)
                    log.error("No draft was available to save.");
                    return Effect.void;
                }
                if (error instanceof AgentLoopError) {
                    const cause = error.cause;
                    if (cause instanceof AIGenerationError) {
                        const statusInfo = cause.statusCode ? ` (status ${cause.statusCode})` : "";
                        log.error(`AI generation failed${statusInfo}: ${cause.message}`);
                        if (cause.isRetryable) {
                            log.info("This error may be temporary. Please try again.");
                        }
                        return Effect.void;
                    }
                    log.error(`Agent error during ${error.phase}: ${error.message}`);
                    return Effect.void;
                }
                return Effect.fail(error);
            }),
        ),
);
