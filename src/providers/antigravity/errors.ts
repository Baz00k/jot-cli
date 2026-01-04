import { Data } from "effect";

export class AntigravityError extends Data.TaggedError("AntigravityError")<{
    readonly message: string;
    readonly cause?: unknown;
    readonly code?: number;
    readonly status?: string;
}> {
    get statusCode(): number | undefined {
        return this.code;
    }
}

export class AntigravityAuthError extends Data.TaggedError("AntigravityAuthError")<{
    readonly message: string;
    readonly cause?: unknown;
}> {
    readonly isRetryable = false;
    readonly statusCode = 401;
}

export class AntigravityRateLimitError extends Data.TaggedError("AntigravityRateLimitError")<{
    readonly message: string;
    readonly retryAfter?: number;
}> {
    readonly isRetryable = true;
    readonly statusCode = 429;
}
