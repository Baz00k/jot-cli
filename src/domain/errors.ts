import { Data } from "effect";

export class ConfigReadError extends Data.TaggedError("ConfigReadError")<{
    readonly cause: unknown;
}> {}

export class ConfigWriteError extends Data.TaggedError("ConfigWriteError")<{
    readonly cause: unknown;
}> {}

export class UserCancel extends Data.TaggedError("UserCancel") {}

export class PromptReadError extends Data.TaggedError("PromptReadError")<{
    readonly cause: unknown;
    readonly message?: string;
}> {}

export class AgentError extends Data.TaggedError("AgentError")<{
    readonly cause: unknown;
    readonly message?: string;
}> {}

export class AgentStreamError extends Data.TaggedError("AgentStreamError")<{
    readonly cause: unknown;
    readonly message?: string;
}> {}

export class FileReadError extends Data.TaggedError("FileReadError")<{
    readonly cause: unknown;
    readonly message?: string;
}> {}

export class FileWriteError extends Data.TaggedError("FileWriteError")<{
    readonly cause: unknown;
    readonly message?: string;
}> {}

export class MaxIterationsReached extends Data.TaggedError("MaxIterationsReached")<{
    readonly iterations: number;
    readonly lastDraft?: string;
    readonly totalCost?: number;
}> {}

export class AgentLoopError extends Data.TaggedError("AgentLoopError")<{
    readonly cause: unknown;
    readonly message?: string;
    readonly phase: "drafting" | "reviewing" | "user_feedback" | "editing";
}> {}

/**
 * Error thrown when an AI API call fails.
 * Contains structured information from the API response for user-friendly error messages.
 */
export class AIGenerationError extends Data.TaggedError("AIGenerationError")<{
    readonly cause: unknown;
    readonly message: string;
    readonly statusCode?: number;
    readonly isRetryable: boolean;
}> {
    /**
     * Creates an AIGenerationError from an unknown error.
     * Extracts relevant information from AI SDK errors.
     */
    static fromUnknown(error: unknown): AIGenerationError {
        const info = AIGenerationError.extractErrorInfo(error);
        return new AIGenerationError({
            cause: error,
            message: info.message,
            statusCode: info.statusCode,
            isRetryable: info.isRetryable,
        });
    }

    /**
     * Extracts error information from an error, traversing cause chain if needed.
     */
    private static extractErrorInfo(error: unknown): {
        message: string;
        statusCode?: number;
        isRetryable: boolean;
    } {
        // Find the most relevant error in the cause chain
        const relevant = AIGenerationError.findRelevantError(error);

        let message = "An unknown error occurred";
        let statusCode: number | undefined;
        let isRetryable = false;

        if (relevant instanceof Error) {
            message = relevant.message;
        } else if (typeof relevant === "string") {
            message = relevant;
        }

        if (typeof relevant === "object" && relevant !== null) {
            if ("statusCode" in relevant && typeof relevant.statusCode === "number") {
                statusCode = relevant.statusCode;
            }
            if ("isRetryable" in relevant && typeof relevant.isRetryable === "boolean") {
                isRetryable = relevant.isRetryable;
            }
        }

        return { message, statusCode, isRetryable };
    }

    /**
     * Traverses the error cause chain to find the most relevant error
     * (one with statusCode or isRetryable properties).
     */
    private static findRelevantError(error: unknown): unknown {
        if (typeof error !== "object" || error === null) {
            return error;
        }

        // If this error has API error info, use it
        if ("statusCode" in error || "isRetryable" in error) {
            return error;
        }

        // Otherwise, check the cause chain
        if ("cause" in error && error.cause != null) {
            const causedError = AIGenerationError.findRelevantError(error.cause);
            // If we found a relevant error in the cause chain, use it
            if (
                typeof causedError === "object" &&
                causedError !== null &&
                ("statusCode" in causedError || "isRetryable" in causedError)
            ) {
                return causedError;
            }
        }

        return error;
    }
}

export class NoUserActionPending extends Data.TaggedError("NoUserActionPending")<{
    readonly message?: string;
}> {}
