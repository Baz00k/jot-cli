import { jsonSchema, tool } from "ai";
import { Effect, JSONSchema, Schema } from "effect";
import { ProjectFiles } from "@/services/project-files";

const writeFileSchema = Schema.Struct({
    filePath: Schema.String.annotations({
        description: "The relative path to the file to write",
    }),
    content: Schema.String.annotations({
        description: "The full content to write to the file",
    }),
    overwrite: Schema.optional(
        Schema.Boolean.annotations({
            description: "Whether to overwrite the file if it already exists",
        }),
    ),
});

type WriteFileInput = Schema.Schema.Type<typeof writeFileSchema>;

export const writeFileTool = tool({
    description: "Write or overwrite content to a file. USE WITH CAUTION.",
    inputSchema: jsonSchema<WriteFileInput>(JSONSchema.make(writeFileSchema)),
    execute: async ({ filePath, content, overwrite = false }) => {
        const execute = ProjectFiles.writeFile(filePath, content, overwrite).pipe(Effect.provide(ProjectFiles.Default));

        return await Effect.runPromise(execute);
    },
});
