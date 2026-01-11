export interface JsonSchema {
    type?: string;
    properties?: Record<string, JsonSchema>;
    required?: string[];
    items?: JsonSchema;
    description?: string;
    enum?: unknown[];
    [key: string]: unknown;
}

export interface FunctionDeclaration {
    name: string;
    description?: string;
    parameters: JsonSchema;
}

export interface ApiPart {
    text?: string;
    thought?: boolean;
    functionCall?: {
        name: string;
        args: Record<string, unknown>;
        id?: string;
    };
    functionResponse?: {
        name: string;
        response: unknown;
        id?: string;
    };
    inlineData?: {
        mimeType: string;
        data: string;
    };
    thoughtSignature?: string;
}

export interface ApiContent {
    role: "user" | "model";
    parts: ApiPart[];
}

export interface ApiRequest {
    project: string;
    model: string;
    request: {
        contents: ApiContent[];
        systemInstruction: {
            parts: { text: string }[];
            role: "user";
        };
        tools?: { functionDeclarations: FunctionDeclaration[] }[];
        toolConfig?: {
            functionCallingConfig?: {
                mode?: "AUTO" | "VALIDATED";
            };
        };
        generationConfig: {
            temperature?: number;
            topK?: number;
            topP?: number;
            maxOutputTokens?: number;
            thinkingConfig?: {
                includeThoughts?: boolean;
                thinkingLevel?: string;
                thinkingBudget?: number;
            };
        };
        sessionId?: string;
    };
    requestType: "agent";
    userAgent: "antigravity";
    requestId: string;
}

export interface Candidate {
    content?: {
        parts?: ApiPart[];
        role?: "model";
    };
    finishReason?: string;
    safetyRatings?: Array<{
        category: string;
        probability: string;
    }>;
}

export interface UsageMetadata {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    thoughtTokenCount?: number;
}

export interface StreamChunk {
    candidates?: Candidate[];
    usageMetadata?: UsageMetadata;
    response?: {
        candidates?: Candidate[];
        usageMetadata?: UsageMetadata;
    };
}

export type AntigravityErrorResponse = {
    error?: {
        code?: number;
        message?: string;
        status?: string;
        details?: Array<{
            "@type": string;
            retryDelay?: string;
        }>;
    };
};

export interface AntigravityProviderSettings {
    reasoning?: {
        effort?: "low" | "medium" | "high";
        enabled?: boolean;
    };
    [key: string]: unknown;
}
