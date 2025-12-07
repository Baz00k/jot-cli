import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, type LanguageModel } from "ai";
import * as fs from "fs/promises";
import * as path from "path";
import { tools } from "./tools";

export interface AgentOptions {
    prompt: string;
    modelWriter?: string;
    modelReviewer?: string;
    openRouterApiKey?: string;
}

export class ResearchAgent {
    private writerModel: LanguageModel;
    private reviewerModel: LanguageModel;
    private prompt: string;

    constructor(options: AgentOptions) {
        const apiKey = options.openRouterApiKey || process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            throw new Error("OPENROUTER_API_KEY is required. Set it in .env or pass it as an option.");
        }

        const openrouter = createOpenRouter({
            apiKey,
        });

        this.writerModel = openrouter(options.modelWriter || "anthropic/claude-3.5-sonnet");
        this.reviewerModel = openrouter(options.modelReviewer || "openai/gpt-4o"); // Defaulting to robust models
        this.prompt = options.prompt;
    }

    private async getSystemPrompt() {
        try {
            const rules = await fs.readFile(path.join(process.cwd(), "ai-rules.txt"), "utf-8");
            return `You are an expert academic research assistant.
Global Rules:
${rules}

You have access to the file system.
1. FIRST, explore the directory to understand the project structure and context using 'list_files' and 'read_file'.
2. Understand the existing writing style, bibliography, and formatting.
3. Then, perform the task requested by the user.
4. If asked to write content, draft it based on the gathered context.`;
        } catch (e) {
            return "You are an expert academic research assistant.";
        }
    }

    async run() {
        const systemPrompt = await this.getSystemPrompt();

        // Step 1: Draft with Context Gathering (Tools enabled)
        // We allow multiple steps so it can read files before answering.
        console.log("--- Drafting Phase (Gathering Context & Writing) ---");
        const draftResponse = await generateText({
            model: this.writerModel,
            tools: tools,
            maxSteps: 10, // Allow exploration
            system: systemPrompt,
            prompt: `Task: ${this.prompt}\n\nPlease draft the requested content. If you need to modify files, do NOT do it yet. Just return the drafted content in your final response.`,
        });

        const draft = draftResponse.text;
        console.log("Draft generated.");

        // Step 2: Review
        console.log("--- Review Phase ---");
        const reviewResponse = await generateText({
            model: this.reviewerModel,
            system: "You are a strict academic reviewer. Critique the following text for clarity, accuracy, academic tone, and adherence to LaTeX/formatting standards if applicable. Be constructive but rigorous.",
            prompt: `Draft to review:\n\n${draft}`,
        });

        const review = reviewResponse.text;
        console.log("Review generated.");

        // Step 3: Refine
        console.log("--- Refinement Phase ---");
        const refineResponse = await generateText({
            model: this.writerModel,
            tools: tools, // Give tools back in case it needs to check something again, or mostly to write the file if we wanted, but here we just want text.
            system: systemPrompt,
            prompt: `Original Draft:\n${draft}\n\nReviewer Comments:\n${review}\n\nPlease rewrite the draft to address the reviewer's comments. Provide the FINAL improved text.`,
        });

        const finalContent = refineResponse.text;

        return {
            draft,
            review,
            finalContent,
        };
    }

    // Separate method to execute the write if the user approves
    async executeWrite(filePath: string, content: string) {
        // We can use the tool logic directly or just fs
        // Using the tool logic ensures safety check
        await tools.write_file.execute({ filePath, content });
    }
}
