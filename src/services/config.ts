import { FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { Effect, Layer, Ref, Schema } from "effect";
import { DEFAULT_MAX_AGENT_ITERATIONS } from "@/domain/constants";
import { ConfigReadError, ConfigWriteError } from "@/domain/errors";
import { UserDirs } from "@/services/user-dirs";

export class UserConfig extends Schema.Class<UserConfig>("UserConfig")({
    openRouterApiKey: Schema.optional(Schema.String),
    /** Maximum iterations for the autonomous agent loop */
    agentMaxIterations: Schema.optionalWith(
        Schema.Int.pipe(
            Schema.between(1, 100, {
                message: () => "agentMaxIterations must be an integer between 1 and 100",
            }),
        ),
        {
            default: () => DEFAULT_MAX_AGENT_ITERATIONS,
        },
    ),
    /** Default model for drafting content */
    writerModel: Schema.optional(Schema.String),
    /** Default model for reviewing content */
    reviewerModel: Schema.optional(Schema.String),
    /** Enable reasoning for thinking models */
    reasoning: Schema.optionalWith(Schema.Boolean, { default: () => true }),
    /** Effort level for reasoning (low, medium, high) */
    reasoningEffort: Schema.optionalWith(Schema.Literal("low", "medium", "high"), { default: () => "high" as const }),
    googleAntigravity: Schema.optional(
        Schema.Struct({
            accessToken: Schema.String,
            refreshToken: Schema.optional(Schema.String),
            expiresAt: Schema.optional(Schema.Number),
        }),
    ),
}) {}

export class Config extends Effect.Service<Config>()("services/config", {
    effect: Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const configPath = yield* UserDirs.getPath("config", "config.json");

        yield* Effect.logDebug(`Loading config from ${configPath}`);

        const initialConfig = yield* fs.readFileString(configPath).pipe(
            Effect.flatMap((content) => Schema.decodeUnknown(Schema.parseJson(UserConfig))(content)),
            Effect.catchTag("SystemError", (error) => {
                if (error.reason === "NotFound") {
                    return Effect.succeed(new UserConfig({})).pipe(
                        Effect.tap(() => Effect.logDebug("Default config created")),
                    );
                }
                return Effect.fail(new ConfigReadError({ cause: error }));
            }),
            Effect.catchAllCause((cause) => Effect.fail(new ConfigReadError({ cause }))),
        );

        yield* Effect.logDebug("Config loaded successfully");

        const configRef = yield* Ref.make(initialConfig);

        return {
            get: Ref.get(configRef),
            update: (patch: Partial<UserConfig>) =>
                Effect.gen(function* () {
                    const newConfig = yield* Ref.updateAndGet(
                        configRef,
                        (current) => new UserConfig({ ...current, ...patch }),
                    );

                    yield* Effect.logDebug(`Updating config at ${configPath}`);

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
    dependencies: [BunContext.layer, UserDirs.Default],
    accessors: true,
}) {}

export const TestConfig = new Config({
    get: Effect.succeed(
        new UserConfig({
            openRouterApiKey: "test-api-key",
            reviewerModel: "test-reviewer-model",
            writerModel: "test-writer-model",
            agentMaxIterations: DEFAULT_MAX_AGENT_ITERATIONS,
            reasoning: true,
            reasoningEffort: "high",
        }),
    ),
    update: () => Effect.succeed(undefined),
    location: "test",
});

export const TestConfigLayer = Layer.succeed(Config, TestConfig);
