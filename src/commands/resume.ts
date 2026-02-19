import { cancel, intro, log, outro, select, spinner } from "@clack/prompts";
import { Args, Command } from "@effect/cli";
import { Effect, Option } from "effect";
import { runAgentWorkflow } from "@/commands/utils/workflow";
import { UserCancel, WorkflowErrorHandled } from "@/domain/errors";
import { Agent } from "@/services/agent";
import { Session, type SessionData } from "@/services/session";
import { VFS } from "@/services/vfs";

const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const truncate = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 3)}...` : text);

const getPrompt = (session: SessionData): string => {
    const entry = session.entries.find((e) => e._tag === "UserInput");
    if (entry && "prompt" in entry) {
        return entry.prompt as string;
    }
    return "(no prompt)";
};

const formatSessionLabel = (session: SessionData): string => {
    const prompt = truncate(getPrompt(session), 35);
    const status = session.status.charAt(0).toUpperCase();
    return `[${status}] ${prompt} (${formatDate(session.startedAt)})`;
};

export const resumeCommand = Command.make(
    "resume",
    {
        args: Args.text({ name: "session-id" }).pipe(
            Args.withDescription("Session ID to resume (omit to pick interactively)"),
            Args.optional,
        ),
    },
    ({ args: sessionIdOption }) =>
        Effect.gen(function* () {
            yield* Effect.sync(() => intro(`Jot CLI - Resume Session`));

            const sessionService = yield* Session;
            const sessionIdArg = Option.getOrUndefined(sessionIdOption);

            let sessionId: string;

            if (sessionIdArg) {
                const exists = yield* sessionService.get(sessionIdArg);
                if (!exists) {
                    yield* Effect.sync(() => log.error(`Session not found: ${sessionIdArg}`));
                    yield* Effect.sync(() => outro(""));
                    return;
                }
                sessionId = sessionIdArg;
            } else {
                const sessions = yield* sessionService.list();

                if (sessions.length === 0) {
                    yield* Effect.sync(() => log.info("No previous sessions found."));
                    yield* Effect.sync(() => outro(""));
                    return;
                }

                const selected = yield* Effect.tryPromise({
                    try: async () => {
                        const result = await select({
                            message: "Select a session to resume",
                            options: sessions.map((s) => ({
                                value: s.id,
                                label: formatSessionLabel(s),
                            })),
                        });
                        if (typeof result === "symbol") {
                            throw new UserCancel();
                        }
                        return result as string;
                    },
                    catch: (e) => (e instanceof UserCancel ? e : new UserCancel()),
                });

                sessionId = selected;
            }

            yield* Effect.sync(() => log.info(`Resuming session: ${sessionId}`));

            const agent = yield* Agent;
            const vfs = yield* VFS;
            const s = spinner();
            yield* Effect.sync(() => s.start("Resuming session..."));

            const agentSession = yield* agent.run({ sessionId });

            yield* runAgentWorkflow(agentSession, s, vfs);

            yield* Effect.sync(() => outro("Done! Happy writing."));
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
        ),
).pipe(Command.withDescription("Resume a previous writing session"));
