import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Context, Effect, Layer, Ref, Schema } from "effect";
import { CONFIG_DIR_NAME, CONFIG_FILE_NAME } from "../constants.js";

// Schema definition using Effect Schema
export class UserConfig extends Schema.Class<UserConfig>("UserConfig")({
    openRouterApiKey: Schema.optional(Schema.String),
}) {}

// Service interface
export class ConfigService extends Context.Tag("ConfigService")<
    ConfigService,
    {
        readonly get: Effect.Effect<UserConfig, never, never>;
        readonly update: (partial: Partial<UserConfig>) => Effect.Effect<void, Error, never>;
        readonly getPath: Effect.Effect<string, never, never>;
    }
>() {}

// Helper functions for path resolution
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

// Read config from disk
async function readConfigFromDisk(): Promise<UserConfig> {
    const configPath = getConfigPath();

    try {
        const content = await fs.readFile(configPath, "utf-8");
        const parsed = JSON.parse(content);
        return Schema.decodeUnknownSync(UserConfig)(parsed);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            // File doesn't exist, return empty config
            return new UserConfig({});
        }
        throw new Error(`Failed to read config file: ${error}`);
    }
}

// Write config to disk
async function writeConfigToDisk(config: UserConfig): Promise<void> {
    await ensureConfigDir();
    const configPath = getConfigPath();

    try {
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
    } catch (error) {
        throw new Error(`Failed to write config file: ${error}`);
    }
}

// Live layer implementation
export const ConfigLive = Layer.effect(
    ConfigService,
    Effect.gen(function* () {
        // Load initial config from disk
        const initialConfig = yield* Effect.tryPromise({
            try: () => readConfigFromDisk(),
            catch: (error) => new Error(`Failed to load config: ${error}`),
        });

        // Create a Ref to hold the config in memory
        const configRef = yield* Ref.make(initialConfig);

        return ConfigService.of({
            get: Ref.get(configRef),
            update: (partial: Partial<UserConfig>) =>
                Effect.gen(function* () {
                    // Get current config
                    const current = yield* Ref.get(configRef);
                    // Merge with partial update
                    const updated = new UserConfig({ ...current, ...partial });
                    // Update in-memory state
                    yield* Ref.set(configRef, updated);
                    // Persist to disk
                    yield* Effect.tryPromise({
                        try: () => writeConfigToDisk(updated),
                        catch: (error) => new Error(`Failed to write config: ${error}`),
                    });
                }),
            getPath: Effect.succeed(getConfigPath()),
        });
    }),
);

// Helper function for API key setup message
export function getApiKeySetupMessage(): string {
    return `OpenRouter API key is not configured.

To set your API key, run:
  jot config set-key YOUR_API_KEY

Get your API key from: https://openrouter.ai/

The configuration will be stored at: ${getConfigPath()}`;
}
