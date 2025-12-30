import { FileSystem, Path, PlatformLogger } from "@effect/platform";
import { Duration, Effect, Layer, Logger, Runtime } from "effect";
import { CONFIG_DIR_NAME, LOG_FILE_NAME } from "@/domain/constants";

export const getLogPath = Effect.gen(function* () {
    const path = yield* Path.Path;
    const dataDir = process.env.XDG_DATA_HOME ?? process.env.APPDATA;

    if (dataDir) {
        return path.join(dataDir, CONFIG_DIR_NAME, "logs", LOG_FILE_NAME);
    }

    const homeDir = process.env.HOME ?? process.env.USERPROFILE;

    if (homeDir) {
        if (process.platform === "win32") {
            return path.join(homeDir, "AppData", "Roaming", CONFIG_DIR_NAME, "logs", LOG_FILE_NAME);
        }

        return path.join(homeDir, ".local", "share", CONFIG_DIR_NAME, "logs", LOG_FILE_NAME);
    }

    return yield* Effect.fail("Unable to determine log path");
});

export const AppLogger = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const logPath = yield* getLogPath;

    // Ensure directory exists
    const dir = path.dirname(logPath);
    yield* fs.makeDirectory(dir, { recursive: true });

    const fileLogger = yield* Logger.logfmtLogger.pipe(
        PlatformLogger.toFile(logPath, { batchWindow: Duration.millis(100) }),
    );

    const runtime = yield* Layer.toRuntime(Logger.replace(Logger.defaultLogger, fileLogger));

    yield* Effect.acquireRelease(
        Effect.sync(() => {
            globalThis.AI_SDK_LOG_WARNINGS = ({ warnings, model }: { warnings: unknown[]; model?: string }) => {
                Runtime.runSync(runtime)(
                    Effect.logWarning(
                        `[AI SDK]${model ? ` [${model}]` : ""} ${warnings.map((w) => (typeof w === "object" ? JSON.stringify(w) : String(w))).join(", ")}`,
                    ),
                );
            };
        }),
        () =>
            Effect.sync(() => {
                globalThis.AI_SDK_LOG_WARNINGS = undefined;
            }),
    );

    return Logger.replaceScoped(Logger.defaultLogger, Effect.succeed(fileLogger));
}).pipe(Layer.unwrapScoped);

export const TestAppLogger = Logger.replace(
    Logger.defaultLogger,
    Logger.make(() => {}),
);
