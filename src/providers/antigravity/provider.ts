import type { LanguageModelV3 } from "@ai-sdk/provider";
import { Effect, Runtime } from "effect";
import type { Config } from "@/services/config";
import { getValidToken } from "./auth";
import { generateRequest, streamRequest } from "./client";
import { AntigravityError } from "./errors";

export const createAntigravity =
    (config: Config, runtime: Runtime.Runtime<never>) =>
    (modelId: string, _settings?: unknown): LanguageModelV3 => {
        return {
            specificationVersion: "v3",
            provider: "google-antigravity",
            modelId,
            supportedUrls: Promise.resolve({}),

            async doGenerate(options) {
                return Runtime.runPromise(runtime)(
                    Effect.gen(function* () {
                        const token = yield* getValidToken(config);
                        const userConfig = yield* config.get;
                        const projectId = userConfig.googleAntigravity?.projectId;

                        if (!projectId) {
                            return yield* new AntigravityError({
                                message: "Project ID not found. Run 'jot auth' again.",
                            });
                        }

                        return yield* generateRequest(modelId, token, projectId, options);
                    }),
                );
            },

            async doStream(options) {
                return Runtime.runPromise(runtime)(
                    Effect.gen(function* () {
                        const token = yield* getValidToken(config);
                        const userConfig = yield* config.get;
                        const projectId = userConfig.googleAntigravity?.projectId;

                        if (!projectId) {
                            return yield* new AntigravityError({
                                message: "Project ID not found. Run 'jot auth' again.",
                            });
                        }

                        return yield* streamRequest(modelId, token, projectId, options);
                    }),
                );
            },
        };
    };
