import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, jsonSchema, type LanguageModel, Output, stepCountIs, streamText, type ToolSet } from "ai";
import { Effect, Either, JSONSchema, Schedule, Schema, Stream } from "effect";
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

const retryPolicy = Schedule.exponential("1 seconds").pipe(Schedule.intersect(Schedule.recurs(3)));

const withRetry = <A, E extends AIGenerationError>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
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
    );

export class LLM extends Effect.Service<LLM>()("services/llm", {
    effect: Effect.gen(function* () {
        const config = yield* Config;
        const apiKey = (yield* config.get).openRouterApiKey;
        const openRouter = createOpenRouter({ apiKey });
        const antigravity = createAntigravity(config);

        return {
            createModel: (modelConfig: ModelConfig) =>
                Effect.gen(function* () {
                    const specificSettings = getModelSettings(modelConfig.name, modelConfig.role);

                    if (
                        modelConfig.name.startsWith("antigravity-") ||
                        modelConfig.name.startsWith("google/antigravity-")
                    ) {
                        return antigravity(modelConfig.name, {
                            reasoning: {
                                effort: modelConfig.reasoningEffort ?? "high",
                                enabled: modelConfig.reasoning ?? true,
                            },
                            ...specificSettings,
                        });
                    }

                    if (!apiKey) {
                        return yield* Effect.fail(
                            new AIGenerationError({
                                cause: null,
                                message: "OpenRouter API key not configured",
                                isRetryable: false,
                            }),
                        );
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
                        return yield* Effect.fail(AIGenerationError.fromUnknown(streamError));
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
                        return yield* Effect.fail(AIGenerationError.fromUnknown(streamError));
                    }

                    if (!accumulatedText || accumulatedText.trim().length === 0) {
                        return yield* Effect.fail(
                            new AIGenerationError({
                                cause: null,
                                message: "Generation failed: Empty response received.",
                                isRetryable: true,
                            }),
                        );
                    }

                    let cost = 0;
                    const metadata = (yield* Effect.tryPromise(() => response.providerMetadata).pipe(
                        Effect.orElseSucceed(() => undefined),
                    )) as OpenRouterMetadata | undefined;

                    if (metadata?.openrouter?.usage) {
                        cost = metadata.openrouter.usage.cost || 0;
                    }

                    return { content: accumulatedText, cost };
                }).pipe(withRetry),

            generateObject: <TSchema, TTools extends ToolSet>(
                params: StructuredParams<TSchema, TTools>,
            ): Effect.Effect<StructuredResult<TSchema>, AIGenerationError> =>
                Effect.gen(function* () {
                    const result = yield* Effect.tryPromise({
                        try: async () => {
                            const jsonSchemaObj = JSONSchema.make(params.schema);
                            const { output: resultOutput, providerMetadata: resultMetadata } = await generateText({
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

                            const metadata = resultMetadata as OpenRouterMetadata | undefined;
                            const cost = metadata?.openrouter?.usage?.cost || 0;
                            return {
                                result: resultOutput as TSchema,
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
