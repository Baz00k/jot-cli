import { cancel, intro, isCancel, log, note, outro, select, spinner, text } from "@clack/prompts";
import { Args, Command, Options } from "@effect/cli";
import { FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { Chunk, Effect, Fiber, Option, Stream } from "effect";
import {
    displayError,
    displayLastDraft,
    displaySaveSuccess,
    shouldRethrow,
    type WorkflowSnapshot,
} from "@/commands/utils/workflow-errors";
import { UserCancel, WorkflowErrorHandled } from "@/domain/errors";
import { Messages } from "@/domain/messages";
import type { FilePatch } from "@/domain/vfs";
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
 * Prompt the user to save a draft to a file.
 * Returns the file path if the user chooses to save, or undefined if they decline.
 */
const promptToSaveDraft = (
    draft: string,
): Effect.Effect<string | undefined, Error | UserCancel, FileSystem.FileSystem | Path.Path> =>
    Effect.gen(function* () {
        const shouldSave = yield* runPrompt(() =>
            select({
                message: "Would you like to save the draft to a file?",
                options: [
                    { value: "yes", label: "Yes, save to file" },
                    { value: "no", label: "No, discard" },
                ],
            }),
        );

        if (shouldSave === "no") {
            return undefined;
        }

        const defaultFileName = `draft-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5)}.md`;
        const filePath = yield* runPrompt(() =>
            text({
                message: "Enter the file path to save the draft:",
                placeholder: defaultFileName,
                defaultValue: defaultFileName,
            }),
        );

        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const fullPath = path.resolve(filePath);

        yield* fs
            .writeFileString(fullPath, draft)
            .pipe(Effect.mapError((error) => new Error(`Failed to save file: ${String(error)}`)));

        return fullPath;
    });

/**
 * Handle workflow errors by displaying error info and offering to save any draft.
 * Returns WorkflowErrorHandled to signal graceful exit, or rethrows UserCancel.
 */
const handleWorkflowError = (
    error: unknown,
    getSnapshot: () => Effect.Effect<WorkflowSnapshot>,
    s: ReturnType<typeof spinner>,
): Effect.Effect<RunResult, UserCancel | WorkflowErrorHandled, FileSystem.FileSystem | Path.Path> =>
    Effect.gen(function* () {
        yield* Effect.sync(() => s.stop());

        // User cancellation should propagate to top-level handler
        if (shouldRethrow(error)) {
            return yield* error;
        }

        // Get current state and display error
        const snapshot = yield* getSnapshot();
        yield* displayError(error);

        // Offer to save draft if one exists
        const draftOption = yield* displayLastDraft(snapshot);

        if (Option.isSome(draftOption)) {
            const savedPath = yield* promptToSaveDraft(draftOption.value).pipe(
                Effect.provide(BunContext.layer),
                Effect.catchAll(() => Effect.succeed(undefined)),
            );

            if (savedPath) {
                yield* displaySaveSuccess(savedPath, snapshot);
                return yield* new WorkflowErrorHandled({ savedPath });
            }
            yield* Effect.sync(() => log.info("Draft not saved."));
        }

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

            // Process events in the background
            const eventProcessor = yield* agentSession.events.pipe(Stream.runForEach(processEvent), Effect.fork);

            // Wait for the result - handle errors inline where we have access to agentSession
            const agentResult = yield* agentSession.result.pipe(
                Effect.catchAll((error) => handleWorkflowError(error, () => agentSession.getCurrentState(), s)),
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
