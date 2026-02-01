import { intro, outro } from "@clack/prompts";
import { Args, Command, Options } from "@effect/cli";
import { Console, Effect, Option } from "effect";
import { Messages } from "@/domain/messages";
import { reasoningOptions } from "@/services/agent";
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

const setWriter = Command.make(
    "set-writer",
    {
        args: Args.text({ name: "model" }).pipe(Args.withDescription("Model name for drafting")),
    },
    (args) =>
        Effect.gen(function* () {
            const config = yield* Config;
            const model = args.args;
            intro(`📝 Jot CLI - Set Writer Model`);

            yield* config.update({ writerModel: model });

            outro(`Writer model set to: ${model}`);
        }),
).pipe(Command.withDescription("Set default writer model"));

const setReviewer = Command.make(
    "set-reviewer",
    {
        args: Args.text({ name: "model" }).pipe(Args.withDescription("Model name for reviewing")),
    },
    (args) =>
        Effect.gen(function* () {
            const config = yield* Config;
            const model = args.args;
            intro(`🔍 Jot CLI - Set Reviewer Model`);

            yield* config.update({ reviewerModel: model });

            outro(`Reviewer model set to: ${model}`);
        }),
).pipe(Command.withDescription("Set default reviewer model"));

const setReasoning = Command.make(
    "set-reasoning",
    {
        options: Options.all({
            enabled: Options.boolean("enabled").pipe(
                Options.withDefault(true),
                Options.withDescription("Enable reasoning for thinking models"),
            ),
            effort: Options.choice("effort", reasoningOptions.literals).pipe(
                Options.withDefault("high"),
                Options.withDescription("Effort level for reasoning (low, medium, high)"),
            ),
        }),
    },
    ({ options }) =>
        Effect.gen(function* () {
            const config = yield* Config;
            intro(`🧠 Jot CLI - Set Reasoning Preferences`);

            yield* config.update({
                reasoning: options.enabled,
                reasoningEffort: options.effort,
            });

            outro(`Reasoning ${options.enabled ? "enabled" : "disabled"} with effort: ${options.effort}`);
        }),
).pipe(Command.withDescription("Set reasoning preferences"));

const setOpenAICompatible = Command.make(
    "set-openai-compatible",
    {
        options: Options.all({
            baseUrl: Options.optional(Options.text("base-url")).pipe(
                Options.withDescription("Base URL for the OpenAI-compatible API (e.g., http://localhost:11434/v1)"),
            ),
            apiKey: Options.optional(Options.text("api-key")).pipe(
                Options.withDescription("API key for the OpenAI-compatible provider (optional)"),
            ),
        }),
    },
    ({ options }) =>
        Effect.gen(function* () {
            const config = yield* Config;
            const currentConfig = yield* config.get;
            intro(`🔌 Jot CLI - Configure OpenAI-Compatible Provider`);

            const existing = currentConfig.openaiCompatible;
            const newBaseUrl = Option.getOrUndefined(options.baseUrl);
            const newApiKey = Option.getOrUndefined(options.apiKey);

            if (!existing && !newBaseUrl) {
                return yield* Effect.fail(new Error("No existing configuration found. Please provide --base-url."));
            }

            const baseUrl = newBaseUrl !== undefined ? newBaseUrl : existing?.baseUrl;

            if (!baseUrl) {
                return yield* Effect.fail(
                    new Error("Base URL is required but not provided or found in existing config."),
                );
            }

            yield* config.update({
                openaiCompatible: {
                    baseUrl,
                    apiKey: newApiKey !== undefined ? newApiKey : existing?.apiKey,
                },
            });

            outro(`OpenAI-compatible provider configured with base URL: ${baseUrl}`);
        }),
).pipe(Command.withDescription("Configure an OpenAI-compatible provider (e.g., local LLM, proxy)"));

const clearOpenAICompatible = Command.make("clear-openai-compatible", {}, () =>
    Effect.gen(function* () {
        const config = yield* Config;
        intro(`🗑️  Jot CLI - Clear OpenAI-Compatible Provider`);

        yield* config.update({
            openaiCompatible: undefined,
        });

        outro("OpenAI-compatible provider configuration cleared. Using OpenRouter as default.");
    }),
).pipe(Command.withDescription("Remove OpenAI-compatible provider configuration"));

export const configCommand = Command.make("config").pipe(
    Command.withDescription("Manage jot-cli configuration"),
    Command.withSubcommands([
        setKey,
        showPath,
        status,
        setWriter,
        setReviewer,
        setReasoning,
        setOpenAICompatible,
        clearOpenAICompatible,
    ]),
);
