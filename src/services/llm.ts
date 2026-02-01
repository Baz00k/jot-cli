import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, jsonSchema, type LanguageModel, Output, stepCountIs, streamText, type ToolSet } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { Effect, Either, JSONSchema, Layer, Option, Schedule, Schema, Stream } from "effect";
import { AIGenerationError } from "@/domain/errors";
import { getModelSettings } from "@/domain/model-settings";
import { createAntigravity } from "@/providers/antigravity";
import { Config } from "@/services/config";

export type ModelRef = LanguageModel;

export interface ModelConfig {
    readonly name: string;
    readonly role?: "writer" | "reviewer";
    readonly reasoning?: boolean;
    readonly reasoningEffort?: "low" | "medium" | "high";
}

export interface ToolCallRecord {
    readonly name: string;
    readonly input: unknown;
    readonly output: unknown;
}

export interface StreamingParams<TTools extends ToolSet = ToolSet> {
    readonly model: ModelRef;
    readonly system: string;
    readonly prompt: string;
    readonly tools?: TTools;
    readonly maxSteps?: number;
}

export interface StreamingResult {
    readonly content: string;
    readonly cost: number;
}

export interface StructuredParams<TSchema, TTools extends ToolSet = ToolSet> extends StreamingParams<TTools> {
    readonly schema: Schema.Schema<TSchema>;
}

export interface StructuredResult<T> {
    readonly result: T;
    readonly cost: number;
}

interface OpenRouterMetadata {
    readonly openrouter?: {
        readonly usage?: {
            readonly cost?: number;
            readonly totalTokens?: number;
        };
    };
}

interface ProviderMetadata {
    readonly providerMetadata?: OpenRouterMetadata;
}

const calculateCostFromMetadata = (metadata: ProviderMetadata | undefined): number => {
    const openrouterMetadata = metadata?.providerMetadata as OpenRouterMetadata | undefined;
    return openrouterMetadata?.openrouter?.usage?.cost ?? 0;
};

const calculateCostFromSteps = (steps: Array<ProviderMetadata> | undefined): number => {
    if (!steps || steps.length === 0) return 0;
    return steps.reduce((total, step) => total + calculateCostFromMetadata(step), 0);
};

const retryPolicy = Schedule.exponential("1 seconds").pipe(Schedule.intersect(Schedule.recurs(3)));

const withRetry = Effect.fn("withRetry")(<A, E extends AIGenerationError>(effect: Effect.Effect<A, E>) =>
    effect.pipe(
        Effect.tapError((error) =>
            error.isRetryable
                ? Effect.logInfo(`Retrying AI generation due to: ${error.message}`)
                : Effect.succeed(undefined),
        ),
        Effect.retry({
            schedule: retryPolicy,
            while: (error) => error.isRetryable,
        }),
    ),
);

export class LLM extends Effect.Service<LLM>()("services/llm", {
    effect: Effect.gen(function* () {
        const config = yield* Config.get;
        const apiKey = config.openRouterApiKey;
        const openaiCompatibleConfig = config.openaiCompatible;
        const openRouter = createOpenRouter({ apiKey, compatibility: "strict" });
        const antigravity = createAntigravity();

        const openaiCompatible = Option.fromNullable(openaiCompatibleConfig).pipe(
            Option.map((cfg) =>
                createOpenAICompatible({
                    name: "openai-compatible",
                    baseURL: cfg.baseUrl,
                    apiKey: cfg.apiKey,
                }),
            ),
            Option.getOrUndefined,
        );

        return {
            createModel: (modelConfig: ModelConfig): Effect.Effect<LanguageModel, AIGenerationError> =>
                Effect.gen(function* () {
                    const specificSettings = getModelSettings(modelConfig.name, modelConfig.role);
                    const parts = modelConfig.name.split("/");

                    if (parts.length < 2) {
                        return yield* new AIGenerationError({
                            cause: null,
                            message: `Invalid model name: "${modelConfig.name}". Model names must have at least 2 parts (provider/model)`,
                            isRetryable: false,
                        });
                    }

                    const provider = parts[0];
                    const modelId = parts.slice(1).join("/");

                    if (provider === "antigravity") {
                        return antigravity(modelId, {
                            reasoning: {
                                effort: modelConfig.reasoningEffort ?? "high",
                                enabled: modelConfig.reasoning ?? true,
                            },
                            ...specificSettings,
                        });
                    }

                    if (provider === "openaicompatible") {
                        if (!openaiCompatible) {
                            return yield* new AIGenerationError({
                                cause: null,
                                message:
                                    "OpenAI-compatible provider not configured. Run 'jot config set-openai-compatible' first.",
                                isRetryable: false,
                            });
                        }
                        return openaiCompatible(modelId);
                    }

                    if (!apiKey) {
                        return yield* new AIGenerationError({
                            cause: null,
                            message: "OpenRouter API key not configured",
                            isRetryable: false,
                        });
                    }

                    return openRouter(modelConfig.name, {
                        reasoning: {
                            effort: modelConfig.reasoningEffort ?? "high",
                            enabled: modelConfig.reasoning ?? true,
                        },
                        usage: { include: true },
                        ...specificSettings,
                    });
                }),

            streamText: <TTools extends ToolSet>(
                params: StreamingParams<TTools>,
                onChunk?: (chunk: string) => void,
                onToolCall?: (record: ToolCallRecord) => void,
            ): Effect.Effect<StreamingResult, AIGenerationError> =>
                Effect.gen(function* () {
                    let streamError: unknown = null;

                    const response = yield* Effect.try({
                        try: () =>
                            streamText({
                                model: params.model,
                                system: params.system,
                                prompt: params.prompt,
                                tools: params.tools,
                                stopWhen: params.maxSteps ? stepCountIs(params.maxSteps) : undefined,
                                onError: ({ error }) => {
                                    streamError = error;
                                },
                                onStepFinish: ({ toolCalls, toolResults }) => {
                                    if (!onToolCall || !toolCalls?.length) return;
                                    for (const call of toolCalls) {
                                        const result = toolResults?.find((r) => r.toolCallId === call.toolCallId);
                                        onToolCall({
                                            name: call.toolName,
                                            input: call.input,
                                            output: result?.output ?? null,
                                        });
                                    }
                                },
                            }),
                        catch: AIGenerationError.fromUnknown,
                    });

                    let accumulatedText = "";

                    if (streamError) {
                        return yield* AIGenerationError.fromUnknown(streamError);
                    }

                    yield* Stream.fromAsyncIterable(
                        (async function* () {
                            yield* response.textStream;
                        })(),
                        (error) => streamError ?? error,
                    ).pipe(
                        Stream.runForEach((chunk) => {
                            accumulatedText += chunk;
                            if (onChunk) onChunk(chunk);
                            return Effect.void;
                        }),
                        Effect.mapError((error) => AIGenerationError.fromUnknown(streamError ?? error)),
                    );

                    if (streamError) {
                        return yield* AIGenerationError.fromUnknown(streamError);
                    }

                    const steps = yield* Effect.tryPromise(() => response.steps).pipe(Effect.orElseSucceed(() => []));
                    const cost =
                        steps.length > 0
                            ? calculateCostFromSteps(steps)
                            : calculateCostFromMetadata({
                                  providerMetadata: yield* Effect.tryPromise(() => response.providerMetadata).pipe(
                                      Effect.orElseSucceed(() => undefined),
                                  ),
                              });

                    return { content: accumulatedText, cost };
                }).pipe(withRetry),

            generateObject: <TSchema, TTools extends ToolSet>(
                params: StructuredParams<TSchema, TTools>,
            ): Effect.Effect<StructuredResult<TSchema>, AIGenerationError> =>
                Effect.gen(function* () {
                    const result = yield* Effect.tryPromise({
                        try: async () => {
                            const jsonSchemaObj = JSONSchema.make(params.schema);
                            const result = await generateText({
                                model: params.model,
                                system: params.system,
                                prompt: params.prompt,
                                tools: params.tools,
                                output: Output.object({
                                    schema: () =>
                                        jsonSchema(jsonSchemaObj, {
                                            validate: (value) => {
                                                const decode = Schema.decodeUnknownEither(params.schema);
                                                const result = decode(value);
                                                return Either.match(result, {
                                                    onLeft: (error) => ({
                                                        success: false,
                                                        error,
                                                    }),
                                                    onRight: (value) => ({
                                                        success: true,
                                                        value,
                                                    }),
                                                });
                                            },
                                        }),
                                }),
                            });

                            const cost =
                                result.steps && result.steps.length > 0
                                    ? calculateCostFromSteps(result.steps)
                                    : calculateCostFromMetadata(result);

                            return {
                                result: result.output as TSchema,
                                cost,
                            };
                        },
                        catch: AIGenerationError.fromUnknown,
                    });
                    return result;
                }).pipe(withRetry),
        };
    }),
    dependencies: [Config.Default],
}) {}

export const TestLLM = new LLM({
    createModel: () => Effect.succeed(MockLanguageModelV3 as unknown as LanguageModel),
    streamText: () => Effect.succeed({ content: "Test", cost: 0 }),
    generateObject: <TSchema, TTools extends ToolSet>(params: StructuredParams<TSchema, TTools>) =>
        Effect.succeed({
            result: params.schema as TSchema,
            cost: 0,
        }),
});

export const TestLLMLayer = Layer.succeed(LLM, TestLLM);
