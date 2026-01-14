import { jsonSchema, tool } from "ai";
import dedent from "dedent";
import { Effect, JSONSchema, Schema } from "effect";
import { Web } from "@/services/web";

const webFetchSchema = Schema.Struct({
    url: Schema.String.annotations({
        description: "The URL to fetch content from",
    }),
    format: Schema.optionalWith(Schema.Literal("text", "markdown", "html"), { default: () => "markdown" }).annotations({
        description: "The format to return content in (text, markdown, or html). Defaults to markdown.",
    }),
    timeout: Schema.optional(Schema.Number).annotations({
        description: "Optional timeout in seconds (max 120)",
    }),
});

type WebFetchInput = Schema.Schema.Type<typeof webFetchSchema>;

export const webFetchTool = tool({
    description: dedent`
        Fetches content from a specified URL and converts it to the requested format.
        Use this tool when you need to retrieve and analyze web content.

        Note: Cannot fetch binary files (PDFs, images, archives). Large responses are truncated to ~100KB.
    `,
    inputSchema: jsonSchema<WebFetchInput>(JSONSchema.make(webFetchSchema)),
    execute: async ({ url, format, timeout }) => {
        const result = await Effect.runPromise(
            Effect.gen(function* () {
                const web = yield* Web;
                return yield* web.fetch(url, { format, timeout: timeout ? timeout * 1000 : undefined });
            }).pipe(
                Effect.catchAll((error) => Effect.succeed(`Error fetching content: ${error.message}`)),
                Effect.provide(Web.Default),
            ),
        );
        return result;
    },
});
