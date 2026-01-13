import { jsonSchema, tool } from "ai";
import dedent from "dedent";
import { Effect, JSONSchema, Runtime, Schema } from "effect";
import { VFS } from "@/services/vfs";

export const makeVfsWriteFileTool = (runtime: Runtime.Runtime<VFS>) =>
    tool({
        description: dedent`
            Write content to a file (staged in VFS, not applied to disk until approved).
            Use this tool if you want to create a new file or fully overwrite an existing one.
            If you wish to edit an existing file, use the 'edit-file' tool instead.
        `,
        inputSchema: jsonSchema<{ filePath: string; content: string; overwrite?: boolean }>(
            JSONSchema.make(
                Schema.Struct({
                    filePath: Schema.String.annotations({ description: "The path to the file to write" }),
                    content: Schema.String.annotations({ description: "The content to write" }),
                    overwrite: Schema.optional(
                        Schema.Boolean.annotations({
                            description: "Whether to overwrite the file if it already exists. Use with caution!",
                        }),
                    ),
                }),
            ),
        ),
        execute: async ({ filePath, content, overwrite = false }) => {
            return Runtime.runPromise(runtime)(
                VFS.writeFile(filePath, content, overwrite).pipe(
                    Effect.map(() => `Successfully wrote to ${filePath}. Staged in VFS.`),
                    Effect.catchAll((error) => Effect.succeed(`Error writing to ${filePath}: ${error.message}`)),
                ),
            );
        },
    });

export const makeVfsEditFileTool = (runtime: Runtime.Runtime<VFS>) =>
    tool({
        description: "Edit a file by replacing text (staged in VFS).",
        inputSchema: jsonSchema<{ filePath: string; oldString: string; newString: string; replaceAll?: boolean }>(
            JSONSchema.make(
                Schema.Struct({
                    filePath: Schema.String.annotations({ description: "The path to the file to edit" }),
                    oldString: Schema.String.annotations({ description: "The text to replace" }),
                    newString: Schema.String.annotations({ description: "The text to replace it with" }),
                    replaceAll: Schema.optional(Schema.Boolean.annotations({ description: "Replace all occurrences" })),
                }),
            ),
        ),
        execute: async ({ filePath, oldString, newString, replaceAll }) => {
            return Runtime.runPromise(runtime)(
                VFS.editFile(filePath, oldString, newString, replaceAll ?? false).pipe(
                    Effect.map(() => `Successfully edited ${filePath}. Staged in VFS.`),
                    Effect.catchAll((error) => Effect.succeed(`Error editing ${filePath}: ${error.message}`)),
                ),
            );
        },
    });

export const makeVfsReadFileTool = (runtime: Runtime.Runtime<VFS>) =>
    tool({
        description: "Read a file (returns staged version if modified, otherwise disk version).",
        inputSchema: jsonSchema<{ filePath: string }>(
            JSONSchema.make(
                Schema.Struct({
                    filePath: Schema.String.annotations({ description: "The path to the file to read" }),
                }),
            ),
        ),
        execute: async ({ filePath }) => {
            return Runtime.runPromise(runtime)(
                VFS.readFile(filePath).pipe(
                    Effect.catchAll((error) => Effect.succeed(`Error reading ${filePath}: ${error.message}`)),
                ),
            );
        },
    });
