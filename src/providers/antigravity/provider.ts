import type { LanguageModelV3 } from "@ai-sdk/provider";
import { Effect } from "effect";
import type { Config } from "@/services/config";
import { getValidToken } from "./auth";
import { generateRequest, streamRequest } from "./client";

export const createAntigravity =
    (config: Config) =>
    (modelId: string, _settings?: unknown): LanguageModelV3 => {
        return {
            specificationVersion: "v3",
            provider: "google-antigravity",
            modelId,
            supportedUrls: Promise.resolve({}),

            async doGenerate(options) {
                return Effect.runPromise(
                    Effect.gen(function* () {
                        const token = yield* getValidToken(config);
                        return yield* generateRequest(modelId, token, options);
                    }),
                );
            },

            async doStream(options) {
                return Effect.runPromise(
                    Effect.gen(function* () {
                        const token = yield* getValidToken(config);
                        return yield* streamRequest(modelId, token, options);
                    }),
                );
            },
        };
    };
