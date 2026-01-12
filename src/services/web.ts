import { FetchHttpClient, HttpBody, HttpClient } from "@effect/platform";
import { Effect, Match } from "effect";
import { WebFetchError, WebSearchError } from "@/domain/errors";
import { convertHTMLToMarkdown } from "@/text/converters/html-markdown-converter";
import { extractTextFromHTML } from "@/text/converters/html-text-extractor";

const API_CONFIG = {
    ENDPOINT: "https://mcp.exa.ai/mcp",
    DEFAULT_NUM_RESULTS: 8,
    DEFAULT_TYPE: "auto",
    DEFAULT_LIVECRAWL: "fallback",
    DEFAULT_CONTEXT_MAX_CHARACTERS: 10000,
    TIMEOUT: 25000,
} as const;

export class Web extends Effect.Service<Web>()("services/web", {
    effect: Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;

        const search = (
            query: string,
            options?: {
                numResults?: number;
                type?: "auto" | "fast" | "deep";
                livecrawl?: "fallback" | "preferred";
                contextMaxCharacters?: number;
            },
        ) =>
            Effect.gen(function* () {
                if (query.trim().length === 0) {
                    return yield* new WebSearchError({ message: "Query cannot be empty" });
                }

                const body = yield* HttpBody.json({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "tools/call",
                    params: {
                        name: "web_search_exa",
                        arguments: {
                            query,
                            type: options?.type ?? API_CONFIG.DEFAULT_TYPE,
                            numResults: options?.numResults ?? API_CONFIG.DEFAULT_NUM_RESULTS,
                            livecrawl: options?.livecrawl ?? API_CONFIG.DEFAULT_LIVECRAWL,
                            contextMaxCharacters:
                                options?.contextMaxCharacters ?? API_CONFIG.DEFAULT_CONTEXT_MAX_CHARACTERS,
                        },
                    },
                });

                const response = yield* client
                    .post(API_CONFIG.ENDPOINT, {
                        body,
                        headers: {
                            "Content-Type": "application/json",
                            Accept: "application/json, text/event-stream",
                        },
                    })
                    .pipe(
                        Effect.timeout(API_CONFIG.TIMEOUT),
                        Effect.mapError(
                            (error) => new WebSearchError({ message: `Search request failed: ${error}`, cause: error }),
                        ),
                    );

                const responseText = yield* response.text.pipe(
                    Effect.mapError(
                        (error) => new WebSearchError({ message: `Failed to read response: ${error}`, cause: error }),
                    ),
                );

                const lines = responseText.split("\n");

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        return yield* Effect.try({
                            try: () => {
                                const data = JSON.parse(line.substring(6));
                                if (data && typeof data === "object" && "result" in data) {
                                    const resultData = data as { result: { content?: Array<{ text: string }> } };
                                    return resultData.result.content?.[0]?.text ?? "No search results found";
                                }
                                throw new Error("Invalid response format");
                            },
                            catch: (error) =>
                                new WebSearchError({
                                    message: `Failed to parse search response: ${error}`,
                                    cause: error,
                                }),
                        });
                    }
                }

                return yield* new WebSearchError({ message: "No search results found" });
            });

        const fetch = (
            url: string,
            options?: {
                format?: "text" | "markdown" | "html";
                timeout?: number;
            },
        ) =>
            Effect.gen(function* () {
                if (url.trim().length === 0) {
                    return yield* new WebFetchError({ message: "URL cannot be empty" });
                }

                const format = options?.format ?? "markdown";
                const timeout = options?.timeout ?? 30000;

                const acceptHeader = Match.value(format).pipe(
                    Match.when("markdown", () => "text/markdown;q=1, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1"),
                    Match.when("text", () => "text/plain;q=1, text/html;q=0.9, application/xhtml+xml;q=0.8, */*;q=0.1"),
                    Match.orElse(() => "text/html;q=1, application/xhtml+xml;q=0.9, text/plain;q=0.8, */*;q=0.1"),
                );

                const response = yield* client
                    .get(url, {
                        headers: {
                            "User-Agent":
                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
                            Accept: acceptHeader,
                        },
                    })
                    .pipe(
                        Effect.timeout(timeout),
                        Effect.mapError(
                            (error) => new WebFetchError({ message: `Failed to fetch URL: ${error}`, cause: error }),
                        ),
                    );

                const contentLength = response.headers?.["content-length"];
                if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
                    return yield* new WebFetchError({ message: "Response too large (>5MB)" });
                }

                const responseText = yield* response.text.pipe(
                    Effect.mapError(
                        (error) => new WebFetchError({ message: `Failed to read response: ${error}`, cause: error }),
                    ),
                );

                if (format === "html") {
                    return responseText;
                } else if (format === "text") {
                    return yield* extractTextFromHTML(responseText).pipe(Effect.tapError(Effect.logWarning));
                } else {
                    return yield* convertHTMLToMarkdown(responseText).pipe(Effect.tapError(Effect.logWarning));
                }
            });

        return { search, fetch };
    }),
    dependencies: [FetchHttpClient.layer],
}) {}
