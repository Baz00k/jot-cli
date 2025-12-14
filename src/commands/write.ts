import * as fs from "node:fs/promises";
import * as path from "node:path";
import { cancel, confirm, intro, isCancel, log, note, outro, select, spinner, text } from "@clack/prompts";
import { Args, Command, Options } from "@effect/cli";
import { Effect, Fiber, Option, Stream } from "effect";
import { DEFAULT_MODEL_REVIEWER, DEFAULT_MODEL_WRITER } from "@/domain/constants";
import { UserCancel } from "@/domain/errors";
import { Messages } from "@/domain/messages";
import { Agent, reasoningOptions } from "@/services/agent";
import { Config } from "@/services/config";
import { fitToTerminalWidth, formatWindow } from "@/text-utils";

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

export const writeCommand = Command.make(
    "write",
    {
        args: Args.text({ name: "prompt" }).pipe(Args.withDescription("The writing instruction"), Args.optional),
        options: Options.all({
            writer: Options.text("writer").pipe(
                Options.withAlias("w"),
                Options.withDefault(DEFAULT_MODEL_WRITER),
                Options.withDescription("Model for drafting"),
            ),
            reviewer: Options.text("reviewer").pipe(
                Options.withAlias("r"),
                Options.withDefault(DEFAULT_MODEL_REVIEWER),
                Options.withDescription("Model for reviewing"),
            ),
            noReasoning: Options.boolean("no-reasoning").pipe(
                Options.withDefault(false),
                Options.withDescription("Disable reasoning for thinking models"),
            ),
            reasoningEffort: Options.choice("reasoning-effort", reasoningOptions.literals).pipe(
                Options.withDefault("high"),
                Options.withDescription("Effort level for reasoning (low, medium, high)"),
            ),
        }),
    },
    ({ args: promptArgOption, options }) =>
        Effect.gen(function* () {
            const config = yield* Config;
            const promptArg = Option.getOrUndefined(promptArgOption);

            yield* Effect.sync(() => intro(`📝 Jot CLI - AI Research Assistant`));

            // Check for API key first
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

            const { events, result } = yield* agent.run({
                prompt: userPrompt,
                modelWriter: options.writer,
                modelReviewer: options.reviewer,
                reasoningEffort: options.reasoningEffort,
                reasoning: !options.noReasoning,
            });

            // Process events in the background
            const eventProcessor = yield* events.pipe(
                Stream.runForEach((event) =>
                    Effect.sync(() => {
                        switch (event._tag) {
                            case "ProgressUpdate": {
                                const stopMsg = currentWindowContent ? formatWindow(currentWindowContent) : "Ready";
                                s.stop(stopMsg);
                                log.step(event.message);
                                currentWindowContent = "";
                                s.start("...");
                                break;
                            }
                            case "StreamChunk": {
                                currentWindowContent += event.content;
                                s.message(formatWindow(currentWindowContent));
                                break;
                            }
                        }
                    }),
                ),
                Effect.fork,
            );

            const agentResult = yield* result.pipe(
                Effect.tapError(() => Effect.sync(() => s.stop("An error occurred"))),
            );

            // Wait for event processing to complete
            yield* Fiber.join(eventProcessor);

            yield* Effect.sync(() => s.stop(formatWindow(currentWindowContent)));

            // Display each step result
            yield* Effect.sync(() => {
                for (const step of agentResult.steps) {
                    const snippet = step.content.slice(0, 500);
                    const displayText = snippet.length < step.content.length ? `${snippet}...` : snippet;
                    note(fitToTerminalWidth(displayText), `${step.stepName} (Snippet)`);
                }

                note(fitToTerminalWidth(agentResult.finalContent), "Final Content");
            });

            const shouldSave = yield* runPrompt(() =>
                confirm({
                    message: "Do you want to save this content to a file?",
                }),
            );

            if (shouldSave) {
                const filePath = yield* runPrompt(() =>
                    text({
                        message: "Enter the file path to save to:",
                        placeholder: "sections/thesis.md",
                        validate(value) {
                            if (value.length === 0) return "Path is required!";
                        },
                    }),
                );

                const fileExists = yield* Effect.tryPromise({
                    try: async () => {
                        try {
                            await fs.access(path.resolve(filePath));
                            return true;
                        } catch {
                            return false;
                        }
                    },
                    catch: () => false,
                });

                let contentToWrite = agentResult.finalContent;

                if (fileExists) {
                    const action = yield* runPrompt(() =>
                        select({
                            message: `File ${filePath} already exists. What would you like to do?`,
                            options: [
                                { value: "append", label: "Append to existing content" },
                                { value: "overwrite", label: "Overwrite file" },
                            ],
                        }),
                    );

                    if (action === "append") {
                        const current = yield* Effect.tryPromise({
                            try: () => fs.readFile(path.resolve(filePath), "utf-8"),
                            catch: () => null,
                        });
                        if (current) {
                            contentToWrite = `${current}\n\n${agentResult.finalContent}`;
                        }
                    }
                }

                yield* Effect.sync(() => s.start("Saving file..."));
                yield* agent.executeWrite(filePath, contentToWrite);
                yield* Effect.sync(() => s.stop("File saved successfully!"));
            }

            yield* Effect.sync(() => outro("Done! Happy writing."));
        }).pipe(
            Effect.catchAll((error) => {
                if (error instanceof UserCancel) {
                    cancel("Operation cancelled.");
                    return Effect.void;
                }
                return Effect.fail(error);
            }),
        ),
);
