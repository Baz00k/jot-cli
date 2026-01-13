import { log } from "@clack/prompts";
import { Effect, Match, Option } from "effect";
import { AgentLoopError, AIGenerationError, MaxIterationsReached, UserCancel } from "@/domain/errors";

/**
 * Represents the current state of a workflow, used for error recovery.
 */
export interface WorkflowSnapshot {
    readonly cycle: number;
    readonly totalCost: number;
}

/**
 * Result of handling a workflow error.
 */
export type ErrorHandlingResult =
    | { readonly _tag: "Rethrow"; readonly error: UserCancel }
    | { readonly _tag: "Handled"; readonly savedPath: Option.Option<string> };

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
 * Displays the last draft if available.
 *
 * Since the agent now stages files in VFS instead of producing a single text draft,
 * we cannot easily "save the draft" from a snapshot. This function remains for API compatibility
 * but always returns None.
 */
export const displayLastDraft = (_snapshot: WorkflowSnapshot): Effect.Effect<Option.Option<string>> =>
    Effect.sync(() => {
        log.info("Draft recovery is not supported in the new VFS architecture.");
        return Option.none();
    });

/**
 * Displays summary information after saving a draft.
 */
export const displaySaveSuccess = (savedPath: string, snapshot: WorkflowSnapshot): Effect.Effect<void> =>
    Effect.sync(() => {
        log.success(`Draft saved to: ${savedPath}`);
        if (snapshot.cycle > 0) {
            log.info(`Completed ${snapshot.cycle} iteration(s)`);
        }
        if (snapshot.totalCost > 0) {
            log.info(`Total cost: $${snapshot.totalCost.toFixed(6)}`);
        }
    });

/**
 * Checks if an error should be rethrown (not handled inline).
 */
export const shouldRethrow = (error: unknown): error is UserCancel => error instanceof UserCancel;

/**
 * Checks if an error was already handled (used to exit gracefully).
 */
export const isHandled = (
    result: ErrorHandlingResult,
): result is { _tag: "Handled"; savedPath: Option.Option<string> } => result._tag === "Handled";

/**
 * Creates a "handled" result.
 */
export const handled = (savedPath: Option.Option<string>): ErrorHandlingResult => ({
    _tag: "Handled",
    savedPath,
});

/**
 * Creates a "rethrow" result.
 */
export const rethrow = (error: UserCancel): ErrorHandlingResult => ({
    _tag: "Rethrow",
    error,
});

export class WorkflowErrorHandled {
    readonly savedPath?: string;
    constructor(props: { savedPath?: string }) {
        this.savedPath = props.savedPath;
    }
}
