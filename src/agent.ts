import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type LanguageModel, stepCountIs, streamText } from "ai";
import { Effect, Schedule, Schema } from "effect";
import { DEFAULT_MODEL_REVIEWER, DEFAULT_MODEL_WRITER, MAX_STEP_COUNT } from "@/domain/constants";
import { Prompts } from "@/services/prompts.ts";
import { safePath, tools } from "@/tools";

export const reasoningOptions = Schema.Literal("low", "medium", "high");

export interface AgentOptions {
    prompt: string;
    modelWriter?: string;
    modelReviewer?: string;
    openRouterApiKey: string;
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
        const openrouter = createOpenRouter({
            apiKey: options.openRouterApiKey,
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
            const prompts = yield* Prompts;
            const writerPrompt = yield* prompts.get("writer");
            const reviewerPrompt = yield* prompts.get("reviewer");

            // Step 1: Draft with Context Gathering (Tools enabled)
            if (this.onProgress) this.onProgress("Gathering context and drafting content...");

            const draft = yield* this.runStepEffect({
                model: this.writerModel,
                tools: tools,
                stopWhen: stepCountIs(MAX_STEP_COUNT),
                system: writerPrompt,
                prompt: `Task: ${this.prompt}\n\nPlease draft the requested content. If you need to modify files, do NOT do it yet. Just return the drafted content in your final response.`,
            });

            if (this.onProgress) this.onProgress("Draft complete. Reviewing content...");

            // Step 2: Review
            const review = yield* this.runStepEffect({
                model: this.reviewerModel,
                system: reviewerPrompt,
                prompt: `Original Request: ${this.prompt}\n\nDraft to review:\n\n${draft}`,
            });

            if (this.onProgress) this.onProgress("Review complete. Refining content...");

            // Step 3: Refine (without tools to prevent accidental file modifications)
            const finalContent = yield* this.runStepEffect({
                model: this.writerModel,
                system: writerPrompt,
                prompt: `Original Task: ${this.prompt}\n\nOriginal Draft:\n${draft}\n\nReviewer Comments:\n${review}\n\nPlease rewrite the draft to address the reviewer's comments. Provide the FINAL improved text.`,
            });

            return {
                draft,
                review,
                finalContent,
            };
        }).pipe(Effect.catchAll((error) => Effect.fail(error)));
    }

    // Separate method to execute the write if the user approves
    async executeWrite(filePath: string, content: string) {
        const targetPath = safePath(filePath);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, content, "utf-8");
    }
}
