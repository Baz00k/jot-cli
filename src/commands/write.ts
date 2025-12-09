import * as fs from "node:fs/promises";
import * as path from "node:path";
import { cancel, confirm, intro, isCancel, log, note, outro, select, spinner, text } from "@clack/prompts";
import { Command } from "commander";
import { Cause, Data, Effect, Exit, Schema } from "effect";
import { ResearchAgent, reasoningOptions } from "../agent.js";
import { getApiKeySetupMessage, getOpenRouterApiKey } from "../config.js";
import { DEFAULT_MODEL_REVIEWER, DEFAULT_MODEL_WRITER } from "../constants.js";
import { fitToTerminalWidth, formatWindow } from "../text-utils.js";

class UserCancel extends Data.TaggedError("UserCancel") {}

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
    });

export const writeCommand = new Command("write")
    .description("Draft and insert research content")
    .argument("[prompt]", "The writing instruction")
    .option("-w, --writer <model>", "Model for drafting", DEFAULT_MODEL_WRITER)
    .option("-r, --reviewer <model>", "Model for reviewing", DEFAULT_MODEL_REVIEWER)
    .option("--no-reasoning", "Disable reasoning for thinking models")
    .option(
        "--reasoning-effort <effort>",
        "Effort level for reasoning (low, medium, high)",
        (val) => {
            try {
                return Schema.decodeUnknownSync(reasoningOptions)(val);
            } catch {
                throw new Error(`Invalid reasoning effort: ${val}`);
            }
        },
        "high",
    )
    .action(async (promptArg, options) => {
        const mainEffect = Effect.gen(function* (_) {
            yield* _(Effect.sync(() => intro(`📝 Jot CLI - AI Research Assistant`)));

            // Check for API key first
            const apiKey = yield* _(Effect.tryPromise(() => getOpenRouterApiKey()));
            if (!apiKey) {
                yield* _(Effect.sync(() => outro(getApiKeySetupMessage())));
                return yield* _(Effect.fail(new Error("API key not configured"))); // Exit with error to stop
            }

            let userPrompt = promptArg;

            if (!userPrompt) {
                userPrompt = yield* _(
                    runPrompt(() =>
                        text({
                            message: "What would you like me to write?",
                            placeholder: "e.g., Draft a section on the impact of transformers in NLP",
                            validate(value) {
                                if (value.length === 0) return "Value is required!";
                            },
                        }),
                    ),
                );
            }

            const s = spinner();
            yield* _(Effect.sync(() => s.start("Initializing agent...")));

            let currentWindowContent = "";

            // Initialize agent (synchronous but side-effecty constructor)
            const agent = new ResearchAgent({
                prompt: userPrompt,
                modelWriter: options.writer,
                modelReviewer: options.reviewer,
                openRouterApiKey: apiKey,
                reasoning: options.reasoning,
                onProgress: (message) => {
                    const stopMsg = currentWindowContent ? formatWindow(currentWindowContent) : "Ready";
                    s.stop(stopMsg);
                    log.step(message);
                    currentWindowContent = "";
                    s.start("...");
                },
                onStream: (chunk) => {
                    currentWindowContent += chunk;
                    s.message(formatWindow(currentWindowContent));
                },
            });

            // Run agent
            const result = yield* _(
                agent.run().pipe(
                    Effect.tapError(() => Effect.sync(() => s.stop("An error occurred"))), // Stop spinner on error
                ),
            );

            yield* _(Effect.sync(() => s.stop(formatWindow(currentWindowContent))));

            yield* _(
                Effect.sync(() => {
                    note(fitToTerminalWidth(`${result.draft.slice(0, 500)}...`), "Initial Draft (Snippet)");
                    note(fitToTerminalWidth(`${result.review.slice(0, 500)}...`), "Reviewer Feedback (Snippet)");
                    note(fitToTerminalWidth(result.finalContent), "Final Refined Content");
                }),
            );

            const shouldSave = yield* _(
                runPrompt(() =>
                    confirm({
                        message: "Do you want to save this content to a file?",
                    }),
                ),
            );

            if (shouldSave) {
                const filePath = yield* _(
                    runPrompt(() =>
                        text({
                            message: "Enter the file path to save to:",
                            placeholder: "sections/thesis.md",
                            validate(value) {
                                if (value.length === 0) return "Path is required!";
                            },
                        }),
                    ),
                );

                const fileExists = yield* _(
                    Effect.tryPromise({
                        try: async () => {
                            try {
                                await fs.access(path.resolve(filePath as string));
                                return true;
                            } catch {
                                return false;
                            }
                        },
                        catch: () => false,
                    }),
                );

                let contentToWrite = result.finalContent;

                if (fileExists) {
                    const action = yield* _(
                        runPrompt(() =>
                            select({
                                message: `File ${filePath} already exists. What would you like to do?`,
                                options: [
                                    { value: "append", label: "Append to existing content" },
                                    { value: "overwrite", label: "Overwrite file" },
                                ],
                            }),
                        ),
                    );

                    if (action === "append") {
                        const current = yield* _(
                            Effect.tryPromise({
                                try: () => fs.readFile(path.resolve(filePath as string), "utf-8"),
                                catch: () => null,
                            }),
                        );
                        if (current) {
                            contentToWrite = `${current}\n\n${result.finalContent}`;
                        }
                    }
                }

                yield* _(Effect.sync(() => s.start("Saving file...")));
                yield* _(Effect.tryPromise(() => agent.executeWrite(filePath as string, contentToWrite)));
                yield* _(Effect.sync(() => s.stop("File saved successfully!")));
            }

            yield* _(Effect.sync(() => outro("Done! Happy writing.")));
        });

        const exit = await Effect.runPromiseExit(mainEffect);

        if (Exit.isFailure(exit)) {
            const error = Cause.squash(exit.cause);
            if (error instanceof UserCancel) {
                cancel("Operation cancelled.");
                process.exit(0);
            } else {
                log.error(error instanceof Error ? error.message : String(error));
            }
            process.exit(1);
        }
    });
