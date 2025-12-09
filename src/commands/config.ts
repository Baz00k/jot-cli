import { intro, outro } from "@clack/prompts";
import { Command } from "commander";
import { getApiKeySetupMessage, getConfigLocation, getOpenRouterApiKey, setOpenRouterApiKey } from "../config.js";

export const configCommand = new Command("config").description("Manage jot-cli configuration");

configCommand
    .command("set-key")
    .description("Set your OpenRouter API key")
    .argument("<api-key>", "Your OpenRouter API key")
    .action(async (apiKey) => {
        intro(`🔑 Jot CLI - Configuration`);

        try {
            await setOpenRouterApiKey(apiKey);
            outro(`API key saved successfully at: ${getConfigLocation()}`);
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
        console.log(getConfigLocation());
    });

configCommand
    .command("status")
    .description("Check if API key is configured")
    .action(async () => {
        const apiKey = await getOpenRouterApiKey();
        if (apiKey) {
            console.log("✓ API key is configured");
            console.log(`Config location: ${getConfigLocation()}`);
        } else {
            console.log("✗ API key is not configured");
            console.log("");
            console.log(getApiKeySetupMessage());
        }
    });
