import * as crypto from "node:crypto";
import type {
    LanguageModelV3CallOptions,
    LanguageModelV3GenerateResult,
    LanguageModelV3StreamPart,
    LanguageModelV3StreamResult,
} from "@ai-sdk/provider";
import { HttpClient, HttpClientRequest } from "@effect/platform";
import type { HttpBodyError } from "@effect/platform/HttpBody";
import { Chunk, Duration, Effect, Schedule, Stream } from "effect";
import { ANTIGRAVITY_DEFAULT_PROJECT_ID, ANTIGRAVITY_ENDPOINT_FALLBACKS, ANTIGRAVITY_HEADERS } from "./constants";
import { AntigravityAuthError, AntigravityError, AntigravityRateLimitError } from "./errors";
import { mapFinishReason, mapPromptToContents, mapTools, mapUsage, stripMarkdownCodeBlock } from "./mappers";
import type { AntigravityErrorResponse, AntigravityProviderSettings, ApiRequest, StreamChunk } from "./types";

/**
 * Generates a random request ID in the format "agent-uuid"
 */
const generateRequestID = (): string => {
    return `agent-${crypto.randomUUID()}`;
};

/**
 * Generates a session ID in the format "-{uuid}:{model}:{project}:seed-{hex}"
 */
const generateSessionID = (model: string, projectId: string): string => {
    const uuid = crypto.randomUUID();
    const seed = crypto.randomBytes(8).toString("hex");
    return `-${uuid}:${model}:${projectId}:seed-${seed}`;
};

/**
 * Maps alias model names to internal model names
 */
const alias2ModelName = (modelName: string): string => {
    switch (modelName) {
        case "gemini-2.5-computer-use-preview-10-2025":
            return "rev19-uic3-1p";
        case "gemini-3-pro-image-preview":
            return "gemini-3-pro-image";
        case "gemini-3-pro-preview":
            return "gemini-3-pro-high";
        case "gemini-3-flash-preview":
            return "gemini-3-flash";
        case "gemini-claude-sonnet-4-5":
            return "claude-sonnet-4-5";
        case "gemini-claude-sonnet-4-5-thinking":
            return "claude-sonnet-4-5-thinking";
        case "gemini-claude-opus-4-5-thinking":
            return "claude-opus-4-5-thinking";
        default:
            return modelName;
    }
};

/**
 * Clean model name by removing prefixes
 */
const cleanModelName = (modelId: string): string => {
    return modelId.replace(/^google\//, "").replace(/^antigravity-/, "");
};

/**
 * Resolve the thinkingConfig based on provider settings and call options
 */
const resolveThinkingConfig = (
    settings?: AntigravityProviderSettings,
    providerOptions?: Record<string, unknown>,
): {
    includeThoughts?: boolean;
    thinkingLevel?: string;
    thinkingBudget?: number;
} => {
    const thinkingConfig: {
        includeThoughts?: boolean;
        thinkingLevel?: string;
        thinkingBudget?: number;
    } = {};

    // Call-specific overrides from providerOptions
    const antigravityOptions = providerOptions?.["google-antigravity"] as
        | { thinkingBudget?: number; includeThoughts?: boolean; thinkingLevel?: string }
        | undefined;

    // Provider-level settings
    if (settings?.reasoning) {
        if (settings.reasoning.enabled !== false) {
            thinkingConfig.includeThoughts = true;
        }
        if (settings.reasoning.effort) {
            thinkingConfig.thinkingLevel = settings.reasoning.effort;
        }
    }

    // Legacy/fallback handling for direct providerOptions
    if (thinkingConfig.includeThoughts === undefined) {
        thinkingConfig.includeThoughts = Boolean(
            antigravityOptions?.includeThoughts ?? providerOptions?.includeThoughts ?? true,
        );
    }
    if (thinkingConfig.thinkingLevel === undefined) {
        thinkingConfig.thinkingLevel = String(
            antigravityOptions?.thinkingLevel ?? providerOptions?.thinkingLevel ?? "high",
        );
    }

    // Override with call options if budget is present
    const thinkingBudget = antigravityOptions?.thinkingBudget ?? providerOptions?.thinkingBudget;
    if (thinkingBudget) {
        thinkingConfig.thinkingBudget = Number(thinkingBudget);
        // If budget is set, clear thinkingLevel
        delete thinkingConfig.thinkingLevel;
    }

    return thinkingConfig;
};

/**
 * Build the request payload for the API
 */
const buildRequestPayload = (
    modelId: string,
    projectId: string,
    options: LanguageModelV3CallOptions,
    settings?: AntigravityProviderSettings,
): ApiRequest => {
    const cleanedModelId = cleanModelName(modelId);
    const mappedModelName = alias2ModelName(cleanedModelId);
    const { systemInstruction, contents } = mapPromptToContents(
        options.prompt,
        mappedModelName,
        options.responseFormat,
    );
    const tools = mapTools(options.tools);
    const thinkingConfig = resolveThinkingConfig(settings, options.providerOptions);

    const request: ApiRequest = {
        project: projectId,
        model: mappedModelName,
        request: {
            systemInstruction,
            contents,
            generationConfig: {
                temperature: options.temperature,
                topP: options.topP,
                maxOutputTokens: options.maxOutputTokens,
                thinkingConfig,
            },
            sessionId: generateSessionID(mappedModelName, projectId),
        },
        requestType: "agent",
        userAgent: "antigravity",
        requestId: generateRequestID(),
    };

    if (tools) {
        options.toolChoice;
        request.request.tools = tools;
        request.request.toolConfig = {
            functionCallingConfig: {
                mode: "AUTO",
            },
        };
    }

    return request;
};

/**
 * Parse retry delay and status from error response
 */
const parseErrorDetails = (errorText: string): { retryAfter?: number; resourceExhausted: boolean } => {
    try {
        const json = JSON.parse(errorText) as AntigravityErrorResponse;
        let retryAfter: number | undefined;

        const resourceExhausted = json?.error?.status === "RESOURCE_EXHAUSTED";

        // Look for google.rpc.RetryInfo
        const details = json?.error?.details;
        if (Array.isArray(details)) {
            for (const detail of details) {
                if (detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo" && detail.retryDelay) {
                    const delayStr = detail.retryDelay;
                    if (typeof delayStr === "string" && delayStr.endsWith("s")) {
                        const seconds = Number.parseFloat(delayStr.slice(0, -1));
                        if (!Number.isNaN(seconds)) {
                            retryAfter = Math.ceil(seconds * 1000);
                        }
                    }
                }
            }
        }

        return { retryAfter, resourceExhausted };
    } catch {
        return { resourceExhausted: false };
    }
};

/**
 * Execute HTTP request with endpoint fallbacks
 */
const executeRequest = (token: string, payload: ApiRequest, stream: boolean) =>
    Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;

        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: stream ? "text/event-stream" : "application/json",
            ...ANTIGRAVITY_HEADERS,
        };

        // Try each endpoint in order
        let lastError: Error | undefined;

        for (const endpoint of ANTIGRAVITY_ENDPOINT_FALLBACKS) {
            const url = `${endpoint}/v1internal:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`;

            const request = yield* HttpClientRequest.post(url).pipe(
                HttpClientRequest.setHeaders(headers),
                HttpClientRequest.bodyJson(payload),
            );

            const result = yield* Effect.either(client.execute(request));

            if (result._tag === "Left") {
                lastError = result.left as Error;
                yield* Effect.logDebug(`[Antigravity] Endpoint ${endpoint} failed, trying next...`);
                continue;
            }

            const response = result.right;

            // Handle error status codes
            if (response.status === 401 || response.status === 403) {
                const text = yield* response.text.pipe(
                    Effect.catchAll(() => Effect.succeed("Unknown authentication error")),
                );
                return yield* new AntigravityAuthError({
                    message: `Authentication failed: ${text}`,
                });
            }

            if (response.status === 429) {
                const text = yield* response.text.pipe(Effect.catchAll(() => Effect.succeed("Rate limited")));
                const { retryAfter, resourceExhausted } = parseErrorDetails(text);
                return yield* new AntigravityRateLimitError({
                    message: `Rate limit exceeded: ${text}`,
                    retryAfter,
                    resourceExhausted,
                });
            }

            if (response.status >= 400) {
                const text = yield* response.text.pipe(Effect.catchAll(() => Effect.succeed("Unknown error")));
                return yield* new AntigravityError({
                    message: `API error (${response.status}): ${text}`,
                    code: response.status,
                });
            }

            return response;
        }

        return yield* new AntigravityError({
            message: `All endpoints failed: ${lastError?.message ?? "Unknown error"}`,
            cause: lastError,
        });
    }).pipe(
        Effect.retry({
            while: (error) =>
                error instanceof AntigravityRateLimitError &&
                (Boolean(error.resourceExhausted) || error.retryAfter !== undefined),
            schedule: Schedule.identity<unknown>().pipe(
                Schedule.addDelay((e) => {
                    if (e instanceof AntigravityRateLimitError) {
                        if (e.resourceExhausted) {
                            return Duration.millis(100);
                        }
                        return Duration.millis(e.retryAfter ?? 1000);
                    }
                    return Duration.zero;
                }),
                Schedule.intersect(Schedule.recurs(3)),
            ),
        }),
    );

/**
 * Parse SSE line to extract JSON data
 */
const parseSSELine = (line: string): StreamChunk | null => {
    if (!line.startsWith("data: ")) return null;
    const data = line.slice(6).trim();
    if (data === "[DONE]" || data === "") return null;
    try {
        return JSON.parse(data) as StreamChunk;
    } catch {
        return null;
    }
};

const parseResponseStream = (
    bodyStream: Stream.Stream<Uint8Array, AntigravityError, never>,
): Stream.Stream<LanguageModelV3StreamPart, AntigravityError, never> => {
    const textId = `text-${Date.now()}`;
    const reasoningId = `reasoning-${Date.now()}`;
    let textStarted = false;
    let reasoningStarted = false;
    const toolInputBuffers = new Map<string, { name: string; input: string; started: boolean }>();
    let buffer = "";

    return Stream.fromEffect(Effect.succeed({ type: "stream-start" as const, warnings: [] })).pipe(
        Stream.concat(
            bodyStream.pipe(
                Stream.mapConcat((chunk): LanguageModelV3StreamPart[] => {
                    const text = new TextDecoder().decode(chunk);
                    buffer += text;

                    const parts: LanguageModelV3StreamPart[] = [];
                    const lines = buffer.split("\n");
                    buffer = lines.pop() ?? "";

                    for (const line of lines) {
                        const parsed = parseSSELine(line);
                        if (!parsed) continue;

                        const candidates = parsed.response?.candidates ?? parsed.candidates ?? [];
                        const usageMetadata = parsed.response?.usageMetadata ?? parsed.usageMetadata;
                        const candidate = candidates[0];
                        const apiParts = candidate?.content?.parts ?? [];

                        for (const part of apiParts) {
                            // Handle reasoning/thought
                            if (part.thought && part.text != null) {
                                if (!reasoningStarted) {
                                    parts.push({
                                        type: "reasoning-start",
                                        id: reasoningId,
                                        providerMetadata: part.thoughtSignature
                                            ? { "google-antigravity": { thoughtSignature: part.thoughtSignature } }
                                            : undefined,
                                    });
                                    reasoningStarted = true;
                                }
                                parts.push({
                                    type: "reasoning-delta",
                                    id: reasoningId,
                                    delta: part.text,
                                    providerMetadata: part.thoughtSignature
                                        ? { "google-antigravity": { thoughtSignature: part.thoughtSignature } }
                                        : undefined,
                                });
                            }
                            // Handle text
                            else if (part.text != null && !part.functionCall) {
                                if (!textStarted) {
                                    parts.push({ type: "text-start", id: textId });
                                    textStarted = true;
                                }
                                parts.push({
                                    type: "text-delta",
                                    id: textId,
                                    delta: part.text,
                                });
                            }
                            // Handle function calls
                            else if (part.functionCall) {
                                const callId =
                                    part.functionCall.id ?? `tc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                                const existing = toolInputBuffers.get(callId);

                                if (!existing) {
                                    // Start new tool input
                                    toolInputBuffers.set(callId, {
                                        name: part.functionCall.name,
                                        input: JSON.stringify(part.functionCall.args ?? {}),
                                        started: true,
                                    });
                                    parts.push({
                                        type: "tool-input-start",
                                        id: callId,
                                        toolName: part.functionCall.name,
                                        providerMetadata: part.thoughtSignature
                                            ? { "google-antigravity": { thoughtSignature: part.thoughtSignature } }
                                            : undefined,
                                    });
                                    parts.push({
                                        type: "tool-input-delta",
                                        id: callId,
                                        delta: JSON.stringify(part.functionCall.args ?? {}),
                                    });
                                    parts.push({
                                        type: "tool-input-end",
                                        id: callId,
                                    });
                                    parts.push({
                                        type: "tool-call",
                                        toolCallId: callId,
                                        toolName: part.functionCall.name,
                                        input: JSON.stringify(part.functionCall.args ?? {}),
                                        providerMetadata: part.thoughtSignature
                                            ? { "google-antigravity": { thoughtSignature: part.thoughtSignature } }
                                            : undefined,
                                    });
                                }
                            }
                        }

                        // Handle finish
                        if (candidate?.finishReason) {
                            // Close any open streams
                            if (reasoningStarted) {
                                parts.push({ type: "reasoning-end", id: reasoningId });
                            }
                            if (textStarted) {
                                parts.push({ type: "text-end", id: textId });
                            }

                            parts.push({
                                type: "finish",
                                finishReason: mapFinishReason(candidate.finishReason),
                                usage: mapUsage(usageMetadata),
                            });
                        }
                    }

                    return parts;
                }),
            ),
        ),
    );
};

/**
 * Creates a response stream from the streaming API endpoint.
 * This is the core primitive that both generateRequest and streamRequest build upon.
 */
const createResponseStream = (
    modelId: string,
    token: string,
    projectId: string,
    options: LanguageModelV3CallOptions,
    settings?: AntigravityProviderSettings,
): Effect.Effect<
    { stream: Stream.Stream<LanguageModelV3StreamPart, AntigravityError, never>; payload: ApiRequest },
    AntigravityError | AntigravityAuthError | AntigravityRateLimitError | HttpBodyError,
    HttpClient.HttpClient
> =>
    Effect.gen(function* () {
        const payload = buildRequestPayload(modelId, projectId ?? ANTIGRAVITY_DEFAULT_PROJECT_ID, options, settings);
        const response = yield* executeRequest(token, payload, true);

        const bodyStream = response.stream.pipe(
            Stream.mapError(
                (e) =>
                    new AntigravityError({
                        message: `Stream error: ${e}`,
                        cause: e,
                    }),
            ),
        );

        const partStream = parseResponseStream(bodyStream);
        return { stream: partStream, payload };
    });

/**
 * Aggregates stream parts into a complete generate result.
 * Handles text, reasoning, tool calls, usage, and finish reason.
 */
const aggregateStreamParts = (
    parts: readonly LanguageModelV3StreamPart[],
    payload: ApiRequest,
    isJsonResponse: boolean,
): LanguageModelV3GenerateResult => {
    let text = "";
    let reasoning = "";
    let finishReason: LanguageModelV3GenerateResult["finishReason"] = {
        unified: "other",
        raw: "unknown",
    };
    let usage: LanguageModelV3GenerateResult["usage"] = {
        inputTokens: {
            total: 0,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
        },
        outputTokens: {
            total: 0,
            text: 0,
            reasoning: 0,
        },
    };
    const toolCalls: Record<string, { name: string; args: string }> = {};

    for (const part of parts) {
        switch (part.type) {
            case "text-delta":
                text += part.delta;
                break;
            case "reasoning-delta":
                reasoning += part.delta;
                break;
            case "tool-call":
                toolCalls[part.toolCallId] = {
                    name: part.toolName,
                    args: part.input,
                };
                break;
            case "finish":
                finishReason = part.finishReason;
                usage = part.usage;
                break;
        }
    }

    // Strip markdown code blocks for JSON responses
    if (isJsonResponse && text) {
        text = stripMarkdownCodeBlock(String(text));
    }

    // Build content array in order: reasoning → text → tool calls
    const content: LanguageModelV3GenerateResult["content"] = [];

    if (reasoning) {
        content.push({
            type: "reasoning",
            text: reasoning,
        });
    }

    if (text) {
        content.push({
            type: "text",
            text,
        });
    }

    for (const [id, call] of Object.entries(toolCalls)) {
        content.push({
            type: "tool-call",
            toolCallId: id,
            toolName: call.name,
            input: call.args,
        });
    }

    return {
        content,
        finishReason,
        usage,
        warnings: [],
        request: { body: payload },
    };
};

/**
 * Generate a non-streaming response
 */
export const generateRequest = (
    modelId: string,
    token: string,
    projectId: string,
    options: LanguageModelV3CallOptions,
    settings?: AntigravityProviderSettings,
): Effect.Effect<
    LanguageModelV3GenerateResult,
    AntigravityError | AntigravityAuthError | AntigravityRateLimitError | HttpBodyError,
    HttpClient.HttpClient
> =>
    Effect.gen(function* () {
        const { stream, payload } = yield* createResponseStream(modelId, token, projectId, options, settings);
        const parts = yield* Stream.runCollect(stream);
        const partsArray = Chunk.toReadonlyArray(parts);
        return aggregateStreamParts(partsArray, payload, options.responseFormat?.type === "json");
    });

/**
 * Generate a streaming response
 */
export const streamRequest = (
    modelId: string,
    token: string,
    projectId: string,
    options: LanguageModelV3CallOptions,
    settings?: AntigravityProviderSettings,
): Effect.Effect<
    LanguageModelV3StreamResult,
    AntigravityError | AntigravityAuthError | AntigravityRateLimitError | HttpBodyError,
    HttpClient.HttpClient
> =>
    Effect.gen(function* () {
        const { stream, payload } = yield* createResponseStream(modelId, token, projectId, options, settings);

        // Convert to a stream that catches errors
        const safeStream = stream.pipe(
            Stream.catchAll((e) =>
                Stream.succeed({
                    type: "error" as const,
                    error: e,
                }),
            ),
        );

        const result: LanguageModelV3StreamResult = {
            stream: Stream.toReadableStream(safeStream),
            request: { body: payload },
        };

        return result;
    });
