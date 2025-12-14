import { FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type LanguageModel, stepCountIs, streamText } from "ai";
import { Effect, Schedule, Schema } from "effect";
import { DEFAULT_MODEL_REVIEWER, DEFAULT_MODEL_WRITER, MAX_STEP_COUNT } from "@/domain/constants";
import { AgentStreamError, FileWriteError } from "@/domain/errors";
import { Config } from "@/services/config";
import { Prompts } from "@/services/prompts";
import { tools } from "@/tools";

export const reasoningOptions = Schema.Literal("low", "medium", "high");

export interface RunOptions {
    prompt: string;
    modelWriter?: string;
    modelReviewer?: string;
    reasoning?: boolean;
    reasoningEffort?: Schema.Schema.Type<typeof reasoningOptions>;
    onProgress?: (message: string) => void;
    onStream?: (chunk: string) => void;
}

export interface RunResult {
    draft: string;
    review: string;
    finalContent: string;
}

const createModel = (
    apiKey: string,
    modelName: string,
    reasoning: boolean,
    reasoningEffort: Schema.Schema.Type<typeof reasoningOptions>,
): LanguageModel => {
    const openrouter = createOpenRouter({ apiKey });
    return openrouter(modelName, {
        reasoning: {
            effort: reasoningEffort,
            enabled: reasoning,
        },
    });
};

const runStep = (params: Parameters<typeof streamText>[0], onStream?: (chunk: string) => void) =>
    Effect.tryPromise({
        try: async () => {
            const result = streamText(params);

            for await (const chunk of result.textStream) {
                onStream?.(chunk);
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
        Effect.catchAll((error) =>
            Effect.fail(
                new AgentStreamError({
                    cause: error,
                    message: error instanceof Error ? error.message : String(error),
                }),
            ),
        ),
    );

export class Agent extends Effect.Service<Agent>()("services/agent", {
    effect: Effect.gen(function* () {
        const prompts = yield* Prompts;
        const config = yield* Config;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        return {
            run: (options: RunOptions) =>
                Effect.gen(function* () {
                    const userConfig = yield* config.get;
                    const apiKey = userConfig.openRouterApiKey;

                    if (!apiKey) {
                        return yield* Effect.fail(
                            new AgentStreamError({
                                cause: "Missing API key",
                                message: "OpenRouter API key not configured",
                            }),
                        );
                    }

                    const writerPrompt = yield* prompts.get("writer");
                    const reviewerPrompt = yield* prompts.get("reviewer");

                    const reasoning = options.reasoning ?? true;
                    const reasoningEffort = options.reasoningEffort ?? "high";

                    const writerModel = createModel(
                        apiKey,
                        options.modelWriter ?? DEFAULT_MODEL_WRITER,
                        reasoning,
                        reasoningEffort,
                    );

                    const reviewerModel = createModel(
                        apiKey,
                        options.modelReviewer ?? DEFAULT_MODEL_REVIEWER,
                        reasoning,
                        reasoningEffort,
                    );

                    // Step 1: Draft with Context Gathering (Tools enabled)
                    options.onProgress?.("Gathering context and drafting content...");

                    const draft = yield* runStep(
                        {
                            model: writerModel,
                            tools: tools,
                            stopWhen: stepCountIs(MAX_STEP_COUNT),
                            system: writerPrompt,
                            prompt: `Task: ${options.prompt}\n\nPlease draft the requested content. If you need to modify files, do NOT do it yet. Just return the drafted content in your final response.`,
                        },
                        options.onStream,
                    );

                    options.onProgress?.("Draft complete. Reviewing content...");

                    // Step 2: Review
                    const review = yield* runStep(
                        {
                            model: reviewerModel,
                            system: reviewerPrompt,
                            prompt: `Original Request: ${options.prompt}\n\nDraft to review:\n\n${draft}`,
                        },
                        options.onStream,
                    );

                    options.onProgress?.("Review complete. Refining content...");

                    // Step 3: Refine (without tools to prevent accidental file modifications)
                    const finalContent = yield* runStep(
                        {
                            model: writerModel,
                            system: writerPrompt,
                            prompt: `Original Task: ${options.prompt}\n\nOriginal Draft:\n${draft}\n\nReviewer Comments:\n${review}\n\nPlease rewrite the draft to address the reviewer's comments. Provide the FINAL improved text.`,
                        },
                        options.onStream,
                    );

                    return {
                        draft,
                        review,
                        finalContent,
                    } satisfies RunResult;
                }),

            executeWrite: (filePath: string, content: string) =>
                Effect.gen(function* () {
                    const cwd = process.cwd();
                    const resolved = path.resolve(filePath);
                    const normalizedResolved = path.normalize(resolved).toLowerCase();
                    const normalizedCwd = path.normalize(cwd).toLowerCase();

                    if (!normalizedResolved.startsWith(normalizedCwd)) {
                        return yield* Effect.fail(
                            new FileWriteError({
                                cause: `Path ${resolved} is outside working directory ${cwd}`,
                                message: `Access denied: ${resolved} is outside of current working directory ${cwd}`,
                            }),
                        );
                    }

                    const targetPath = resolved;
                    const dir = path.dirname(targetPath);

                    yield* fs
                        .makeDirectory(dir, { recursive: true })
                        .pipe(
                            Effect.catchAll((error) =>
                                Effect.fail(
                                    new FileWriteError({ cause: error, message: "Failed to create directory" }),
                                ),
                            ),
                        );

                    yield* fs
                        .writeFileString(targetPath, content)
                        .pipe(
                            Effect.catchAll((error) =>
                                Effect.fail(new FileWriteError({ cause: error, message: "Failed to write file" })),
                            ),
                        );
                }),
        };
    }),
    dependencies: [Prompts.Default, Config.Default, BunContext.layer],
    accessors: true,
}) {}
