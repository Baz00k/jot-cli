import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Context, Effect, Layer, Ref, Schema } from "effect";
import { CONFIG_DIR_NAME, CONFIG_FILE_NAME } from "../constants.js";

export class UserConfig extends Schema.Class<UserConfig>("UserConfig")({
    openRouterApiKey: Schema.optional(Schema.String),
}) {}

export class ConfigService extends Context.Tag("ConfigService")<
    ConfigService,
    {
        readonly get: Effect.Effect<UserConfig, never, never>;
        readonly update: (partial: Partial<UserConfig>) => Effect.Effect<void, Error, never>;
        readonly getPath: Effect.Effect<string, Error, never>;
    }
>() {}

const getConfigDir = (): Effect.Effect<string, Error, never> =>
    Effect.gen(function* () {
        const platform = process.platform;
        const homeDir = process.env.HOME || process.env.USERPROFILE;

        if (!homeDir) {
            return yield* Effect.fail(new Error("Could not determine home directory"));
        }

        if (platform === "win32") {
            const appData = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
            return path.join(appData, CONFIG_DIR_NAME);
        }

        const configHome = process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config");
        return path.join(configHome, CONFIG_DIR_NAME);
    });

const getConfigPath = (): Effect.Effect<string, Error, never> =>
    Effect.gen(function* () {
        const configDir = yield* getConfigDir();
        return path.join(configDir, CONFIG_FILE_NAME);
    });

const ensureConfigDir = (): Effect.Effect<void, Error, never> =>
    Effect.gen(function* () {
        const configDir = yield* getConfigDir();
        yield* Effect.tryPromise({
            try: () => fs.mkdir(configDir, { recursive: true }),
            catch: (error) => new Error(`Failed to create config directory: ${error}`),
        });
    });

const readConfigFromDisk = (): Effect.Effect<UserConfig, Error, never> =>
    Effect.gen(function* () {
        const configPath = yield* getConfigPath();

        return yield* Effect.tryPromise({
            try: async () => {
                try {
                    const content = await fs.readFile(configPath, "utf-8");
                    const parsed = JSON.parse(content);
                    return Schema.decodeUnknownSync(UserConfig)(parsed);
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                        return new UserConfig({});
                    }
                    throw error;
                }
            },
            catch: (error) => new Error(`Failed to read config file: ${error}`),
        });
    });

const writeConfigToDisk = (config: UserConfig): Effect.Effect<void, Error, never> =>
    Effect.gen(function* () {
        yield* ensureConfigDir();
        const configPath = yield* getConfigPath();

        yield* Effect.tryPromise({
            try: () => fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8"),
            catch: (error) => new Error(`Failed to write config file: ${error}`),
        });
    });

export const ConfigLive = Layer.effect(
    ConfigService,
    Effect.gen(function* () {
        const initialConfig = yield* readConfigFromDisk();
        const configRef = yield* Ref.make(initialConfig);

        return ConfigService.of({
            get: Ref.get(configRef),
            update: (partial: Partial<UserConfig>) =>
                Effect.gen(function* () {
                    const current = yield* Ref.get(configRef);
                    const updated = new UserConfig({ ...current, ...partial });
                    yield* Ref.set(configRef, updated);
                    yield* writeConfigToDisk(updated);
                }),
            getPath: getConfigPath(),
        });
    }),
);

export const getApiKeySetupMessage = (): Effect.Effect<string, Error, never> =>
    Effect.gen(function* () {
        const configPath = yield* getConfigPath();
        return `OpenRouter API key is not configured.

To set your API key, run:
  jot config set-key YOUR_API_KEY

Get your API key from: https://openrouter.ai/

The configuration will be stored at: ${configPath}`;
    });

export const getApiKeySetupMessageSync = (): string => {
    const platform = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE;

    if (!homeDir) {
        return "OpenRouter API key is not configured. Could not determine config location.";
    }

    let configPath: string;
    if (platform === "win32") {
        const appData = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
        configPath = path.join(appData, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
    } else {
        const configHome = process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config");
        configPath = path.join(configHome, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
    }

    return `OpenRouter API key is not configured.

To set your API key, run:
  jot config set-key YOUR_API_KEY

Get your API key from: https://openrouter.ai/

The configuration will be stored at: ${configPath}`;
};
