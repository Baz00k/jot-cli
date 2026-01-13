// Heavily inspired by https://github.com/sst/opencode/blob/dev/packages/opencode/src/tool/edit.ts

import { jsonSchema, tool } from "ai";
import { Effect, JSONSchema, Schema, Stream } from "effect";
import { ProjectFiles } from "@/services/project-files";
import {
    BlockAnchorReplacer,
    ContextAwareReplacer,
    EscapeNormalizedReplacer,
    IndentationFlexibleReplacer,
    LineTrimmedReplacer,
    MultiOccurrenceReplacer,
    SimpleReplacer,
    TrimmedBoundaryReplacer,
    WhitespaceNormalizedReplacer,
} from "@/text/replacers";

export function replace(
    content: string,
    oldString: string,
    newString: string,
    replaceAll = false,
): Effect.Effect<string, Error> {
    return Effect.gen(function* () {
        if (oldString === newString) {
            return yield* Effect.fail(new Error("oldString and newString must be different"));
        }

        let notFound = true;

        const replacers = [
            SimpleReplacer,
            LineTrimmedReplacer,
            BlockAnchorReplacer,
            WhitespaceNormalizedReplacer,
            IndentationFlexibleReplacer,
            EscapeNormalizedReplacer,
            TrimmedBoundaryReplacer,
            ContextAwareReplacer,
            MultiOccurrenceReplacer,
        ];

        for (const replacer of replacers) {
            const stream = replacer(content, oldString);
            const candidates = yield* Stream.runCollect(stream);

            for (const search of candidates) {
                const index = content.indexOf(search);
                if (index === -1) continue;
                notFound = false;
                if (replaceAll) {
                    return content.replaceAll(search, newString);
                }
                const lastIndex = content.lastIndexOf(search);
                if (index !== lastIndex) continue;
                return content.substring(0, index) + newString + content.substring(index + search.length);
            }
        }

        if (notFound) {
            return yield* Effect.fail(new Error("oldString not found in content"));
        }

        return yield* Effect.fail(
            new Error(
                "Found multiple matches for oldString. Provide more surrounding lines in oldString to identify the correct match.",
            ),
        );
    });
}

const editFileSchema = Schema.Struct({
    filePath: Schema.String.annotations({
        description: "The relative path to the file to modify",
    }),
    oldString: Schema.String.annotations({
        description: "The text to replace",
    }),
    newString: Schema.String.annotations({
        description: "The text to replace it with (must be different from oldString)",
    }),
    replaceAll: Schema.optional(
        Schema.Boolean.annotations({
            description: "Replace all occurrences of oldString (default false)",
        }),
    ),
});

type EditFileInput = Schema.Schema.Type<typeof editFileSchema>;

export const editFileTool = tool({
    description:
        "Performs exact string replacements in files. You must use read tool before editing to get the file content.",
    inputSchema: jsonSchema<EditFileInput>(JSONSchema.make(editFileSchema)),
    execute: async ({ filePath, oldString, newString, replaceAll = false }) => {
        const program = Effect.gen(function* () {
            const projectFiles = yield* ProjectFiles;
            const content = yield* projectFiles.readFile(filePath, { disableExcerpts: true });

            const newContent = yield* replace(content, oldString, newString, replaceAll);

            yield* projectFiles.writeFile(filePath, newContent, true);

            return `Successfully edited ${filePath}`;
        }).pipe(
            Effect.catchAll((error) => Effect.succeed(`Error editing file: ${error.message}`)),
            Effect.provide(ProjectFiles.Default),
        );

        return await Effect.runPromise(program);
    },
});
