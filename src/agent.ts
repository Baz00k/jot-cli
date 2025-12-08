import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, type LanguageModel } from "ai";
import * as fs from "fs/promises";
import * as path from "path";
import { getApiKeySetupMessage } from "./config.js";
import { safePath, tools } from "./tools.js";

export interface AgentOptions {
    prompt: string;
    modelWriter?: string;
    modelReviewer?: string;
    openRouterApiKey?: string;
    onProgress?: (message: string) => void;
}

export class ResearchAgent {
    private writerModel: LanguageModel;
    private reviewerModel: LanguageModel;
    private prompt: string;
    private onProgress?: (message: string) => void;

    constructor(options: AgentOptions) {
        const apiKey = options.openRouterApiKey;
        if (!apiKey) {
            throw new Error(getApiKeySetupMessage());
        }

        const openrouter = createOpenRouter({
            apiKey,
        });

        this.writerModel = openrouter(options.modelWriter || "moonshotai/kimi-k2-thinking");
        this.reviewerModel = openrouter(options.modelReviewer || "google/gemini-3-pro-preview");
        this.prompt = options.prompt;
        this.onProgress = options.onProgress;
    }

    private async getSystemPrompt() {
        try {
            const rules = await fs.readFile(path.join(process.cwd(), "ai-rules.md"), "utf-8");
            return `You are an expert academic research assistant.
Global Rules:
${rules}

You have access to the file system.
1. FIRST, explore the directory to understand the project structure and context using 'list_files', 'read_file', and 'search_files'.
2. Use 'search_files' to find specific content patterns across the project when needed.
3. Understand the existing writing style, bibliography, and formatting.
4. Then, perform the task requested by the user.
5. If asked to write content, draft it based on the gathered context.

Do NOT include any responses that are not directly related to the task at hand.
`;
        } catch (e) {
            return "You are an expert academic research assistant.";
        }
    }

    async run() {
        const systemPrompt = await this.getSystemPrompt();

        try {
            // Step 1: Draft with Context Gathering (Tools enabled)
            // We allow multiple steps so it can read files before answering.
            this.onProgress?.("Drafting content and gathering context...");
            const draftResponse = await generateText({
                model: this.writerModel,
                tools: tools,
                system: systemPrompt,
                prompt: `Task: ${this.prompt}\n\nPlease draft the requested content. If you need to modify files, do NOT do it yet. Just return the drafted content in your final response.`,
            });

            const draft = draftResponse.text;
            this.onProgress?.("Draft complete. Reviewing content...");

            // Step 2: Review
            const reviewResponse = await generateText({
                model: this.reviewerModel,
                system: "You are a strict academic reviewer. Critique the following text for clarity, accuracy, academic tone, and adherence to LaTeX/formatting standards if applicable. Be constructive but rigorous.",
                prompt: `Draft to review:\n\n${draft}`,
            });

            const review = reviewResponse.text;
            this.onProgress?.("Review complete. Refining content...");

            // Step 3: Refine (without tools to prevent accidental file modifications)
            const refineResponse = await generateText({
                model: this.writerModel,
                system: systemPrompt,
                prompt: `Original Draft:\n${draft}\n\nReviewer Comments:\n${review}\n\nPlease rewrite the draft to address the reviewer's comments. Provide the FINAL improved text.`,
            });

            const finalContent = refineResponse.text;

            return {
                draft,
                review,
                finalContent,
            };
        } catch (error: any) {
            if (error.message?.includes("API key")) {
                throw new Error(
                    "API authentication failed. Please verify your OpenRouter API key is correct.\n" +
                        getApiKeySetupMessage(),
                );
            }
            throw error;
        }
    }

    // Separate method to execute the write if the user approves
    async executeWrite(filePath: string, content: string) {
        const targetPath = safePath(filePath);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, content, "utf-8");
    }
}
