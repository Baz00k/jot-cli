import { jsonSchema, tool } from "ai";
import { Effect, JSONSchema, Schema } from "effect";
import { ProjectFiles } from "@/services/project-files";

const readFileSchema = Schema.Struct({
    filePath: Schema.String.annotations({
        description: "The relative path to the file to read",
    }),
    lineRange: Schema.optional(
        Schema.Struct({
            startLine: Schema.Number.annotations({
                description: "The start line to read from",
            }),
            endLine: Schema.Number.annotations({
                description: "The end line to read to",
            }),
        }),
    ),
});

type ReadFileInput = Schema.Schema.Type<typeof readFileSchema>;

export const readFileTool = tool({
    description: "Read the text content of a file. For large files, returns an excerpt with beginning and end.",
    inputSchema: jsonSchema<ReadFileInput>(JSONSchema.make(readFileSchema)),
    execute: async ({ filePath, lineRange }) => {
        const execute = ProjectFiles.readFile(filePath, {
            lineRange,
        }).pipe(Effect.provide(ProjectFiles.Default));

        return await Effect.runPromise(execute);
    },
});
