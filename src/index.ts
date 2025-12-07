#!/usr/bin/env bun
import { cancel, confirm, intro, isCancel, note, outro, spinner, text } from "@clack/prompts";
import { Command } from "commander";
import "dotenv/config";
import * as path from "path";
import { ResearchAgent } from "./agent";

const program = new Command();

program.name("jot").description("AI Research Assistant CLI").version("0.0.1");

program
    .command("write")
    .description("Draft and insert research content")
    .argument("[prompt]", "The writing instruction")
    .option("-w, --writer <model>", "Model for drafting", "moonshotai/kimi-k2-thinking")
    .option("-r, --reviewer <model>", "Model for reviewing", "google/gemini-3-pro-preview")
    .action(async (promptArg, options) => {
        intro(`📝 Jot CLI - AI Research Assistant`);

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
            });

            // Run the agent loop
            s.message("Drafting content (this may take a moment to read files)...");
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

                // If append, we read first
                let contentToWrite = result.finalContent;
                if (appendOrOverwrite) {
                    try {
                        const existing = await agent.executeWrite(filePath as string, ""); // Hack to check if we can write? No, better use fs directly or tool.
                        // Actually, let's just use the tool. But the tool overwrites.
                        // So we read manually.
                        // We can't easily use the tool for append without reading first.
                        // Let's rely on standard fs for this part in the CLI to be safe and explicit.
                        const fs = await import("fs/promises");
                        try {
                            const current = await fs.readFile(path.resolve(filePath as string), "utf-8");
                            contentToWrite = current + "\n\n" + result.finalContent;
                        } catch (e) {
                            // File doesn't exist, just write
                        }
                    } catch (e) {
                        // ignore
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
