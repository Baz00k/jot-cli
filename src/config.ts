import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Config, ConfigProvider, Effect, Option } from "effect";
import { CONFIG_DIR_NAME, CONFIG_FILE_NAME } from "./constants.js";

type ConfigData = {
    openRouterApiKey?: string;
};

const configDefinition = Config.all({
    openRouterApiKey: Config.option(Config.string("openRouterApiKey")),
});

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

export function getConfigPath(): string {
    return path.join(getConfigDir(), CONFIG_FILE_NAME);
}

const wrapError =
    (message: string) =>
    (error: unknown): Error =>
        new Error(`${message}: ${error instanceof Error ? error.message : String(error)}`);

const ensureConfigDir = Effect.tryPromise({
    try: () => fs.mkdir(getConfigDir(), { recursive: true }),
    catch: (error) => error as Error,
});

const readConfigEffect = Effect.gen(function* () {
    const configPath = getConfigPath();

    const provider = yield* Effect.tryPromise({
        try: async () => {
            const content = await fs.readFile(configPath, "utf-8");
            return ConfigProvider.fromJson(JSON.parse(content));
        },
        catch: (error) => error as Error,
    }).pipe(
        Effect.catchAll((error) => {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return Effect.succeed(ConfigProvider.fromJson({}));
            }

            return Effect.fail(error);
        }),
    );

    const config = yield* Effect.withConfigProvider(provider)(configDefinition);

    return {
        openRouterApiKey: Option.getOrUndefined(config.openRouterApiKey),
    } satisfies ConfigData;
}).pipe(Effect.mapError(wrapError("Failed to read config file")));

const writeConfig = (config: ConfigData) =>
    Effect.gen(function* () {
        yield* ensureConfigDir;
        const configPath = getConfigPath();
        yield* Effect.tryPromise({
            try: () => fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8"),
            catch: (error) => error as Error,
        });
    }).pipe(Effect.mapError(wrapError("Failed to write config file")));

export const getOpenRouterApiKey = readConfigEffect.pipe(Effect.map((config) => config.openRouterApiKey));

export const setOpenRouterApiKey = (apiKey: string) =>
    Effect.gen(function* () {
        const config = yield* readConfigEffect;
        yield* writeConfig({ ...config, openRouterApiKey: apiKey });
    }).pipe(Effect.mapError(wrapError("Failed to save config file")));

export const hasOpenRouterApiKey = readConfigEffect.pipe(Effect.map((config) => !!config.openRouterApiKey));

export function getApiKeySetupMessage(): string {
    return `OpenRouter API key is not configured.

To set your API key, run:
  jot config set-key YOUR_API_KEY

Get your API key from: https://openrouter.ai/

The configuration will be stored at: ${getConfigPath()}`;
}
