#!/usr/bin/env bun
import { cancel, confirm, intro, isCancel, note, outro, spinner, text } from "@clack/prompts";
import { Command } from "commander";
import * as path from "path";
import { ResearchAgent } from "./agent.js";
import { getApiKeySetupMessage, getConfigLocation, getOpenRouterApiKey, setOpenRouterApiKey } from "./config.js";

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
        } catch (error: any) {
            outro(`Failed to save API key: ${error.message}`);
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
    .option("-w, --writer <model>", "Model for drafting", "moonshotai/kimi-k2-thinking")
    .option("-r, --reviewer <model>", "Model for reviewing", "google/gemini-3-pro-preview")
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
        s.start("Initializing agent and gathering context...");

        try {
            const agent = new ResearchAgent({
                prompt: userPrompt,
                modelWriter: options.writer,
                modelReviewer: options.reviewer,
                openRouterApiKey: apiKey,
                onProgress: (message) => s.message(message),
            });

            // Run the agent loop
            const result = await agent.run();

            s.stop("Drafting complete!");

            note(result.draft.slice(0, 500) + "...", "Initial Draft (Snippet)");
            note(result.review.slice(0, 500) + "...", "Reviewer Feedback (Snippet)");
            note(result.finalContent, "Final Refined Content");

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
                    placeholder: "sections/introduction.tex",
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
                    const fs = await import("fs/promises");
                    try {
                        const current = await fs.readFile(path.resolve(filePath as string), "utf-8");
                        contentToWrite = current + "\n\n" + result.finalContent;
                    } catch (e) {
                        // File doesn't exist, just write new content
                    }
                }

                await agent.executeWrite(filePath as string, contentToWrite);
                s.stop("File saved successfully!");
            }
        } catch (error: any) {
            s.stop("An error occurred");
            console.error(error);
        }

        outro("Done! Happy writing.");
    });

program.parse();
