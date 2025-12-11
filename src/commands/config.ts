import { intro, outro } from "@clack/prompts";
import { Command } from "commander";
import { Effect } from "effect";
import { ConfigService, getApiKeySetupMessage } from "../services/ConfigService.js";

export const configCommand = new Command("config").description("Manage jot-cli configuration");

configCommand
    .command("set-key")
    .description("Set your OpenRouter API key")
    .argument("<api-key>", "Your OpenRouter API key")
    .action(async (apiKey) => {
        intro(`🔑 Jot CLI - Configuration`);

        const program = Effect.gen(function* () {
            const configService = yield* ConfigService;
            yield* configService.update({ openRouterApiKey: apiKey });
            const configPath = yield* configService.getPath;
            return configPath;
        });

        try {
            const configPath = await globalThis.configRuntime.runPromise(program);
            outro(`API key saved successfully at: ${configPath}`);
        } catch (error) {
            if (error instanceof Error) {
                outro(`Failed to save API key: ${error.message}`);
            } else {
                outro(`Failed to save API key: ${error}`);
            }
            process.exit(1);
        }
    });

configCommand
    .command("show-path")
    .description("Show the configuration file location")
    .action(async () => {
        const program = Effect.gen(function* () {
            const configService = yield* ConfigService;
            return yield* configService.getPath;
        });

        const configPath = await globalThis.configRuntime.runPromise(program);
        console.log(configPath);
    });

configCommand
    .command("status")
    .description("Check if API key is configured")
    .action(async () => {
        const program = Effect.gen(function* () {
            const configService = yield* ConfigService;
            const config = yield* configService.get;
            const configPath = yield* configService.getPath;
            const setupMessage = yield* getApiKeySetupMessage();
            return { apiKey: config.openRouterApiKey, configPath, setupMessage };
        });

        const { apiKey, configPath, setupMessage } = await globalThis.configRuntime.runPromise(program);
        if (apiKey) {
            console.log("✓ API key is configured");
            console.log(`Config location: ${configPath}`);
        } else {
            console.log("✗ API key is not configured");
            console.log("");
            console.log(setupMessage);
        }
    });
