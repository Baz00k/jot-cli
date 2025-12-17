import { jsonSchema, tool } from "ai";
import { Effect, JSONSchema, Schema } from "effect";
import { ProjectFiles } from "@/services/project-files";

const readFileSchema = Schema.Struct({
    filePath: Schema.String.annotations({
        description: "The relative path to the file to read",
    }),
});

type ReadFileInput = Schema.Schema.Type<typeof readFileSchema>;

export const readFileTool = tool({
    description: "Read the text content of a file. For large files, returns an excerpt with beginning and end.",
    inputSchema: jsonSchema<ReadFileInput>(JSONSchema.make(readFileSchema)),
    execute: async ({ filePath }) => {
        const execute = ProjectFiles.readFile(filePath).pipe(Effect.provide(ProjectFiles.Default));

        return await Effect.runPromise(execute);
    },
});
