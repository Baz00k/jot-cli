import type { LanguageModelV3 } from "@ai-sdk/provider";
import { BunContext } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { Config } from "@/services/config";
import { AppLogger } from "@/services/logger";
import { getValidToken } from "./auth";
import { generateRequest, streamRequest } from "./client";
import { AntigravityError } from "./errors";

const AntigravityRuntime = Layer.mergeAll(Config.Default, AppLogger).pipe(Layer.provideMerge(BunContext.layer));

export const createAntigravity =
    () =>
    (modelId: string, _settings?: unknown): LanguageModelV3 => {
        return {
            specificationVersion: "v3",
            provider: "google-antigravity",
            modelId,
            supportedUrls: Promise.resolve({}),

            async doGenerate(options) {
                return Effect.runPromise(
                    Effect.gen(function* () {
                        const token = yield* getValidToken;
                        const config = yield* Config.get;
                        const projectId = config.googleAntigravity?.projectId;

                        if (!projectId) {
                            return yield* new AntigravityError({
                                message: "Project ID not found. Run 'jot auth' again.",
                            });
                        }

                        return yield* generateRequest(modelId, token, projectId, options);
                    }).pipe(Effect.provide(AntigravityRuntime)),
                );
            },

            async doStream(options) {
                return Effect.runPromise(
                    Effect.gen(function* () {
                        const token = yield* getValidToken;
                        const config = yield* Config.get;
                        const projectId = config.googleAntigravity?.projectId;

                        if (!projectId) {
                            return yield* new AntigravityError({
                                message: "Project ID not found. Run 'jot auth' again.",
                            });
                        }

                        return yield* streamRequest(modelId, token, projectId, options);
                    }).pipe(Effect.provide(AntigravityRuntime)),
                );
            },
        };
    };
