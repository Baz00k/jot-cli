import { jsonSchema, tool } from "ai";
import dedent from "dedent";
import { Chunk, Effect, JSONSchema, Option, Runtime, Schema } from "effect";
import type { DiffHunk, FilePatch } from "@/domain/vfs";
import { VFS } from "@/services/vfs";

const formatPatch = (patch: FilePatch): string => {
    return Chunk.head(patch.hunks).pipe(
        Option.map((h: DiffHunk) => h.content),
        Option.getOrElse(() => ""),
    );
};

export const makeReadAllDiffsTool = (runtime: Runtime.Runtime<VFS>) =>
    tool({
        description: "Get unified diffs of all staged file changes.",
        inputSchema: jsonSchema({ type: "object", properties: {} }),
        execute: async () => {
            return Runtime.runPromise(runtime)(
                VFS.getDiffs().pipe(
                    Effect.map((patches) => {
                        if (Chunk.isEmpty(patches)) {
                            return "No staged changes found.";
                        }
                        return Chunk.toArray(patches)
                            .map((p) => `=== ${p.path} ===\n${formatPatch(p)}`)
                            .join("\n\n");
                    }),
                ),
            );
        },
    });

export const makeReadFileDiffTool = (runtime: Runtime.Runtime<VFS>) =>
    tool({
        description: "Get the diff for a specific file.",
        inputSchema: jsonSchema<{ filePath: string }>(
            JSONSchema.make(
                Schema.Struct({
                    filePath: Schema.String.annotations({ description: "The path to the file" }),
                }),
            ),
        ),
        execute: async ({ filePath }) => {
            return Runtime.runPromise(runtime)(
                VFS.getFileDiff(filePath).pipe(
                    Effect.map(formatPatch),
                    Effect.catchAll((error) => Effect.succeed(`Error getting file diff: ${error}`)),
                ),
            );
        },
    });

export const makeAddReviewCommentTool = (runtime: Runtime.Runtime<VFS>) =>
    tool({
        description: dedent`
            Add a comment to a file or specific line in a diff.
            IMPORTANT: Use this for ALL feedback passed to the writer.
            The writer will ONLY see comments added via this tool.
        `,
        inputSchema: jsonSchema<{ filePath: string; line?: number; comment: string }>(
            JSONSchema.make(
                Schema.Struct({
                    filePath: Schema.String.annotations({ description: "The path to the file" }),
                    line: Schema.optional(Schema.Number.annotations({ description: "The line number (optional)" })),
                    comment: Schema.String.annotations({ description: "The comment content" }),
                }),
            ),
        ),
        execute: async ({ filePath, line, comment }) => {
            return Runtime.runPromise(runtime)(
                VFS.addComment(filePath, line ?? null, comment).pipe(
                    Effect.map(() => `Comment added to ${filePath}${line ? `:${line}` : ""}`),
                ),
            );
        },
    });

export const makeApproveChangesTool = (runtime: Runtime.Runtime<VFS>) =>
    tool({
        description: dedent`
            Approve all staged changes.
            Call this tool EXACTLY ONCE as your final action when the diff looks correct.
        `,
        inputSchema: jsonSchema<{ summary?: string }>(
            JSONSchema.make(
                Schema.Struct({
                    summary: Schema.optional(
                        Schema.String.annotations({ description: "Optional summary of approval" }),
                    ),
                }),
            ),
        ),
        execute: async ({ summary }) => {
            return Runtime.runPromise(runtime)(
                VFS.approve(summary).pipe(
                    Effect.map(() => `Changes approved.${summary ? ` Summary: ${summary}` : ""}`),
                ),
            );
        },
    });

export const makeRejectChangesTool = (runtime: Runtime.Runtime<VFS>) =>
    tool({
        description: "Reject staged changes. You must provide a critique to explain the rejection reason.",
        inputSchema: jsonSchema<{ critique: string }>(
            JSONSchema.make(
                Schema.Struct({
                    critique: Schema.String.annotations({ description: "The critique/reason for rejection" }),
                }),
            ),
        ),
        execute: async ({ critique }) => {
            return Runtime.runPromise(runtime)(
                VFS.reject(critique).pipe(Effect.map(() => `Changes rejected. Critique: ${critique}`)),
            );
        },
    });
