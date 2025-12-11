import { intro, outro } from "@clack/prompts";
import { Command } from "commander";
import { Effect } from "effect";
import { getApiKeySetupMessage, getConfigPath, getOpenRouterApiKey, setOpenRouterApiKey } from "../config.js";

export const configCommand = new Command("config").description("Manage jot-cli configuration");

configCommand
    .command("set-key")
    .description("Set your OpenRouter API key")
    .argument("<api-key>", "Your OpenRouter API key")
    .action(async (apiKey) => {
        intro(`🔑 Jot CLI - Configuration`);

        try {
            await Effect.runPromise(setOpenRouterApiKey(apiKey));
            outro(`API key saved successfully at: ${getConfigPath()}`);
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
    .action(() => {
        console.log(getConfigPath());
    });

configCommand
    .command("status")
    .description("Check if API key is configured")
    .action(async () => {
        const apiKey = await Effect.runPromise(getOpenRouterApiKey);
        if (apiKey) {
            console.log("✓ API key is configured");
            console.log(`Config location: ${getConfigPath()}`);
        } else {
            console.log("✗ API key is not configured");
            console.log("");
            console.log(getApiKeySetupMessage());
        }
    });
