import { Web } from "@/services/web";
import { jsonSchema, tool } from "ai";
import dedent from "dedent";
import { Effect, JSONSchema, Match, Schema } from "effect";

const webSearchSchema = Schema.Struct({
    query: Schema.String.annotations({
        description: "Websearch query",
    }),
    numResults: Schema.optional(Schema.Number).annotations({
        description: "Number of search results to return (default: 8)",
    }),
    livecrawl: Schema.optionalWith(Schema.Literal("fallback", "preferred"), { default: () => "fallback" }).annotations({
        description:
            "Live crawl mode - 'fallback': use live crawling as backup if cached content unavailable, 'preferred': prioritize live crawling",
    }),
    type: Schema.optionalWith(Schema.Literal("auto", "fast", "deep"), { default: () => "auto" }).annotations({
        description:
            "Search type - 'auto': balanced search (default), 'fast': quick results, 'deep': comprehensive search",
    }),
    contextMaxCharacters: Schema.optional(Schema.Number).annotations({
        description: "Maximum characters for context string optimized for LLMs (default: 10000)",
    }),
});

type WebSearchInput = Schema.Schema.Type<typeof webSearchSchema>;

export const webSearchTool = tool({
    description: dedent`
        Search the web using AI - performs real-time web searches and can scrape content from specific URLs.
        Provides up-to-date information for current events and recent data.
        Use this tool to research information and find sources.
        `,
    inputSchema: jsonSchema<WebSearchInput>(JSONSchema.make(webSearchSchema)),
    execute: async ({ query, numResults, livecrawl, type, contextMaxCharacters }) => {
        const result = await Effect.runPromise(
            Effect.gen(function* () {
                const web = yield* Web;
                return yield* web.search(query, { numResults, livecrawl, type, contextMaxCharacters });
            }).pipe(
                Effect.catchAll((error) => {
                    const message = Match.value(error).pipe(
                        Match.tags({
                            WebSearchError: (e) => e.message,
                            HttpBodyError: () => "Failed to create request body",
                        }),
                        Match.orElse(() => "Unknown error occurred")
                    );
                    return Effect.succeed(`Error searching web: ${message}`);
                }),
                Effect.provide(Web.Default),
            ),
        );
        return result;
    },
});
