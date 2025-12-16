import { FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { Effect, Ref, Schema } from "effect";
import { CONFIG_DIR_NAME, CONFIG_FILE_NAME, DEFAULT_MAX_AGENT_ITERATIONS } from "@/domain/constants";
import { ConfigDirError, ConfigReadError, ConfigWriteError } from "@/domain/errors";

export class UserConfig extends Schema.Class<UserConfig>("UserConfig")({
    openRouterApiKey: Schema.optional(Schema.String),
    /** Maximum iterations for the autonomous agent loop */
    agentMaxIterations: Schema.optionalWith(Schema.Number, { default: () => DEFAULT_MAX_AGENT_ITERATIONS }),
}) {}

const getConfigDir = Effect.gen(function* () {
    const path = yield* Path.Path;
    const homeDir = process.env.HOME ?? process.env.USERPROFILE;

    if (!homeDir) {
        return yield* Effect.fail(new ConfigDirError({ cause: "Could not determine home directory" }));
    }

    if (process.platform === "win32") {
        const appData = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
        return path.join(appData, CONFIG_DIR_NAME);
    }

    const configHome = process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config");
    return path.join(configHome, CONFIG_DIR_NAME);
});

const getConfigPath = Effect.gen(function* () {
    const path = yield* Path.Path;
    const dir = yield* getConfigDir;
    return path.join(dir, CONFIG_FILE_NAME);
});

export class Config extends Effect.Service<Config>()("services/config", {
    effect: Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const configPath = yield* getConfigPath;

        const initialConfig = yield* fs.readFileString(configPath).pipe(
            Effect.flatMap((content) => Schema.decodeUnknown(Schema.parseJson(UserConfig))(content)),
            Effect.catchTag("SystemError", (error) => {
                if (error.reason === "NotFound") {
                    return Effect.succeed(new UserConfig({}));
                }
                return Effect.fail(new ConfigReadError({ cause: error }));
            }),
            Effect.catchAllCause((cause) => Effect.fail(new ConfigReadError({ cause }))),
        );

        const configRef = yield* Ref.make(initialConfig);

        return {
            get: Ref.get(configRef),
            update: (patch: Partial<UserConfig>) =>
                Effect.gen(function* () {
                    const newConfig = yield* Ref.updateAndGet(
                        configRef,
                        (current) => new UserConfig({ ...current, ...patch }),
                    );

                    const configDir = path.dirname(configPath);

                    yield* fs
                        .makeDirectory(configDir, { recursive: true })
                        .pipe(Effect.catchAll((error) => Effect.fail(new ConfigWriteError({ cause: error }))));

                    yield* fs
                        .writeFileString(configPath, JSON.stringify(newConfig, null, 2))
                        .pipe(Effect.catchAll((error) => Effect.fail(new ConfigWriteError({ cause: error }))));
                }),
            location: configPath,
        };
    }),
    dependencies: [BunContext.layer],
    accessors: true,
}) {}
