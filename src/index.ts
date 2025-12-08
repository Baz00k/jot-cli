#!/usr/bin/env bun
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { cancel, confirm, intro, isCancel, log, note, outro, spinner, text } from "@clack/prompts";
import { Command } from "commander";
import { ResearchAgent, reasoningOptions } from "./agent.js";
import { getApiKeySetupMessage, getConfigLocation, getOpenRouterApiKey, setOpenRouterApiKey } from "./config.js";
import { DEFAULT_MODEL_REVIEWER, DEFAULT_MODEL_WRITER } from "./constants.js";
import { fitToTerminalWidth, formatWindow } from "./text-utils.js";

const program = new Command();

program.name("jot").description("AI Research Assistant CLI").version("0.0.1");

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
            if (reasoningOptions.parse(val)) {
                return val;
            }
            throw new Error(`Invalid reasoning effort: ${val}`);
        },
        "high",
    )
    .action(async (promptArg, options) => {
        intro(`📝 Jot CLI - AI Research Assistant`);

        // Check for API key first
        const apiKey = await getOpenRouterApiKey();
        if (!apiKey) {
            outro(getApiKeySetupMessage());
            process.exit(1);
        }

        let userPrompt = promptArg;

        if (!userPrompt) {
            const result = await text({
                message: "What would you like me to write?",
                placeholder: "e.g., Draft a section on the impact of transformers in NLP",
                validate(value) {
                    if (value.length === 0) return "Value is required!";
                },
            });

            if (isCancel(result)) {
                cancel("Operation cancelled.");
                process.exit(0);
            }
            userPrompt = result;
        }

        const s = spinner();
        s.start("Initializing agent...");

        let currentWindowContent = "";

        try {
            const agent = new ResearchAgent({
                prompt: userPrompt,
                modelWriter: options.writer,
                modelReviewer: options.reviewer,
                openRouterApiKey: apiKey,
                reasoning: options.reasoning,
                onProgress: (message) => {
                    // Stop the previous step's spinner with its final window content
                    const stopMsg = currentWindowContent ? formatWindow(currentWindowContent) : "Ready";
                    s.stop(stopMsg);

                    // Print the new step title
                    log.step(message);

                    // Reset and start new spinner for the window
                    currentWindowContent = "";
                    s.start("...");
                },
                onStream: (chunk) => {
                    currentWindowContent += chunk;
                    s.message(formatWindow(currentWindowContent));
                },
            });

            const result = await agent.run();

            s.stop(formatWindow(currentWindowContent));

            note(fitToTerminalWidth(`${result.draft.slice(0, 500)}...`), "Initial Draft (Snippet)");
            note(fitToTerminalWidth(`${result.review.slice(0, 500)}...`), "Reviewer Feedback (Snippet)");
            note(fitToTerminalWidth(result.finalContent), "Final Refined Content");

            const shouldSave = await confirm({
                message: "Do you want to save this content to a file?",
            });

            if (isCancel(shouldSave)) {
                cancel("Operation cancelled.");
                process.exit(0);
            }

            if (shouldSave) {
                const filePath = await text({
                    message: "Enter the file path to save to:",
                    placeholder: "sections/thesis.md",
                    validate(value) {
                        if (value.length === 0) return "Path is required!";
                    },
                });

                if (isCancel(filePath)) {
                    cancel("Operation cancelled.");
                    process.exit(0);
                }

                const appendOrOverwrite = await confirm({
                    message: `Do you want to APPEND to ${filePath}? (No = Overwrite)`,
                });

                if (isCancel(appendOrOverwrite)) {
                    cancel("Operation cancelled.");
                    process.exit(0);
                }

                s.start("Saving file...");

                let contentToWrite = result.finalContent;
                if (appendOrOverwrite) {
                    try {
                        const current = await fs.readFile(path.resolve(filePath as string), "utf-8");
                        contentToWrite = `${current}\n\n${result.finalContent}`;
                    } catch (_error) {
                        // File doesn't exist, just write new content
                    }
                }

                await agent.executeWrite(filePath as string, contentToWrite);
                s.stop("File saved successfully!");
            }
        } catch (error) {
            s.stop("An error occurred");
            console.error(error);
        }

        outro("Done! Happy writing.");
    });

program.parse();
