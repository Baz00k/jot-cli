#!/usr/bin/env bun
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { cancel, confirm, intro, isCancel, log, note, outro, spinner, text } from "@clack/prompts";
import { Command } from "commander";
import { Cause, Effect, Exit, Schema } from "effect";
import { ResearchAgent, reasoningOptions } from "./agent.js";
import { getApiKeySetupMessage, getConfigLocation, getOpenRouterApiKey, setOpenRouterApiKey } from "./config.js";
import { DEFAULT_MODEL_REVIEWER, DEFAULT_MODEL_WRITER } from "./constants.js";
import { fitToTerminalWidth, formatWindow } from "./text-utils.js";

class UserCancel {
    readonly _tag = "UserCancel";
}

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

const program = new Command();

program.name("jot").description("AI Research Assistant CLI").version("0.0.2");

const configCommand = program.command("config").description("Manage jot-cli configuration");

configCommand
    .command("set-key")
    .description("Set your OpenRouter API key")
    .argument("<api-key>", "Your OpenRouter API key")
    .action(async (apiKey) => {
        intro(`🔑 Jot CLI - Configuration`);

        try {
            await setOpenRouterApiKey(apiKey);
            outro(`API key saved successfully at: ${getConfigLocation()}`);
        } catch (error) {
            if (error instanceof Error) {
                outro(`Failed to save API key: ${error.message}`);
            } else {
                outro(`Failed to save API key: ${error}`);
            }
            process.exit(1);
        }
    });

configCommand
    .command("show-path")
    .description("Show the configuration file location")
    .action(() => {
        console.log(getConfigLocation());
    });

configCommand
    .command("status")
    .description("Check if API key is configured")
    .action(async () => {
        const apiKey = await getOpenRouterApiKey();
        if (apiKey) {
            console.log("✓ API key is configured");
            console.log(`Config location: ${getConfigLocation()}`);
        } else {
            console.log("✗ API key is not configured");
            console.log("");
            console.log(getApiKeySetupMessage());
        }
    });

program
    .command("write")
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

                const appendOrOverwrite = yield* _(
                    runPrompt(() =>
                        confirm({
                            message: `Do you want to APPEND to ${filePath}? (No = Overwrite)`,
                        }),
                    ),
                );

                yield* _(Effect.sync(() => s.start("Saving file...")));

                let contentToWrite = result.finalContent;
                if (appendOrOverwrite) {
                    try {
                        const current = yield* _(
                            Effect.tryPromise({
                                try: () => fs.readFile(path.resolve(filePath as string), "utf-8"),
                                catch: () => null, // Ignore read error (file doesn't exist)
                            }),
                        );
                        if (current) {
                            contentToWrite = `${current}\n\n${result.finalContent}`;
                        }
                    } catch {
                        // Ignore
                    }
                }

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

program.parse();
