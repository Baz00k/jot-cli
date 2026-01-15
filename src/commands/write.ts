import { cancel, intro, isCancel, log, note, outro, select, spinner, text } from "@clack/prompts";
import { Args, Command, Options } from "@effect/cli";
import { Chunk, Effect, Fiber, Option, Stream } from "effect";
import { displayError, shouldRethrow } from "@/commands/utils/workflow-errors";
import { UserCancel, WorkflowErrorHandled } from "@/domain/errors";
import { Messages } from "@/domain/messages";
import type { FilePatch } from "@/domain/vfs";
import type { AgentEvent, RunResult, UserAction } from "@/services/agent";
import { Agent, reasoningOptions } from "@/services/agent";
import { Config } from "@/services/config";
import { VFS } from "@/services/vfs";
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

const formatDiffs = (diffs: ReadonlyArray<FilePatch>): string => {
    if (diffs.length === 0) return "No changes.";
    return diffs
        .map((patch) => {
            const status = patch.isNew ? " (New)" : patch.isDeleted ? " (Deleted)" : "";
            const hunks = Chunk.toArray(patch.hunks)
                .map((h) => h.content)
                .join("\n");
            return `=== ${patch.path}${status} ===\n${hunks}`;
        })
        .join("\n\n");
};

/**
 * Handle user feedback when AI review approves the draft.
 * Returns the user's decision to approve or request changes.
 */
const getUserFeedback = (
    diffs: ReadonlyArray<FilePatch>,
    cycle: number,
): Effect.Effect<UserAction, UserCancel | Error> =>
    Effect.gen(function* () {
        const diffText = formatDiffs(diffs);
        yield* Effect.sync(() => note(renderMarkdownSnippet(diffText), `Changes (Cycle ${cycle})`));

        const action = yield* runPrompt(() =>
            select({
                message: "AI review approved these changes. What would you like to do?",
                options: [
                    { value: "approve", label: "Approve and finalize" },
                    { value: "reject", label: "Request changes" },
                    { value: "view", label: "View full diffs" },
                ],
            }),
        );

        if (action === "view") {
            yield* Effect.sync(() => note(renderMarkdownSnippet(diffText), "Full Diffs"));
            // Re-prompt after viewing
            const finalAction = yield* runPrompt(() =>
                select({
                    message: "What would you like to do with these changes?",
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
                        placeholder: "e.g., Fix the typo in the header, rename the variable...",
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

/**
 * Handle workflow errors by displaying error info.
 * Returns WorkflowErrorHandled to signal graceful exit, or rethrows UserCancel.
 */
const handleWorkflowError = (
    error: unknown,
    s: ReturnType<typeof spinner>,
    vfs: VFS,
): Effect.Effect<RunResult, UserCancel | WorkflowErrorHandled> =>
    Effect.gen(function* () {
        yield* Effect.sync(() => s.stop());

        // User cancellation should propagate to top-level handler
        if (shouldRethrow(error)) {
            return yield* error;
        }

        yield* displayError(error);

        yield* vfs.getDiffs().pipe(
            Effect.flatMap((diffs) =>
                Effect.gen(function* () {
                    if (Chunk.size(diffs) > 0) {
                        const files = Chunk.map(diffs, (d) => d.path).pipe(Chunk.join(", "));
                        log.warn(`There are unsaved changes in: ${files}`);

                        const shouldSave = yield* runPrompt(() =>
                            select({
                                message: "Would you like to save these changes?",
                                options: [
                                    { value: "yes", label: "Yes, save changes" },
                                    { value: "no", label: "No, discard" },
                                ],
                            }),
                        );

                        if (shouldSave === "yes") {
                            const savedFiles = yield* vfs.flush();
                            yield* Effect.sync(() => {
                                log.success(`Saved ${savedFiles.length} file(s): ${savedFiles.join(", ")}`);
                            });
                        } else {
                            yield* Effect.sync(() => log.info("Changes discarded."));
                        }
                    }
                }),
            ),
            Effect.catchAll((e) => Effect.sync(() => log.error(`Failed to check for unsaved changes: ${e}`))),
        );

        return yield* new WorkflowErrorHandled({});
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
            const isAntigravityAvailable = userConfig.googleAntigravity !== undefined;

            if (!apiKey && !isAntigravityAvailable) {
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
            const vfs = yield* VFS;
            const s = spinner();
            yield* Effect.sync(() => s.start("Initializing agent..."));

            let currentWindowContent = "";

            const agentSession = yield* agent.run({
                prompt: userPrompt,
                modelWriter: Option.getOrUndefined(options.writer),
                modelReviewer: Option.getOrUndefined(options.reviewer),
                reasoningEffort: Option.getOrUndefined(options.reasoningEffort),
                reasoning: Option.map(options.noReasoning, (no) => !no).pipe((v) => Option.getOrUndefined(v)),
                maxIterations: Option.getOrUndefined(options.maxIterations),
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

                            const userAction = yield* getUserFeedback(event.diffs, event.cycle);

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

            const eventProcessor = yield* agentSession.events.pipe(Stream.runForEach(processEvent), Effect.fork);

            const agentResult = yield* agentSession.result.pipe(
                Effect.catchAll((error) => handleWorkflowError(error, s, vfs)),
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
                if (error instanceof WorkflowErrorHandled) {
                    return Effect.void;
                }
                return Effect.fail(error);
            }),
        ),
);
