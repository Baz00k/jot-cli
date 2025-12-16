import { intro, outro } from "@clack/prompts";
import { Args, Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { Messages } from "@/domain/messages";
import { Config } from "@/services/config";

const setKey = Command.make(
    "set-key",
    {
        args: Args.text({ name: "api-key" }).pipe(Args.withDescription("Your OpenRouter API key")),
    },
    (args) =>
        Effect.gen(function* () {
            const config = yield* Config;
            const apiKey = args.args;
            intro(`🔑 Jot CLI - Configuration`);

            yield* config.update({ openRouterApiKey: apiKey });

            outro(`API key saved successfully at: ${config.location}`);
        }),
).pipe(Command.withDescription("Set your OpenRouter API key"));

const showPath = Command.make("show-path", {}, () =>
    Effect.gen(function* () {
        const config = yield* Config;
        yield* Console.log(config.location);
    }),
).pipe(Command.withDescription("Show the configuration file location"));

const status = Command.make("status", {}, () =>
    Effect.gen(function* () {
        const config = yield* Config;
        const userConfig = yield* config.get;

        if (userConfig.openRouterApiKey) {
            yield* Console.log(Messages.apiKeyConfigured(config.location));
        } else {
            yield* Console.log(Messages.apiKeySetup(config.location));
        }
    }),
).pipe(Command.withDescription("Check if API key is configured"));

export const configCommand = Command.make("config").pipe(
    Command.withDescription("Manage jot-cli configuration"),
    Command.withSubcommands([setKey, showPath, status]),
);
