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
        systemInstruction?: { parts: { text: string }[] };
        tools?: { functionDeclarations: FunctionDeclaration[] }[];
        generationConfig: {
            temperature?: number;
            topP?: number;
            maxOutputTokens?: number;
        };
    };
    requestType: "agent";
    userAgent: string;
    requestId: string;
}

export type AntigravityErrorResponse = {
    error?: {
        code?: number;
        message?: string;
        status?: string;
        details?: Array<{ retryDelay?: string }>;
    };
};
