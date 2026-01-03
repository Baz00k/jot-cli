import * as crypto from "node:crypto";
import type {
    LanguageModelV3,
    LanguageModelV3CallOptions,
    LanguageModelV3FinishReason,
    LanguageModelV3FunctionTool,
    LanguageModelV3GenerateResult,
    LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import { Effect, Schema } from "effect";
import { ANTIGRAVITY_CLIENT_ID, ANTIGRAVITY_CLIENT_SECRET } from "@/domain/constants";
import type { Config } from "@/services/config";

const BASE_URL = "https://cloudcode-pa.googleapis.com/v1internal";

const TokenResponseSchema = Schema.Struct({
    access_token: Schema.String,
    expires_in: Schema.Number,
    refresh_token: Schema.optional(Schema.String),
});

const PartSchema = Schema.Struct({
    text: Schema.optional(Schema.String),
    functionCall: Schema.optional(
        Schema.Struct({
            name: Schema.String,
            args: Schema.Record({ key: Schema.String, value: Schema.Any }),
        }),
    ),
    thoughtSignature: Schema.optional(Schema.String),
});

const ContentSchema = Schema.Struct({
    parts: Schema.optional(Schema.Array(PartSchema)),
});

const CandidateSchema = Schema.Struct({
    content: Schema.optional(ContentSchema),
    finishReason: Schema.optional(Schema.String),
});

const UsageMetadataSchema = Schema.Struct({
    promptTokenCount: Schema.optional(Schema.Number),
    candidatesTokenCount: Schema.optional(Schema.Number),
});

const GenerateResponseSchema = Schema.Struct({
    candidates: Schema.optional(Schema.Array(CandidateSchema)),
    usageMetadata: Schema.optional(UsageMetadataSchema),
    response: Schema.optional(
        Schema.Struct({
            candidates: Schema.optional(Schema.Array(CandidateSchema)),
            usageMetadata: Schema.optional(UsageMetadataSchema),
        }),
    ),
});

const refreshTokenRequest = (refreshToken: string) =>
    Effect.tryPromise({
        try: async () => {
            const response = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    client_id: ANTIGRAVITY_CLIENT_ID,
                    client_secret: ANTIGRAVITY_CLIENT_SECRET,
                    refresh_token: refreshToken,
                    grant_type: "refresh_token",
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Failed to refresh token: ${text}`);
            }

            return await Schema.decodeUnknownPromise(TokenResponseSchema)(await response.json());
        },
        catch: (e) => new Error(String(e)),
    });

const getValidToken = (config: Config) =>
    Effect.gen(function* () {
        const userConfig = yield* config.get;
        const auth = userConfig.googleAntigravity;

        if (!auth?.accessToken) {
            return yield* Effect.fail(new Error("Not authenticated. Run 'jot auth' first."));
        }

        if (auth.expiresAt && Date.now() < auth.expiresAt - 60000) {
            return auth.accessToken;
        }

        if (!auth.refreshToken) {
            return yield* Effect.fail(new Error("Token expired and no refresh token available. Run 'jot auth' again."));
        }

        const tokens = yield* refreshTokenRequest(auth.refreshToken);

        yield* config.update({
            googleAntigravity: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token || auth.refreshToken,
                expiresAt: Date.now() + tokens.expires_in * 1000,
            },
        });

        return tokens.access_token;
    });

export const createAntigravity =
    (config: Config) =>
    (modelId: string, _settings?: unknown): LanguageModelV3 => {
        return {
            specificationVersion: "v3",
            provider: "google-antigravity",
            modelId,
            supportedUrls: Promise.resolve({}),

            async doGenerate(options: LanguageModelV3CallOptions) {
                return Effect.runPromise(
                    Effect.gen(function* () {
                        const token = yield* getValidToken(config);
                        return yield* generateRequest(modelId, token, options);
                    }),
                );
            },

            async doStream(options: LanguageModelV3CallOptions) {
                return Effect.runPromise(
                    Effect.gen(function* () {
                        const token = yield* getValidToken(config);
                        return yield* streamRequest(modelId, token, options);
                    }),
                );
            },
        };
    };

const mapTools = (tools: LanguageModelV3CallOptions["tools"]) => {
    if (!tools || tools.length === 0) return undefined;

    const functionDeclarations = tools
        .filter((t): t is LanguageModelV3FunctionTool => t.type === "function")
        .map((t) => {
            // biome-ignore lint/suspicious/noExplicitAny: JSON.parse returns unknown, cast to any for manipulation
            const parameters: any = JSON.parse(JSON.stringify(t.inputSchema));
            delete parameters.$schema;
            delete parameters.additionalProperties;

            return {
                name: t.name,
                description: t.description,
                parameters,
            };
        });

    if (functionDeclarations.length === 0) return undefined;

    return [{ functionDeclarations }];
};

const mapPromptToContents = (prompt: LanguageModelV3CallOptions["prompt"]) => {
    const contents: unknown[] = [];
    let systemInstruction: { parts: { text: string }[] } | undefined;

    const systemMessages = prompt.filter((p) => p.role === "system");
    if (systemMessages.length > 0) {
        systemInstruction = {
            parts: systemMessages.map((msg) => ({ text: msg.content })),
        };
    }

    const chatMessages = prompt.filter((p) => p.role !== "system");

    for (const msg of chatMessages) {
        let role = "user";
        if (msg.role === "assistant") role = "model";
        else if (msg.role === "tool") role = "user";

        let parts: unknown[] = [];
        if (typeof msg.content === "string") {
            parts = [{ text: msg.content }];
        } else if (Array.isArray(msg.content)) {
            parts = msg.content.map((part) => {
                if (part.type === "text") {
                    const providerOpts = part.providerOptions?.["google-antigravity"];
                    const thoughtSignature =
                        providerOpts?.thoughtSignature != null ? String(providerOpts.thoughtSignature) : undefined;

                    return {
                        text: part.text,
                        ...(thoughtSignature && { thoughtSignature }),
                    };
                }
                if (part.type === "tool-call") {
                    let args = part.input;
                    if (typeof args === "string") {
                        try {
                            args = JSON.parse(args);
                        } catch {
                            args = {};
                        }
                    } else if (typeof args !== "object" || args === null) {
                        args = {};
                    }

                    const providerOpts = part.providerOptions?.["google-antigravity"];
                    const thoughtSignature =
                        providerOpts?.thoughtSignature != null ? String(providerOpts.thoughtSignature) : undefined;

                    return {
                        functionCall: {
                            name: part.toolName,
                            args: args,
                            id: part.toolCallId,
                        },
                        ...(thoughtSignature && { thoughtSignature }),
                    };
                }
                if (part.type === "tool-result") {
                    let responseContent: unknown;

                    if (part.output && typeof part.output === "object" && !Array.isArray(part.output)) {
                        responseContent = part.output;
                    } else {
                        responseContent = { result: part.output };
                    }

                    return {
                        functionResponse: {
                            name: part.toolName,
                            response: responseContent,
                            id: part.toolCallId,
                        },
                    };
                }
                if (part.type === "file") {
                    if (part.data instanceof Uint8Array) {
                        return {
                            inlineData: {
                                mimeType: part.mediaType,
                                data: Buffer.from(part.data).toString("base64"),
                            },
                        };
                    }
                    if (typeof part.data === "string") {
                        return {
                            inlineData: {
                                mimeType: part.mediaType,
                                data: part.data,
                            },
                        };
                    }

                    return { text: "[Image URL not supported]" };
                }
                return { text: "" };
            });
        }

        contents.push({ role, parts });
    }

    return { contents, systemInstruction };
};

const mapFinishReason = (reason?: string): LanguageModelV3FinishReason => {
    switch (reason) {
        case "STOP":
            return {
                unified: "stop",
                raw: reason,
            };
        case "MAX_TOKENS":
            return {
                unified: "length",
                raw: reason,
            };
        case "SAFETY":
            return {
                unified: "content-filter",
                raw: reason,
            };
        case "OTHER":
            return {
                unified: "other",
                raw: reason,
            };
        default:
            return {
                unified: "other",
                raw: reason,
            };
    }
};

const generateRequest = (
    modelId: string,
    token: string,
    options: LanguageModelV3CallOptions,
): Effect.Effect<LanguageModelV3GenerateResult, Error> =>
    Effect.tryPromise({
        try: async () => {
            const { contents, systemInstruction } = mapPromptToContents(options.prompt);
            const tools = mapTools(options.tools);
            const actualModel = modelId.replace(/^antigravity-/, "");

            const payload = {
                project: "1071006060591",
                model: actualModel,
                request: {
                    contents,
                    tools,
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

            if (part?.text) {
                const thoughtSignature =
                    part.thoughtSignature && typeof part.thoughtSignature === "string"
                        ? part.thoughtSignature
                        : undefined;

                content.push({
                    type: "text",
                    text: part.text,
                    providerMetadata: thoughtSignature ? { "google-antigravity": { thoughtSignature } } : undefined,
                });
            }

            if (part?.functionCall) {
                // In LanguageModelV3, args should be a JSON string, not a raw object
                const argsString = JSON.stringify(part.functionCall.args);
                const thoughtSignature =
                    part.thoughtSignature && typeof part.thoughtSignature === "string"
                        ? part.thoughtSignature
                        : undefined;

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
                rawCall: { rawPrompt: contents, rawSettings: options },
                warnings: [],
            };
        },
        catch: (e) => new Error(String(e)),
    });

const streamRequest = (modelId: string, token: string, options: LanguageModelV3CallOptions) =>
    Effect.tryPromise({
        try: async () => {
            const { contents, systemInstruction } = mapPromptToContents(options.prompt);
            const tools = mapTools(options.tools);
            const actualModel = modelId.replace(/^antigravity-/, "");

            const payload = {
                project: "1071006060591",
                model: actualModel,
                request: {
                    contents,
                    tools,
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
                                            const thoughtSignature =
                                                part.thoughtSignature && typeof part.thoughtSignature === "string"
                                                    ? part.thoughtSignature
                                                    : undefined;

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
                                            // In LanguageModelV3, args should be a JSON string, not a raw object
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
