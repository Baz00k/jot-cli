import type {
    LanguageModelV3CallOptions,
    LanguageModelV3FinishReason,
    LanguageModelV3FunctionTool,
    LanguageModelV3Message,
    LanguageModelV3Prompt,
} from "@ai-sdk/provider";
import dedent from "dedent";
import type { JSONSchema7 } from "json-schema";
import type { ApiContent, FunctionDeclaration, JsonSchema } from "./types";

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

/**
 * Strips markdown code block wrappers from text.
 * Handles ```json, ```, and variations with language tags.
 */
export const stripMarkdownCodeBlock = (text: string): string => {
    const trimmed = text.trim();

    // Match ```json or ``` at start, and ``` at end
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
): {
    contents: ApiContent[];
    systemInstruction?: { parts: { text: string }[] };
} => {
    const contents: ApiContent[] = [];
    let systemInstruction: { parts: { text: string }[] } | undefined;

    const systemMessages = prompt.filter((p) => p.role === "system");
    if (systemMessages.length > 0) {
        systemInstruction = {
            parts: systemMessages.map((msg) => ({ text: msg.content })),
        };
    }

    const chatMessages = prompt.filter((p) => p.role !== "system");

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
                    const thoughtSignature =
                        providerOpts?.thoughtSignature != null ? String(providerOpts.thoughtSignature) : undefined;

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
                    const thoughtSignature =
                        providerOpts?.thoughtSignature != null ? String(providerOpts.thoughtSignature) : undefined;

                    parts.push({
                        functionCall: {
                            name: part.toolName,
                            args: args as Record<string, unknown>,
                            id: part.toolCallId,
                        },
                        ...(thoughtSignature && { thoughtSignature }),
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

        contents.push({ role, parts });
    }

    return { contents, systemInstruction };
};

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
