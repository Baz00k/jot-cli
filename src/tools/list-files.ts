import { jsonSchema, tool } from "ai";
import { Effect, JSONSchema, Schema } from "effect";
import { ProjectFiles } from "@/services/project-files";

const listFilesSchema = Schema.Struct({
    dirPath: Schema.optional(
        Schema.String.annotations({
            description: 'The directory path to list (relative to cwd). Defaults to "."',
        }),
    ),
    recursive: Schema.optional(
        Schema.Boolean.annotations({
            description: "Whether to list files recursively. Defaults to false.",
        }),
    ),
    maxResults: Schema.Number.annotations({
        description: "Maximum number of results to return. Defaults to 25.",
    }).pipe(
        Schema.propertySignature,
        Schema.withConstructorDefault(() => 25),
    ),
});

type ListFilesInput = Schema.Schema.Type<typeof listFilesSchema>;

export const listFilesTool = tool({
    description: "List files in a directory to understand project structure.",
    inputSchema: jsonSchema<ListFilesInput>(JSONSchema.make(listFilesSchema)),
    execute: async ({ dirPath, recursive, maxResults }) => {
        const execute = ProjectFiles.listFiles(dirPath, recursive, maxResults).pipe(
            Effect.catchAll((error) => Effect.succeed(`Error listing files: ${error.message}`)),
            Effect.provide(ProjectFiles.Default),
        );

        return await Effect.runPromise(execute);
    },
});
