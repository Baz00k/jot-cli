import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type LanguageModel, stepCountIs, streamText } from "ai";
import { Effect, Schedule, Schema } from "effect";
import { getApiKeySetupMessage } from "./config.js";
import { DEFAULT_MODEL_REVIEWER, DEFAULT_MODEL_WRITER, MAX_STEP_COUNT } from "./constants.js";
import { safePath, tools } from "./tools.js";

export const reasoningOptions = Schema.Literal("low", "medium", "high");

export interface AgentOptions {
    prompt: string;
    modelWriter?: string;
    modelReviewer?: string;
    openRouterApiKey?: string;
    reasoning?: boolean;
    reasoningEffort?: Schema.Schema.Type<typeof reasoningOptions>;
    onProgress?: (message: string) => void;
    onStream?: (chunk: string) => void;
}

export class ResearchAgent {
    private writerModel: LanguageModel;
    private reviewerModel: LanguageModel;
    private prompt: string;
    private onProgress?: (message: string) => void;
    private onStream?: (chunk: string) => void;

    constructor(options: AgentOptions) {
        const apiKey = options.openRouterApiKey;
        if (!apiKey) {
            throw new Error(getApiKeySetupMessage());
        }

        const openrouter = createOpenRouter({
            apiKey,
        });

        this.writerModel = openrouter(options.modelWriter ?? DEFAULT_MODEL_WRITER, {
            reasoning: {
                effort: options.reasoningEffort ?? "high",
                enabled: options.reasoning ?? true,
            },
        });
        this.reviewerModel = openrouter(options.modelReviewer ?? DEFAULT_MODEL_REVIEWER, {
            reasoning: {
                effort: options.reasoningEffort ?? "high",
                enabled: options.reasoning ?? true,
            },
        });
        this.prompt = options.prompt;
        this.onProgress = options.onProgress;
        this.onStream = options.onStream;
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
        } catch (_error) {
            return "You are an expert academic research assistant.";
        }
    }

    private runStepEffect(params: Parameters<typeof streamText>[0]) {
        return Effect.tryPromise({
            try: async () => {
                const result = streamText(params);

                for await (const chunk of result.textStream) {
                    this.onStream?.(chunk);
                }

                const text = await result.text;
                if (!text || text.trim().length === 0) {
                    throw new Error("Generation failed: Empty response received.");
                }
                return text;
            },
            catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        }).pipe(
            Effect.retry({
                schedule: Schedule.exponential("1 seconds").pipe(Schedule.intersect(Schedule.recurs(3))),
                while: (error) => {
                    // Respect isRetryable flag from AI SDK errors
                    if (error instanceof Error && "isRetryable" in error) {
                        return Boolean(error.isRetryable);
                    }

                    // Do not retry on client errors (4xx)
                    if (error instanceof Error && "statusCode" in error) {
                        const status = Number(error.statusCode);
                        if (typeof status === "number" && status >= 400 && status < 500) {
                            return false;
                        }
                    }
                    return true;
                },
            }),
            Effect.catchAll((error) => {
                // If all retries fail, fail the effect
                return Effect.fail(error);
            }),
        );
    }

    run() {
        return Effect.gen(this, function* () {
            const systemPrompt = yield* Effect.tryPromise(() => this.getSystemPrompt());

            // Step 1: Draft with Context Gathering (Tools enabled)
            if (this.onProgress) this.onProgress("Drafting content and gathering context...");

            const draft = yield* this.runStepEffect({
                model: this.writerModel,
                tools: tools,
                stopWhen: stepCountIs(MAX_STEP_COUNT),
                system: systemPrompt,
                prompt: `Task: ${this.prompt}\n\nPlease draft the requested content. If you need to modify files, do NOT do it yet. Just return the drafted content in your final response.`,
            });

            if (this.onProgress) this.onProgress("Draft complete. Reviewing content...");

            // Step 2: Review
            const review = yield* this.runStepEffect({
                model: this.reviewerModel,
                system: "You are a strict academic reviewer. Critique the following text for clarity, accuracy, academic tone, and adherence to formatting standards if applicable. Be constructive but rigorous.",
                prompt: `Original Request: ${this.prompt}\n\nDraft to review:\n\n${draft}`,
            });

            if (this.onProgress) this.onProgress("Review complete. Refining content...");

            // Step 3: Refine (without tools to prevent accidental file modifications)
            const finalContent = yield* this.runStepEffect({
                model: this.writerModel,
                system: systemPrompt,
                prompt: `Original Task: ${this.prompt}\n\nOriginal Draft:\n${draft}\n\nReviewer Comments:\n${review}\n\nPlease rewrite the draft to address the reviewer's comments. Provide the FINAL improved text.`,
            });

            return {
                draft,
                review,
                finalContent,
            };
        }).pipe(
            Effect.catchAll((error) => {
                if (error instanceof Error && error.message?.includes("API key")) {
                    return Effect.fail(
                        new Error(
                            "API authentication failed. Please verify your OpenRouter API key is correct.\n" +
                                getApiKeySetupMessage(),
                        ),
                    );
                }
                return Effect.fail(error);
            }),
        );
    }

    // Separate method to execute the write if the user approves
    async executeWrite(filePath: string, content: string) {
        const targetPath = safePath(filePath);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, content, "utf-8");
    }
}
