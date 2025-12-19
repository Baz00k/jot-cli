import { jsonSchema, tool } from "ai";
import { Effect, JSONSchema, Schema } from "effect";
import { ProjectFiles } from "@/services/project-files";

const searchFilesSchema = Schema.Struct({
    pattern: Schema.String.annotations({ description: "The regex pattern to search for in file contents" }),
    filePattern: Schema.optional(Schema.String).annotations({
        description: "Optional glob pattern to filter files (e.g., '*.ts', '*.md')",
    }),
    caseSensitive: Schema.optional(Schema.Boolean)
        .annotations({ description: "Whether the search should be case-sensitive" })
        .pipe(Schema.withConstructorDefault(() => false)),
    maxResults: Schema.optional(Schema.Number)
        .annotations({ description: "Maximum number of results to return" })
        .pipe(Schema.withConstructorDefault(() => 50)),
});

type SearchFilesInput = Schema.Schema.Type<typeof searchFilesSchema>;

export const searchFilesTool = tool({
    description: "Search for files by content using glob patterns.",
    inputSchema: jsonSchema<SearchFilesInput>(JSONSchema.make(searchFilesSchema)),
    execute: async ({ pattern, filePattern, caseSensitive = false, maxResults = 50 }) => {
        const execute = ProjectFiles.searchFiles(pattern, filePattern, caseSensitive, maxResults).pipe(
            Effect.map((results) => ({
                pattern,
                totalResults: results.length,
                results: results,
            })),
            Effect.provide(ProjectFiles.Default),
        );

        return await Effect.runPromise(execute);
    },
});
