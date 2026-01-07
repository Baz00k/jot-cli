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
});

type ListFilesInput = Schema.Schema.Type<typeof listFilesSchema>;

export const listFilesTool = tool({
    description: "List files in a directory to understand project structure.",
    inputSchema: jsonSchema<ListFilesInput>(JSONSchema.make(listFilesSchema)),
    execute: async ({ dirPath, recursive }) => {
        const execute = ProjectFiles.listFiles(dirPath, recursive).pipe(
            Effect.catchAll((error) => Effect.succeed(`Error listing files: ${error.message}`)),
            Effect.provide(ProjectFiles.Default),
        );

        return await Effect.runPromise(execute);
    },
});
