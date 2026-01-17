import { jsonSchema, tool } from "ai";
import dedent from "dedent";
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
            description: "Whether to overwrite the file if it already exists. Use with caution!",
        }),
    ),
});

type WriteFileInput = Schema.Schema.Type<typeof writeFileSchema>;

export const writeFileTool = tool({
    description: dedent`
        Write content to a file.
        Use this tool if you want to create a new file or fully overwrite an existing one.
        If you wish to edit an existing file, use the 'edit-file' tool instead.
    `,
    inputSchema: jsonSchema<WriteFileInput>(JSONSchema.make(writeFileSchema)),
    execute: async ({ filePath, content, overwrite = false }) => {
        const execute = ProjectFiles.writeFile(filePath, content, overwrite).pipe(
            Effect.catchAll((error) => Effect.succeed(`Error writing file: ${error.message}`)),
            Effect.provide(ProjectFiles.Default),
        );

        return await Effect.runPromise(execute);
    },
});
