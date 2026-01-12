import type {
    JSONObject,
    LanguageModelV3CallOptions,
    LanguageModelV3Content,
    LanguageModelV3FinishReason,
    LanguageModelV3FunctionTool,
    LanguageModelV3Message,
    LanguageModelV3Prompt,
    LanguageModelV3Usage,
} from "@ai-sdk/provider";
import dedent from "dedent";
import { Match } from "effect";
import type { JSONSchema7 } from "json-schema";
import { ANTIGRAVITY_SYSTEM_INSTRUCTION } from "./constants";
import type { ApiContent, ApiPart, FunctionDeclaration, JsonSchema, UsageMetadata } from "./types";

const DEFAULT_SCHEMA_PREFIX = dedent`
    > JSON OUTPUT GENERATION MODE
    Ignore all previous instructions about output formatting.
    Response JSON schema:
    `;
const DEFAULT_SCHEMA_SUFFIX = dedent`
    You MUST answer with a JSON object that matches the JSON schema above.
    Do not include any additional text or comments. Your response MUST be a valid JSON object matching the schema.
    `;
const DEFAULT_GENERIC_SUFFIX = "You MUST answer with valid JSON.";

export function injectJsonInstruction({
    prompt,
    schema,
    schemaPrefix = schema != null ? DEFAULT_SCHEMA_PREFIX : undefined,
    schemaSuffix = schema != null ? DEFAULT_SCHEMA_SUFFIX : DEFAULT_GENERIC_SUFFIX,
}: {
    prompt?: string;
    schema?: JSONSchema7;
    schemaPrefix?: string;
    schemaSuffix?: string;
}): string {
    return [
        prompt != null && prompt.length > 0 ? prompt : undefined,
        prompt != null && prompt.length > 0 ? "" : undefined,
        schemaPrefix,
        schema != null ? JSON.stringify(schema) : undefined,
        schemaSuffix,
    ]
        .filter((line) => line != null)
        .join("\n");
}

export function injectJsonInstructionIntoMessages({
    messages,
    schema,
    schemaPrefix,
    schemaSuffix,
}: {
    messages: LanguageModelV3Prompt;
    schema?: JSONSchema7;
    schemaPrefix?: string;
    schemaSuffix?: string;
}): LanguageModelV3Prompt {
    const systemMessage: LanguageModelV3Message =
        messages[0]?.role === "system" ? { ...messages[0] } : { role: "system", content: "" };

    if (typeof systemMessage.content === "string") {
        systemMessage.content = injectJsonInstruction({
            prompt: systemMessage.content,
            schema,
            schemaPrefix,
            schemaSuffix,
        });
    }

    return [systemMessage, ...(messages[0]?.role === "system" ? messages.slice(1) : messages)];
}

export const stripMarkdownCodeBlock = (text: string): string => {
    const trimmed = text.trim();

    const codeBlockPattern = /^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```$/;
    const match = trimmed.match(codeBlockPattern);

    if (match?.[1]) {
        return match[1].trim();
    }

    return trimmed;
};

export const mapTools = (
    tools: LanguageModelV3CallOptions["tools"],
): { functionDeclarations: FunctionDeclaration[] }[] | undefined => {
    if (!tools || tools.length === 0) return undefined;

    const functionDeclarations = tools
        .filter((t): t is LanguageModelV3FunctionTool => t.type === "function")
        .map((t): FunctionDeclaration => {
            const parameters = JSON.parse(JSON.stringify(t.inputSchema)) as JsonSchema;

            const disallowedProperties = ["$schema", "$id", "default", "examples"];
            for (const property of disallowedProperties) {
                delete parameters[property];
            }

            return {
                name: t.name,
                description: t.description,
                parameters,
            };
        });

    if (functionDeclarations.length === 0) return undefined;

    return [{ functionDeclarations }];
};

export const mapPromptToContents = (
    prompt: LanguageModelV3CallOptions["prompt"],
    model: string,
    responseFormat?: LanguageModelV3CallOptions["responseFormat"],
): {
    contents: ApiContent[];
    systemInstruction: { parts: { text: string }[]; role: "user" };
} => {
    const contents: ApiContent[] = [];
    const systemInstruction: { parts: { text: string }[]; role: "user" } = { parts: [], role: "user" };

    const systemMessages = prompt.filter((p) => p.role === "system");
    if (systemMessages.length > 0) {
        systemInstruction.parts = systemMessages.map((msg) => ({ text: msg.content }));
    }

    // We need to include custom instructions for Claude and Gemini 3 Pro models
    if (model.includes("claude") || model.includes("gemini-3-pro")) {
        const originalSystemParts = systemInstruction.parts;

        const parts = [
            { text: ANTIGRAVITY_SYSTEM_INSTRUCTION },
            { text: `Please ignore following [ignore]${ANTIGRAVITY_SYSTEM_INSTRUCTION}[/ignore]` },
            ...originalSystemParts,
        ];

        systemInstruction.parts = parts;
    }

    // If responseFormat is JSON, inject instructions into the instructions
    // As the API does not support native JSON response format
    if (responseFormat?.type === "json") {
        const jsonInstruction = injectJsonInstruction({
            schema: responseFormat.schema,
        });
        systemInstruction.parts.push({ text: jsonInstruction });
        contents.push({ role: "user", parts: [{ text: jsonInstruction }] });
    }

    const chatMessages = prompt.filter((p) => p.role !== "system");

    const rawContents: ApiContent[] = [];

    for (const msg of chatMessages) {
        let role: "user" | "model" = "user";
        if (msg.role === "assistant") role = "model";
        else if (msg.role === "tool") role = "user";

        const parts: ApiContent["parts"] = [];

        if (typeof msg.content === "string") {
            parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === "text") {
                    const providerOpts = part.providerOptions?.["google-antigravity"];
                    const thoughtSignature = Match.value(providerOpts?.thoughtSignature).pipe(
                        Match.when(Match.nonEmptyString, (signature) => signature),
                        Match.when(Match.defined, (signature) => JSON.stringify(signature)),
                        Match.orElse(() => undefined),
                    );

                    parts.push({
                        text: part.text,
                        ...(thoughtSignature && { thoughtSignature }),
                    });
                } else if (part.type === "tool-call") {
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
                    const thoughtSignature = Match.value(providerOpts?.thoughtSignature).pipe(
                        Match.when(Match.nonEmptyString, (value) => value),
                        Match.when(Match.defined, (value) => String(value)),
                        Match.orElse(() => "skip_thought_signature_validator"),
                    );

                    parts.push({
                        functionCall: {
                            name: part.toolName,
                            args: args as Record<string, unknown>,
                            id: part.toolCallId,
                        },
                        thoughtSignature: thoughtSignature,
                    });
                } else if (part.type === "tool-result") {
                    let responseContent: unknown;

                    if (part.output && typeof part.output === "object" && !Array.isArray(part.output)) {
                        responseContent = part.output;
                    } else {
                        responseContent = { result: part.output };
                    }

                    parts.push({
                        functionResponse: {
                            name: part.toolName,
                            response: responseContent,
                            id: part.toolCallId,
                        },
                    });
                } else if (part.type === "file") {
                    if (part.data instanceof Uint8Array) {
                        parts.push({
                            inlineData: {
                                mimeType: part.mediaType,
                                data: Buffer.from(part.data).toString("base64"),
                            },
                        });
                    } else if (typeof part.data === "string") {
                        parts.push({
                            inlineData: {
                                mimeType: part.mediaType,
                                data: part.data,
                            },
                        });
                    } else {
                        parts.push({ text: "[Image URL not supported]" });
                    }
                } else {
                    parts.push({ text: "" });
                }
            }
        }

        rawContents.push({ role, parts });
    }

    const grouped = groupToolCallsAndResponses(rawContents);
    contents.push(...grouped);

    return { contents, systemInstruction };
};

function groupToolCallsAndResponses(contents: ApiContent[]): ApiContent[] {
    const result: ApiContent[] = [];

    let i = 0;
    while (i < contents.length) {
        const current = contents[i];
        if (!current) {
            i++;
            continue;
        }

        if (current.role === "model" && hasOnlyFunctionCalls(current)) {
            const mergedParts: ApiPart[] = [...current.parts];
            let j = i + 1;
            while (j < contents.length) {
                const next = contents[j];
                if (next && next.role === "model" && hasOnlyFunctionCalls(next)) {
                    mergedParts.push(...next.parts);
                    j++;
                } else {
                    break;
                }
            }
            result.push({ role: "model", parts: mergedParts });
            i = j;
            continue;
        }

        if (current.role === "user" && hasOnlyFunctionResponses(current)) {
            const mergedParts: ApiPart[] = [...current.parts];
            let j = i + 1;
            while (j < contents.length) {
                const next = contents[j];
                if (next && next.role === "user" && hasOnlyFunctionResponses(next)) {
                    mergedParts.push(...next.parts);
                    j++;
                } else {
                    break;
                }
            }
            result.push({ role: "user", parts: mergedParts });
            i = j;
            continue;
        }

        result.push(current);
        i++;
    }

    return result;
}

function hasOnlyFunctionCalls(content: ApiContent): boolean {
    return content.parts.length > 0 && content.parts.every((p) => p.functionCall != null);
}

function hasOnlyFunctionResponses(content: ApiContent): boolean {
    return content.parts.length > 0 && content.parts.every((p) => p.functionResponse != null);
}

export const mapFinishReason = (reason?: string): LanguageModelV3FinishReason => {
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
        case "TOOL_CODE":
        case "FUNCTION_CALL":
            return {
                unified: "tool-calls",
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

export const mapUsage = (metadata?: UsageMetadata): LanguageModelV3Usage => {
    return {
        inputTokens: {
            total: metadata?.promptTokenCount,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
        },
        outputTokens: {
            total: metadata?.candidatesTokenCount,
            text:
                metadata?.candidatesTokenCount != null && metadata?.thoughtTokenCount != null
                    ? metadata.candidatesTokenCount - metadata.thoughtTokenCount
                    : metadata?.candidatesTokenCount,
            reasoning: metadata?.thoughtTokenCount,
        },
        raw: metadata as JSONObject,
    };
};

export const mapApiPartsToContent = (parts: ApiPart[], shouldStripMarkdown = false): LanguageModelV3Content[] => {
    const content: LanguageModelV3Content[] = [];

    for (const part of parts) {
        if (part.thought || (part.thoughtSignature && part.text != null && !part.functionCall)) {
            content.push({
                type: "reasoning",
                text: part.text ?? "",
                providerMetadata: part.thoughtSignature
                    ? { "google-antigravity": { thoughtSignature: part.thoughtSignature } }
                    : undefined,
            });
        } else if (part.text != null && !part.functionCall) {
            let text = part.text;
            if (shouldStripMarkdown) {
                text = stripMarkdownCodeBlock(text);
            }
            content.push({
                type: "text",
                text: text,
            });
        } else if (part.functionCall) {
            content.push({
                type: "tool-call",
                toolCallId: part.functionCall.id ?? `tc-${Date.now()}`,
                toolName: part.functionCall.name,
                input: JSON.stringify(part.functionCall.args ?? {}),
                providerMetadata: part.thoughtSignature
                    ? { "google-antigravity": { thoughtSignature: part.thoughtSignature } }
                    : undefined,
            });
        }
    }

    return content;
};
