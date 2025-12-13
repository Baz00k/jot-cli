import { intro, outro } from "@clack/prompts";
import { Args, Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { getApiKeySetupMessage, getConfigLocation, getOpenRouterApiKey, setOpenRouterApiKey } from "@/config";

const setKey = Command.make(
    "set-key",
    {
        args: Args.text({ name: "api-key" }).pipe(Args.withDescription("Your OpenRouter API key")),
    },
    (args) =>
        Effect.gen(function* () {
            const apiKey = args.args;
            intro(`🔑 Jot CLI - Configuration`);
            yield* Effect.tryPromise({
                try: () => setOpenRouterApiKey(apiKey),
                catch: (e) => new Error(`Failed to save API key: ${e instanceof Error ? e.message : String(e)}`),
            });
            outro(`API key saved successfully at: ${getConfigLocation()}`);
        }),
).pipe(Command.withDescription("Set your OpenRouter API key"));

const showPath = Command.make("show-path", {}, () => Console.log(getConfigLocation())).pipe(
    Command.withDescription("Show the configuration file location"),
);

const status = Command.make("status", {}, () =>
    Effect.gen(function* () {
        const apiKey = yield* Effect.tryPromise(() => getOpenRouterApiKey());
        if (apiKey) {
            yield* Console.log("✓ API key is configured");
            yield* Console.log(`Config location: ${getConfigLocation()}`);
        } else {
            yield* Console.log("✗ API key is not configured");
            yield* Console.log("");
            yield* Console.log(getApiKeySetupMessage());
        }
    }),
).pipe(Command.withDescription("Check if API key is configured"));

export const configCommand = Command.make("config", { args: Args.none }, () => Effect.void).pipe(
    Command.withDescription("Manage jot-cli configuration"),
    Command.withSubcommands([setKey, showPath, status]),
);
