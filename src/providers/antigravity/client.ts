import * as crypto from "node:crypto";
import type {
    LanguageModelV3CallOptions,
    LanguageModelV3GenerateResult,
    LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import { Effect, Match, Schema } from "effect";
import { mapFinishReason, mapPromptToContents, mapTools } from "./mappers";
import { GenerateResponseSchema } from "./schemas";
import type { ApiRequest } from "./types";

const BASE_URL = "https://cloudcode-pa.googleapis.com/v1internal";
const PROJECT_ID = "1071006060591";

const buildPayload = (modelId: string, options: LanguageModelV3CallOptions): ApiRequest => {
    const { contents, systemInstruction } = mapPromptToContents(options.prompt);
    return {
        project: PROJECT_ID,
        model: modelId.replace(/^(google\/)?antigravity-/, ""),
        request: {
            contents,
            tools: mapTools(options.tools),
            generationConfig: {
                temperature: options.temperature,
                topP: options.topP,
                maxOutputTokens: options.maxOutputTokens,
            },
            systemInstruction,
        },
        userAgent: "antigravity",
        requestId: crypto.randomUUID(),
    };
};

export const generateRequest = (
    modelId: string,
    token: string,
    options: LanguageModelV3CallOptions,
): Effect.Effect<LanguageModelV3GenerateResult, Error> =>
    Effect.tryPromise({
        try: async () => {
            const payload = buildPayload(modelId, options);

            const response = await fetch(`${BASE_URL}:generateContent`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    "User-Agent": "antigravity/1.11.5 windows/amd64",
                    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
                    "Client-Metadata": JSON.stringify({
                        ideType: "IDE_UNSPECIFIED",
                        platform: "PLATFORM_UNSPECIFIED",
                        pluginType: "GEMINI",
                    }),
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Antigravity API Error: ${response.status} - ${text}`);
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
                content.push({
                    type: "text",
                    text: part.text,
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
        catch: (e) => new Error(String(e)),
    });

export const streamRequest = (modelId: string, token: string, options: LanguageModelV3CallOptions) =>
    Effect.tryPromise({
        try: async () => {
            const payload = buildPayload(modelId, options);

            const response = await fetch(`${BASE_URL}:streamGenerateContent?alt=sse`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    "User-Agent": "antigravity/1.11.5 windows/amd64",
                    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
                    "Client-Metadata": JSON.stringify({
                        ideType: "IDE_UNSPECIFIED",
                        platform: "PLATFORM_UNSPECIFIED",
                        pluginType: "GEMINI",
                    }),
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Antigravity API Error: ${response.status} - ${text}`);
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

                                            controller.enqueue({
                                                type: "text-delta",
                                                id: crypto.randomUUID(),
                                                delta: part.text,
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
        catch: (e) => new Error(String(e)),
    });
