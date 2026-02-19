import { cancel, intro, outro, spinner, text } from "@clack/prompts";
import { Args, Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { runAgentWorkflow, runPrompt } from "@/commands/utils/workflow";
import { UserCancel, WorkflowErrorHandled } from "@/domain/errors";
import { Messages } from "@/domain/messages";
import { Agent, reasoningOptions } from "@/services/agent";
import { Config } from "@/services/config";
import { VFS } from "@/services/vfs";

export const writeCommand = Command.make(
    "write",
    {
        args: Args.text({ name: "prompt" }).pipe(Args.withDescription("The writing instruction"), Args.optional),
        options: Options.all({
            writer: Options.text("writer").pipe(
                Options.optional,
                Options.withAlias("w"),
                Options.withDescription("Model for drafting"),
            ),
            reviewer: Options.text("reviewer").pipe(
                Options.optional,
                Options.withAlias("r"),
                Options.withDescription("Model for reviewing"),
            ),
            noReasoning: Options.boolean("no-reasoning").pipe(
                Options.optional,
                Options.withDescription("Disable reasoning for thinking models"),
            ),
            reasoningEffort: Options.choice("reasoning-effort", reasoningOptions.literals).pipe(
                Options.optional,
                Options.withDescription("Effort level for reasoning (low, medium, high)"),
            ),
            maxIterations: Options.integer("max-iterations").pipe(
                Options.optional,
                Options.withAlias("i"),
                Options.withDescription("Maximum revision cycles"),
            ),
        }),
    },
    ({ args: promptArgOption, options }) =>
        Effect.gen(function* () {
            const config = yield* Config;
            const promptArg = Option.getOrUndefined(promptArgOption);

            yield* Effect.sync(() => intro(`Jot CLI - AI Research Assistant`));

            const userConfig = yield* config.get;
            const apiKey = userConfig.openRouterApiKey;
            const isAntigravityAvailable = userConfig.googleAntigravity !== undefined;

            if (!apiKey && !isAntigravityAvailable) {
                yield* Effect.sync(() => outro(Messages.apiKeySetup(config.location)));
                return yield* Effect.fail(new Error("API key not configured"));
            }

            let userPrompt = promptArg;

            if (!userPrompt) {
                userPrompt = yield* runPrompt(() =>
                    text({
                        message: "What would you like me to write?",
                        placeholder: "e.g., Draft a section on the impact of transformers in NLP",
                        validate(value) {
                            if (value.length === 0) return "Value is required!";
                        },
                    }),
                );
            }

            const agent = yield* Agent;
            const vfs = yield* VFS;
            const s = spinner();
            yield* Effect.sync(() => s.start("Initializing agent..."));

            const agentSession = yield* agent.run({
                prompt: userPrompt,
                modelWriter: Option.getOrUndefined(options.writer),
                modelReviewer: Option.getOrUndefined(options.reviewer),
                reasoningEffort: Option.getOrUndefined(options.reasoningEffort),
                reasoning: Option.map(options.noReasoning, (no) => !no).pipe((v) => Option.getOrUndefined(v)),
                maxIterations: Option.getOrUndefined(options.maxIterations),
            });

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
);
