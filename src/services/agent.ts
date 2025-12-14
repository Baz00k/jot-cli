import { FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type LanguageModel, stepCountIs, streamText } from "ai";
import { Effect, Fiber, Queue, Schedule, Schema, Stream } from "effect";
import { DEFAULT_MODEL_REVIEWER, DEFAULT_MODEL_WRITER, MAX_STEP_COUNT } from "@/domain/constants";
import { AgentStreamError, FileWriteError } from "@/domain/errors";
import { Config } from "@/services/config";
import { Prompts } from "@/services/prompts";
import { tools } from "@/tools";

export const reasoningOptions = Schema.Literal("low", "medium", "high");

export interface WorkflowStep {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly modelType: "writer" | "reviewer";
    readonly enableTools: boolean;
    readonly promptTemplate: (context: WorkflowContext) => string;
}

export interface WorkflowContext {
    readonly userPrompt: string;
    readonly stepResults: ReadonlyMap<string, string>;
}

export type AgentEvent =
    | {
          readonly _tag: "ProgressUpdate";
          readonly message: string;
          readonly stepId: string;
          readonly stepName: string;
          readonly stepNumber: number;
          readonly totalSteps: number;
      }
    | {
          readonly _tag: "StreamChunk";
          readonly content: string;
          readonly stepId: string;
      }
    | {
          readonly _tag: "StepComplete";
          readonly stepId: string;
          readonly stepName: string;
          readonly content: string;
      };

export interface RunOptions {
    prompt: string;
    modelWriter?: string;
    modelReviewer?: string;
    reasoning?: boolean;
    reasoningEffort?: Schema.Schema.Type<typeof reasoningOptions>;
    workflow?: ReadonlyArray<WorkflowStep>;
}

export interface StepResult {
    readonly stepId: string;
    readonly stepName: string;
    readonly content: string;
}

export interface RunResult {
    readonly steps: ReadonlyArray<StepResult>;
    readonly finalContent: string;
}

const createDefaultWorkflow = (): ReadonlyArray<WorkflowStep> => [
    {
        id: "draft",
        name: "Draft",
        description: "Gathering context and drafting content",
        modelType: "writer",
        enableTools: true,
        promptTemplate: ({ userPrompt }) =>
            `Task: ${userPrompt}\n\nPlease draft the requested content. If you need to modify files, do NOT do it yet. Just return the drafted content in your final response.`,
    },
    {
        id: "review",
        name: "Review",
        description: "Reviewing content",
        modelType: "reviewer",
        enableTools: false,
        promptTemplate: ({ userPrompt, stepResults }) => {
            const draft = stepResults.get("draft") ?? "";
            return `Original Request: ${userPrompt}\n\nDraft to review:\n\n${draft}`;
        },
    },
    {
        id: "refine",
        name: "Refine",
        description: "Refining content based on review",
        modelType: "writer",
        enableTools: false,
        promptTemplate: ({ userPrompt, stepResults }) => {
            const draft = stepResults.get("draft") ?? "";
            const review = stepResults.get("review") ?? "";
            return `Original Task: ${userPrompt}\n\nOriginal Draft:\n${draft}\n\nReviewer Comments:\n${review}\n\nPlease rewrite the draft to address the reviewer's comments. Provide the FINAL improved text.`;
        },
    },
];

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

const runStep = (params: Parameters<typeof streamText>[0], eventQueue: Queue.Queue<AgentEvent>, stepId: string) =>
    Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
            try: async () => {
                const result = streamText(params);

                for await (const chunk of result.textStream) {
                    await Effect.runPromise(
                        Queue.offer(eventQueue, {
                            _tag: "StreamChunk",
                            content: chunk,
                            stepId,
                        } as const),
                    );
                }

                const text = await result.text;
                if (!text || text.trim().length === 0) {
                    throw new Error("Generation failed: Empty response received.");
                }
                return text;
            },
            catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        });

        return result;
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

                    const workflow = options.workflow ?? createDefaultWorkflow();
                    const totalSteps = workflow.length;

                    const eventQueue = yield* Queue.unbounded<AgentEvent>();

                    const workflowFiber = yield* Effect.gen(function* () {
                        const stepResults = new Map<string, string>();
                        const results: Array<StepResult> = [];

                        for (let i = 0; i < workflow.length; i++) {
                            const step = workflow[i];
                            if (!step) continue;

                            const stepNumber = i + 1;

                            yield* Queue.offer(eventQueue, {
                                _tag: "ProgressUpdate",
                                message: step.description,
                                stepId: step.id,
                                stepName: step.name,
                                stepNumber,
                                totalSteps,
                            } as const);

                            const model = step.modelType === "writer" ? writerModel : reviewerModel;
                            const systemPrompt = step.modelType === "writer" ? writerPrompt : reviewerPrompt;

                            const context: WorkflowContext = {
                                userPrompt: options.prompt,
                                stepResults,
                            };

                            const prompt = step.promptTemplate(context);

                            const content = yield* runStep(
                                {
                                    model,
                                    tools: step.enableTools ? tools : undefined,
                                    stopWhen: step.enableTools ? stepCountIs(MAX_STEP_COUNT) : undefined,
                                    system: systemPrompt,
                                    prompt,
                                },
                                eventQueue,
                                step.id,
                            );

                            stepResults.set(step.id, content);
                            results.push({
                                stepId: step.id,
                                stepName: step.name,
                                content,
                            });

                            yield* Queue.offer(eventQueue, {
                                _tag: "StepComplete",
                                stepId: step.id,
                                stepName: step.name,
                                content,
                            } as const);
                        }

                        yield* Queue.shutdown(eventQueue);

                        const finalContent = results[results.length - 1]?.content ?? "";

                        return {
                            steps: results,
                            finalContent,
                        } satisfies RunResult;
                    }).pipe(Effect.fork);

                    return {
                        events: Stream.fromQueue(eventQueue),
                        result: Fiber.join(workflowFiber),
                    };
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
}) {}
