import { cancel, isCancel, log, note, select, type spinner, text } from "@clack/prompts";
import { Chunk, Effect, Fiber, Stream } from "effect";
import { displayError, shouldRethrow } from "@/commands/utils/workflow-errors";
import { UserCancel, WorkflowErrorHandled } from "@/domain/errors";
import type { FilePatch } from "@/domain/vfs";
import type { AgentEvent, RunResult, UserAction } from "@/services/agent";
import type { VFS } from "@/services/vfs";
import { formatWindow, renderMarkdown, renderMarkdownSnippet } from "@/text/utils";

export const runPrompt = <T>(promptFn: () => Promise<T | symbol>) =>
    Effect.tryPromise({
        try: async () => {
            const result = await promptFn();
            if (isCancel(result)) {
                throw new UserCancel();
            }
            return result as T;
        },
        catch: (e) => (e instanceof UserCancel ? e : new Error(String(e))),
    }).pipe(
        Effect.tap(() =>
            Effect.try({
                try: () => {
                    if (process.stdin?.listenerCount("keypress") > 0) {
                        process.stdin.removeAllListeners("keypress");
                    }
                },
                catch: () => {
                    // Silently handle cleanup errors to avoid breaking the prompt flow
                },
            }).pipe(Effect.orDie),
        ),
    );

export const formatDiffs = (diffs: ReadonlyArray<FilePatch>): string => {
    if (diffs.length === 0) return "No changes.";
    return diffs
        .map((patch) => {
            const status = patch.isNew ? " (New)" : patch.isDeleted ? " (Deleted)" : "";
            const hunks = Chunk.toArray(patch.hunks)
                .map((h) => h.content)
                .join("\n");
            return `=== ${patch.path}${status} ===\n${hunks}`;
        })
        .join("\n\n");
};

/**
 * Handle user feedback when AI review approves the draft.
 * Returns the user's decision to approve or request changes.
 */
export const getUserFeedback = (
    diffs: ReadonlyArray<FilePatch>,
    cycle: number,
): Effect.Effect<UserAction, UserCancel | Error> =>
    Effect.gen(function* () {
        const diffText = formatDiffs(diffs);
        yield* Effect.sync(() => note(renderMarkdownSnippet(diffText), `Changes (Cycle ${cycle})`));

        const action = yield* runPrompt(() =>
            select({
                message: "AI review approved these changes. What would you like to do?",
                options: [
                    { value: "approve", label: "Approve and finalize" },
                    { value: "reject", label: "Request changes" },
                    { value: "view", label: "View full diffs" },
                ],
            }),
        );

        if (action === "view") {
            yield* Effect.sync(() => note(renderMarkdownSnippet(diffText), "Full Diffs"));
            const finalAction = yield* runPrompt(() =>
                select({
                    message: "What would you like to do with these changes?",
                    options: [
                        { value: "approve", label: "Approve and finalize" },
                        { value: "reject", label: "Request changes" },
                    ],
                }),
            );

            if (finalAction === "reject") {
                const comment = yield* runPrompt(() =>
                    text({
                        message: "What changes would you like?",
                        placeholder: "e.g., Fix the typo in the header, rename the variable...",
                    }),
                );
                return { type: "reject" as const, comment };
            }
            return { type: "approve" as const };
        }

        if (action === "reject") {
            const comment = yield* runPrompt(() =>
                text({
                    message: "What changes would you like?",
                    placeholder: "e.g., Make the tone more formal, add more examples...",
                }),
            );
            return { type: "reject" as const, comment };
        }

        return { type: "approve" as const };
    });

/**
 * Handle workflow errors by displaying error info.
 * Returns WorkflowErrorHandled to signal graceful exit, or rethrows UserCancel.
 */
export const handleWorkflowError = (
    error: unknown,
    s: ReturnType<typeof spinner>,
    vfs: VFS,
): Effect.Effect<RunResult, UserCancel | WorkflowErrorHandled> =>
    Effect.gen(function* () {
        yield* Effect.sync(() => s.stop());

        if (shouldRethrow(error)) {
            return yield* error;
        }

        yield* displayError(error);

        yield* vfs.getDiffs().pipe(
            Effect.flatMap((diffs) =>
                Effect.gen(function* () {
                    if (Chunk.size(diffs) > 0) {
                        const files = Chunk.map(diffs, (d) => d.path).pipe(Chunk.join(", "));
                        log.warn(`There are unsaved changes in: ${files}`);

                        const shouldSave = yield* runPrompt(() =>
                            select({
                                message: "Would you like to save these changes?",
                                options: [
                                    { value: "yes", label: "Yes, save changes" },
                                    { value: "no", label: "No, discard" },
                                ],
                            }),
                        );

                        if (shouldSave === "yes") {
                            const savedFiles = yield* vfs.flush();
                            yield* Effect.sync(() => {
                                log.success(`Saved ${savedFiles.length} file(s): ${savedFiles.join(", ")}`);
                            });
                        } else {
                            yield* Effect.sync(() => log.info("Changes discarded."));
                        }
                    }
                }),
            ),
            Effect.catchAll((e) => Effect.sync(() => log.error(`Failed to check for unsaved changes: ${e}`))),
        );

        return yield* new WorkflowErrorHandled({});
    });

/**
 * Process agent events for CLI output, driving the spinner and log messages.
 */
export const makeEventProcessor = (
    s: ReturnType<typeof spinner>,
    agentSession: { submitUserAction: (action: UserAction) => Effect.Effect<void, unknown> },
) => {
    let currentWindowContent = "";

    return (event: AgentEvent) =>
        Effect.gen(function* () {
            yield* Effect.logDebug(`Processing agent event: ${event._tag}`);

            switch (event._tag) {
                case "Progress": {
                    yield* Effect.sync(() => {
                        log.step(`[Cycle ${event.cycle}] ${event.message}`);
                        currentWindowContent = "";
                    });
                    break;
                }
                case "StreamChunk": {
                    currentWindowContent += event.content;
                    yield* Effect.sync(() => s.message(formatWindow(currentWindowContent)));
                    break;
                }
                case "DraftComplete": {
                    yield* Effect.sync(() => {
                        s.stop(formatWindow(currentWindowContent));
                        log.success("Draft complete");
                        currentWindowContent = "";
                    });
                    break;
                }
                case "ReviewComplete": {
                    yield* Effect.sync(() => {
                        if (event.approved) {
                            log.success("AI review approved");
                        } else {
                            log.warn("AI review rejected");
                            if (event.critique) {
                                note(renderMarkdownSnippet(event.critique), "AI Critique");
                            }
                        }
                    });
                    break;
                }
                case "UserActionRequired": {
                    yield* Effect.sync(() => s.stop("Awaiting your review..."));

                    const userAction = yield* getUserFeedback(event.diffs, event.cycle);

                    yield* agentSession.submitUserAction(userAction);

                    if (userAction.type === "reject") {
                        yield* Effect.sync(() => s.start("Processing your feedback..."));
                    }
                    break;
                }
                case "IterationLimitReached": {
                    yield* Effect.sync(() => {
                        s.stop("Iteration limit reached");
                        log.warn(`Maximum iterations (${event.iterations}) reached.`);
                    });
                    break;
                }
            }
        });
};

/**
 * Run the agent event loop and display results. Shared between write and resume commands.
 */
export const runAgentWorkflow = (
    agentSession: {
        events: Stream.Stream<AgentEvent>;
        result: Effect.Effect<RunResult, unknown>;
        submitUserAction: (action: UserAction) => Effect.Effect<void, unknown>;
    },
    s: ReturnType<typeof spinner>,
    vfs: VFS,
) =>
    Effect.gen(function* () {
        const processEvent = makeEventProcessor(s, agentSession);

        const eventProcessor = yield* agentSession.events.pipe(Stream.runForEach(processEvent), Effect.fork);

        const agentResult = yield* agentSession.result.pipe(
            Effect.catchAll((error) => handleWorkflowError(error, s, vfs)),
        );

        yield* Fiber.join(eventProcessor);

        yield* Effect.sync(() => {
            s.stop("Workflow complete");
            note(renderMarkdown(agentResult.finalContent), "Final Content");
            log.info(`Completed in ${agentResult.iterations} cycle(s)`);
            log.info(`Total cost: $${agentResult.totalCost.toFixed(6)}`);
        });
    }).pipe(
        Effect.catchAll((error) => {
            if (error instanceof UserCancel) {
                cancel("Operation cancelled.");
                return Effect.void;
            }
            if (error instanceof WorkflowErrorHandled) {
                return Effect.void;
            }
            return Effect.fail(error);
        }),
    );
