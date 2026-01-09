import { intro, log, outro, spinner } from "@clack/prompts";
import { Command } from "@effect/cli";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Console, Effect } from "effect";
import { getValidToken } from "@/providers/antigravity/auth";
import { ANTIGRAVITY_DEFAULT_ENDPOINT, ANTIGRAVITY_HEADERS } from "@/providers/antigravity/constants";
import { FetchAvailableModelsResponseSchema } from "@/providers/antigravity/schemas";
import { Config } from "@/services/config";

export const quotaCommand = Command.make("quota", {}, () =>
    Effect.gen(function* () {
        intro("📊 Jot CLI - Antigravity Quota Check");

        const s = spinner();
        s.start("Checking authentication...");

        const token = yield* getValidToken;
        const config = yield* Config.get;
        const projectId = config.googleAntigravity?.projectId;

        if (!projectId) {
            s.stop("Configuration error");
            log.error("Project ID not found. Please run 'jot auth' to authenticate.");
            return;
        }

        s.message(`Fetching quota for project: ${projectId}...`);

        const client = yield* HttpClient.HttpClient;

        const response = yield* HttpClientRequest.post(
            `${ANTIGRAVITY_DEFAULT_ENDPOINT}/v1internal:fetchAvailableModels`,
        ).pipe(
            HttpClientRequest.setHeader("Authorization", `Bearer ${token}`),
            HttpClientRequest.setHeaders(ANTIGRAVITY_HEADERS),
            HttpClientRequest.bodyJson({ project: projectId }),
            Effect.flatMap(client.execute),
            Effect.flatMap(HttpClientResponse.schemaBodyJson(FetchAvailableModelsResponseSchema)),
            Effect.mapError((e) => new Error(`Quota check failed: ${String(e)}`)),
        );

        s.stop("Quota information retrieved");

        const models = Object.entries(response.models)
            .map(([id, data]) => ({
                id,
                name: data.displayName || id,
                remaining: data.quotaInfo?.remainingFraction,
                resetTime: data.quotaInfo?.resetTime,
                recommended: data.recommended,
            }))
            .filter((m) => m.remaining !== undefined)
            .sort((a, b) => {
                // Sort by recommended first, then by name
                if (a.recommended && !b.recommended) return -1;
                if (!a.recommended && b.recommended) return 1;
                return a.name.localeCompare(b.name);
            });

        if (models.length === 0) {
            log.warn("No quota information available for any models.");
        } else {
            outro(`Quota Status for ${projectId}:`);

            const tableData = models.map((model) => {
                const percent = Math.round((model.remaining || 0) * 100);
                const percentString = percent.toString().padStart(3, "0");
                const status = `${percentString}% remaining`;

                let reset = "-";
                if (model.resetTime) {
                    const date = new Date(model.resetTime);
                    const now = new Date();
                    const diffMs = date.getTime() - now.getTime();

                    if (diffMs > 0) {
                        const minutes = Math.ceil(diffMs / 60000);
                        if (minutes < 60) {
                            reset = `in ${minutes}m`;
                        } else {
                            const hours = Math.floor(minutes / 60);
                            const mins = minutes % 60;
                            reset = `in ${hours}h ${mins}m`;
                        }
                    } else {
                        reset = "Ready";
                    }
                }

                return {
                    "Model ID": model.id,
                    "Model Name": model.name,
                    Status: status,
                    "Reset Time": reset,
                };
            });

            yield* Console.table(tableData);
        }
    }),
).pipe(Command.withDescription("Check Antigravity API quota status"));
