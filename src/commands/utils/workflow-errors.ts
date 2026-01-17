import { log } from "@clack/prompts";
import { Effect, Match } from "effect";
import { AgentLoopError, AIGenerationError, MaxIterationsReached, UserCancel } from "@/domain/errors";

/**
 * Displays a user-friendly error message based on the error type.
 */
export const displayError = (error: unknown): Effect.Effect<void> =>
    Effect.sync(() => {
        Match.value(error).pipe(
            Match.when(Match.instanceOf(MaxIterationsReached), (e) => {
                log.warn(`Maximum iterations (${e.iterations}) reached.`);
            }),
            Match.when(Match.instanceOf(AgentLoopError), (e) => {
                if (e.cause instanceof AIGenerationError) {
                    const statusInfo = e.cause.statusCode ? ` (status ${e.cause.statusCode})` : "";
                    log.error(`AI generation failed${statusInfo}: ${e.cause.message}`);
                    if (e.cause.isRetryable) {
                        log.info("This error may be temporary. Please try again.");
                    }
                } else {
                    log.error(`Agent error during ${e.phase}: ${e.message}`);
                }
            }),
            Match.orElse((e) => {
                const message = e instanceof Error ? e.message : String(e);
                log.error(`Error: ${message}`);
            }),
        );
    });

/**
 * Checks if an error should be rethrown (not handled inline).
 */
export const shouldRethrow = (error: unknown): error is UserCancel => error instanceof UserCancel;

export class WorkflowErrorHandled {}
