import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";

const ConfigSchema = z.object({
    openRouterApiKey: z.string().optional(),
});

type Config = z.infer<typeof ConfigSchema>;

const CONFIG_DIR_NAME = "jot-cli";
const CONFIG_FILE_NAME = "config.json";

function getConfigDir(): string {
    const platform = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE;

    if (!homeDir) {
        throw new Error("Could not determine home directory");
    }

    if (platform === "win32") {
        const appData = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
        return path.join(appData, CONFIG_DIR_NAME);
    }

    // Unix-like systems (Linux, macOS)
    const configHome = process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config");
    return path.join(configHome, CONFIG_DIR_NAME);
}

function getConfigPath(): string {
    return path.join(getConfigDir(), CONFIG_FILE_NAME);
}

async function ensureConfigDir(): Promise<void> {
    const configDir = getConfigDir();
    try {
        await fs.mkdir(configDir, { recursive: true });
    } catch (error) {
        throw new Error(`Failed to create config directory: ${error}`);
    }
}

async function readConfig(): Promise<Config> {
    const configPath = getConfigPath();

    try {
        const content = await fs.readFile(configPath, "utf-8");
        const parsed = JSON.parse(content);
        return ConfigSchema.parse(parsed);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return {};
        }
        throw new Error(`Failed to read config file: ${error}`);
    }
}

async function writeConfig(config: Config): Promise<void> {
    await ensureConfigDir();
    const configPath = getConfigPath();

    try {
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
    } catch (error) {
        throw new Error(`Failed to write config file: ${error}`);
    }
}

export async function getConfig(): Promise<Config> {
    return readConfig();
}

export async function getOpenRouterApiKey(): Promise<string | undefined> {
    const config = await readConfig();
    return config.openRouterApiKey;
}

export async function setOpenRouterApiKey(apiKey: string): Promise<void> {
    const config = await readConfig();
    config.openRouterApiKey = apiKey;
    await writeConfig(config);
}

export async function hasOpenRouterApiKey(): Promise<boolean> {
    const apiKey = await getOpenRouterApiKey();
    return !!apiKey;
}

export function getConfigLocation(): string {
    return getConfigPath();
}

export function getApiKeySetupMessage(): string {
    return `OpenRouter API key is not configured.

To set your API key, run:
  jot config set-key YOUR_API_KEY

Get your API key from: https://openrouter.ai/

The configuration will be stored at: ${getConfigPath()}`;
}
