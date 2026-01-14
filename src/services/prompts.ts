import { FileSystem } from "@effect/platform";
import { BunFileSystem } from "@effect/platform-bun";
import { Chunk, Effect, Layer, Option } from "effect";
import { PromptReadError } from "@/domain/errors";
import type { FilePatch, ReviewComment } from "@/domain/vfs";
import { promptPaths } from "@/prompts";

export type PromptType = keyof typeof promptPaths;

export interface FileContext {
    readonly path: string;
    readonly summary?: string;
}

export interface WriterContext {
    readonly filesRead: ReadonlyArray<FileContext>;
    readonly filesModified: ReadonlyArray<string>;
}

export interface WriterTaskInput {
    readonly goal: string;
    readonly latestComments: Chunk.Chunk<ReviewComment>;
    readonly latestFeedback: Option.Option<string>;
    readonly previousContext: Option.Option<WriterContext>;
}

export interface ReviewerTaskInput {
    readonly goal: string;
    readonly diffs: Chunk.Chunk<FilePatch>;
}

export class Prompts extends Effect.Service<Prompts>()("services/prompts", {
    effect: Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;

        const loadRaw = (promptType: PromptType) =>
            Effect.gen(function* () {
                const promptPath = promptPaths[promptType];
                return yield* fs.readFileString(promptPath);
            }).pipe(
                Effect.catchAllCause((cause) =>
                    Effect.fail(
                        new PromptReadError({
                            cause,
                            message: `Failed to read ${promptType} prompt`,
                        }),
                    ),
                ),
            );

        return {
            get: (promptType: PromptType) => loadRaw(promptType),

            getWriterTask: Effect.gen(function* () {
                const systemPrompt = yield* loadRaw("writer");

                return {
                    system: systemPrompt,
                    render: (input: WriterTaskInput): string => {
                        const parts = [
                            "# Task",
                            "",
                            input.goal,
                            "",
                            "## Environment details",
                            `Current Date: ${new Date().toDateString()}`,
                            `Current Time: ${new Date().toLocaleTimeString()}`,
                            `Current Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
                        ];

                        const previousContext = input.previousContext;
                        if (Option.isSome(previousContext)) {
                            const ctx = previousContext.value;
                            parts.push("", "## Context from Previous Iterations");

                            if (ctx.filesRead.length > 0) {
                                parts.push("### Files Already Read");
                                parts.push(
                                    ctx.filesRead
                                        .map((f) => (f.summary ? `- ${f.path}: ${f.summary}` : `- ${f.path}`))
                                        .join("\n"),
                                );
                            }

                            if (ctx.filesModified.length > 0) {
                                parts.push("### Files You Modified (still staged)");
                                parts.push(ctx.filesModified.map((f) => `- ${f}`).join("\n"));
                            }

                            parts.push("", "Use this context to avoid re-reading files unnecessarily.");
                        }

                        const latestComments = input.latestComments;
                        if (Chunk.isNonEmpty(latestComments)) {
                            parts.push(
                                "",
                                "## Reviewer Feedback to Address",
                                Chunk.toArray(latestComments)
                                    .map(
                                        (c) =>
                                            `- ${c.path}${Option.isSome(c.line) ? `:${c.line.value}` : ""}: ${c.content}`,
                                    )
                                    .join("\n"),
                            );
                        }

                        const latestFeedback = input.latestFeedback;
                        if (Option.isSome(latestFeedback)) {
                            parts.push("", "## User Feedback", latestFeedback.value);
                        }

                        parts.push(
                            "",
                            "Use tools to explore the project, then use write_file/edit_file to make changes.",
                            "Changes are staged and will be reviewed before applying.",
                        );

                        return parts.join("\n");
                    },
                };
            }),

            getReviewerTask: Effect.gen(function* () {
                const systemPrompt = yield* loadRaw("reviewer");

                return {
                    system: systemPrompt,
                    render: (input: ReviewerTaskInput): string => {
                        const formatPatch = (patch: FilePatch): string => {
                            return Chunk.head(patch.hunks).pipe(
                                Option.map((h) => h.content),
                                Option.getOrElse(() => ""),
                            );
                        };

                        return [
                            "# Task",
                            "",
                            "You are a strict academic reviewer.",
                            "Your task is to review the changes to files and provide feedback.",
                            "Use tools to provide specific feedback to exact lines of text",
                            "or provide general feedback to the entire set of changes.",
                            "You can approve or reject the work and ask for additional changes.",
                            "As a last action, you must ALWAYS call either approve_changes or reject_changes.",
                            "",
                            "## Original Goal",
                            "",
                            input.goal,
                            "",
                            "## Staged Changes (Diffs)",
                            Chunk.toArray(input.diffs)
                                .map((p) => `### ${p.path}\n\`\`\`diff\n${formatPatch(p)}\n\`\`\``)
                                .join("\n\n"),
                            "",
                            "## Environment details",
                            `Current Date: ${new Date().toDateString()}`,
                            `Current Time: ${new Date().toLocaleTimeString()}`,
                            `Current Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
                        ].join("\n");
                    },
                };
            }),
        };
    }),
    dependencies: [BunFileSystem.layer],
    accessors: true,
}) {}

export const TestPrompts = new Prompts({
    get: () => Effect.succeed("prompt"),
    getWriterTask: Effect.succeed({
        render: (_: WriterTaskInput) => "prompt",
        system: "system",
    }),
    getReviewerTask: Effect.succeed({
        render: (_: ReviewerTaskInput) => "prompt",
        system: "system",
    }),
});

export const TestPromptsLayer = Layer.succeed(Prompts, TestPrompts);
