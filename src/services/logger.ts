import { FileSystem, Path, PlatformLogger } from "@effect/platform";
import { Duration, Effect, Layer, Logger, Runtime } from "effect";
import { DIR_NAME } from "@/domain/constants";
import { UserDirs } from "@/services/user-dirs";

export const AppLogger = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const logPath = yield* UserDirs.getPath("data", DIR_NAME.LOGS);
    const logFilePath = path.join(logPath, "debug.log");

    // Ensure directory exists
    yield* fs.makeDirectory(logPath, { recursive: true });

    const fileLogger = yield* Logger.logfmtLogger.pipe(
        PlatformLogger.toFile(logFilePath, { batchWindow: Duration.millis(100) }),
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
}).pipe(Effect.provide(UserDirs.Default), Layer.unwrapScoped);

export const TestAppLogger = Logger.replace(
    Logger.defaultLogger,
    Logger.make(() => {}),
);
