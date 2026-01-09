import * as crypto from "node:crypto";
import type {
    LanguageModelV3CallOptions,
    LanguageModelV3GenerateResult,
    LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import { Effect, Match, Schema } from "effect";
import { ANTIGRAVITY_DEFAULT_ENDPOINT, ANTIGRAVITY_HEADERS } from "./constants";
import { AntigravityAuthError, AntigravityError, AntigravityRateLimitError } from "./errors";
import {
    injectJsonInstructionIntoMessages,
    mapFinishReason,
    mapPromptToContents,
    mapTools,
    stripMarkdownCodeBlock,
} from "./mappers";
import { GenerateResponseSchema } from "./schemas";
import type { AntigravityErrorResponse, ApiRequest } from "./types";

const BASE_URL = `${ANTIGRAVITY_DEFAULT_ENDPOINT}/v1internal`;

const handleAntigravityError = async (response: Response): Promise<never> => {
    let errorDetails: AntigravityErrorResponse | undefined;
    try {
        errorDetails = (await response.json()) as AntigravityErrorResponse;
    } catch {
        const text = await response.text();
        throw new AntigravityError({
            message: `Antigravity API Error: ${response.status} - ${text}`,
            code: response.status,
        });
    }

    const message = errorDetails?.error?.message || `Antigravity API Error: ${response.status}`;

    if (response.status === 401 || response.status === 403) {
        throw new AntigravityAuthError({ message, cause: errorDetails });
    }

    if (response.status === 429) {
        const retryDelay = errorDetails?.error?.details?.[0]?.retryDelay;
        const retryAfter = retryDelay ? Number.parseFloat(retryDelay.replace("s", "")) * 1000 : undefined;
        throw new AntigravityRateLimitError({ message, retryAfter });
    }

    throw new AntigravityError({
        message,
        cause: errorDetails,
        code: response.status,
        status: errorDetails?.error?.status,
    });
};

const buildPayload = (modelId: string, projectId: string, options: LanguageModelV3CallOptions): ApiRequest => {
    let prompt = options.prompt;

    if (options.responseFormat?.type === "json" && options.responseFormat.schema) {
        prompt = injectJsonInstructionIntoMessages({
            messages: prompt,
            schema: options.responseFormat.schema,
        });
    }

    const { contents, systemInstruction } = mapPromptToContents(prompt);

    return {
        project: projectId,
        model: modelId.replace(/^(google\/)?antigravity-/, ""),
        request: {
            contents,
            systemInstruction,
            tools: mapTools(options.tools),
            generationConfig: {
                temperature: options.temperature,
                topP: options.topP,
                maxOutputTokens: options.maxOutputTokens,
            },
        },
        requestType: "agent",
        userAgent: "antigravity",
        requestId: `agent-${crypto.randomUUID()}`,
    };
};

export const generateRequest = (
    modelId: string,
    token: string,
    projectId: string,
    options: LanguageModelV3CallOptions,
): Effect.Effect<
    LanguageModelV3GenerateResult,
    AntigravityError | AntigravityAuthError | AntigravityRateLimitError | Error
> =>
    Effect.gen(function* () {
        const payload = buildPayload(modelId, projectId, options);

        yield* Effect.logDebug(`[Antigravity] Generate request: ${modelId}`);

        return yield* Effect.tryPromise({
            try: async () => {
                const response = await fetch(`${BASE_URL}:generateContent`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                        ...ANTIGRAVITY_HEADERS,
                    },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    await handleAntigravityError(response);
                }

                const parsed = await Schema.decodeUnknownPromise(GenerateResponseSchema)(await response.json());
                const json = parsed.response || parsed;
                const candidate = json.candidates?.[0];
                const part = candidate?.content?.parts?.[0];

                const content: LanguageModelV3GenerateResult["content"] = [];
                const thoughtSignature = Match.value(part?.thoughtSignature).pipe(
                    Match.when(Match.nonEmptyString, (value) => value),
                    Match.orElse(() => undefined),
                );

                if (part?.text) {
                    const text =
                        options.responseFormat?.type === "json" ? stripMarkdownCodeBlock(part.text) : part.text;

                    content.push({
                        type: "text",
                        text,
                        providerMetadata: thoughtSignature ? { "google-antigravity": { thoughtSignature } } : undefined,
                    });
                }

                if (part?.functionCall) {
                    const argsString = JSON.stringify(part.functionCall.args);

                    content.push({
                        type: "tool-call",
                        toolCallId: crypto.randomUUID(),
                        toolName: part.functionCall.name,
                        input: argsString,
                        providerMetadata: thoughtSignature ? { "google-antigravity": { thoughtSignature } } : undefined,
                    });
                }

                const finishReason = mapFinishReason(candidate?.finishReason);

                const usage = {
                    inputTokens: {
                        total: json.usageMetadata?.promptTokenCount || 0,
                        noCache: undefined,
                        cacheRead: undefined,
                        cacheWrite: undefined,
                    },
                    outputTokens: {
                        total: json.usageMetadata?.candidatesTokenCount || 0,
                        text: undefined,
                        reasoning: undefined,
                    },
                };

                return {
                    content,
                    finishReason,
                    usage,
                    rawCall: { rawPrompt: payload.request.contents, rawSettings: options },
                    warnings: [],
                };
            },
            catch: (e) => {
                if (
                    e instanceof AntigravityError ||
                    e instanceof AntigravityAuthError ||
                    e instanceof AntigravityRateLimitError
                ) {
                    return e;
                }
                return new AntigravityError({ message: String(e), cause: e });
            },
        });
    }).pipe(Effect.tapError((e) => Effect.logError(`[Antigravity] Generate error: ${e.message}`)));

export const streamRequest = (modelId: string, token: string, projectId: string, options: LanguageModelV3CallOptions) =>
    Effect.gen(function* () {
        const payload = buildPayload(modelId, projectId, options);

        yield* Effect.logDebug(`[Antigravity] Stream request: ${modelId}`);

        return yield* Effect.tryPromise({
            try: async () => {
                const response = await fetch(`${BASE_URL}:streamGenerateContent?alt=sse`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                        Accept: "text/event-stream",
                        ...ANTIGRAVITY_HEADERS,
                    },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    await handleAntigravityError(response);
                }

                const stream = new ReadableStream<LanguageModelV3StreamPart>({
                    async start(controller) {
                        const reader = response.body?.getReader();
                        if (!reader) {
                            controller.close();
                            return;
                        }

                        const decoder = new TextDecoder();
                        let buffer = "";

                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;

                                buffer += decoder.decode(value, { stream: true });
                                const lines = buffer.split("\n");
                                buffer = lines.pop() || "";

                                for (const line of lines) {
                                    if (line.startsWith("data: ")) {
                                        const data = line.slice(6);
                                        if (data === "[DONE]") continue;
                                        try {
                                            const parsed = JSON.parse(data);
                                            const decoded = Schema.decodeUnknownSync(GenerateResponseSchema)(parsed);
                                            const json = decoded.response || decoded;
                                            const candidate = json.candidates?.[0];
                                            const part = candidate?.content?.parts?.[0];

                                            if (part?.text) {
                                                const thoughtSignature = Match.value(part?.thoughtSignature).pipe(
                                                    Match.when(Match.nonEmptyString, (value) => value),
                                                    Match.orElse(() => undefined),
                                                );

                                                let delta = part.text;
                                                if (options.responseFormat?.type === "json") {
                                                    delta = delta.replace(/^```(?:json|JSON)?\s*\n?/, "");
                                                    delta = delta.replace(/\n?```\s*$/, "");
                                                }

                                                controller.enqueue({
                                                    type: "text-delta",
                                                    id: crypto.randomUUID(),
                                                    delta,
                                                    providerMetadata: thoughtSignature
                                                        ? { "google-antigravity": { thoughtSignature } }
                                                        : undefined,
                                                });
                                            }

                                            if (part?.functionCall) {
                                                const callId = crypto.randomUUID();
                                                const argsString = JSON.stringify(part.functionCall.args);
                                                const thoughtSignature =
                                                    part.thoughtSignature && typeof part.thoughtSignature === "string"
                                                        ? part.thoughtSignature
                                                        : undefined;

                                                controller.enqueue({
                                                    type: "tool-call",
                                                    toolCallId: callId,
                                                    toolName: part.functionCall.name,
                                                    input: argsString,
                                                    providerMetadata: thoughtSignature
                                                        ? { "google-antigravity": { thoughtSignature } }
                                                        : undefined,
                                                });
                                            }

                                            if (candidate?.finishReason) {
                                                const finishReason = mapFinishReason(candidate.finishReason);

                                                controller.enqueue({
                                                    type: "finish",
                                                    finishReason,
                                                    usage: {
                                                        inputTokens: {
                                                            total: json.usageMetadata?.promptTokenCount || 0,
                                                            noCache: undefined,
                                                            cacheRead: undefined,
                                                            cacheWrite: undefined,
                                                        },
                                                        outputTokens: {
                                                            total: json.usageMetadata?.candidatesTokenCount || 0,
                                                            text: undefined,
                                                            reasoning: undefined,
                                                        },
                                                    },
                                                });
                                            }
                                        } catch (_e) {}
                                    }
                                }
                            }
                        } finally {
                            controller.close();
                        }
                    },
                });

                return { stream };
            },
            catch: (e) => {
                if (
                    e instanceof AntigravityError ||
                    e instanceof AntigravityAuthError ||
                    e instanceof AntigravityRateLimitError
                ) {
                    return e;
                }
                return new AntigravityError({ message: String(e), cause: e });
            },
        });
    }).pipe(Effect.tapError((e) => Effect.logError(`[Antigravity] Stream error: ${e.message}`)));
