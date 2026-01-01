import { PromptReadError } from "@/domain/errors";
import { promptPaths } from "@/prompts";
import { FileSystem } from "@effect/platform";
import { BunFileSystem } from "@effect/platform-bun";
import { Effect, Layer } from "effect";

export type PromptType = keyof typeof promptPaths;

export interface WriterTaskInput {
    readonly goal: string;
    readonly context?: {
        readonly draft: string;
        readonly feedback: string;
        readonly sourceFiles?: string;
    };
}

export interface ReviewerTaskInput {
    readonly goal: string;
    readonly draft: string;
    readonly sourceFiles?: string;
}

export interface EditorTaskInput {
    readonly goal: string;
    readonly approvedContent: string;
}

export class Prompts extends Effect.Service<Prompts>()("services/prompts", {
    effect: Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;

        // Load raw prompt templates
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
            /**
             * Get raw prompt content by type
             */
            get: (promptType: PromptType) => loadRaw(promptType),

            /**
             * Get a function that renders writer task prompts.
             * Handles both initial drafting and revision scenarios.
             */
            getWriterTask: Effect.gen(function* () {
                const systemPrompt = yield* loadRaw("writer");

                return {
                    system: systemPrompt,
                    render: (input: WriterTaskInput): string => {
                        if (input.context) {
                            // Revision prompt - include current draft and feedback
                            const parts = [`Task: ${input.goal}`, "", "## Current Draft", input.context.draft];

                            if (input.context.sourceFiles) {
                                parts.push("", "## Source Files (from initial exploration)", input.context.sourceFiles);
                            }

                            parts.push(
                                "",
                                "## Critique to Address",
                                input.context.feedback,
                                "",
                                "## Instructions",
                                "Revise the draft IN-PLACE to address each critique point.",
                                "Output the complete revised draft.",
                            );

                            return parts.join("\n");
                        }

                        // Initial draft prompt
                        return [
                            `Task: ${input.goal}`,
                            "",
                            "Please draft the initial content based on the project context.",
                            "Use tools to explore the project structure and gather relevant information first.",
                        ].join("\n");
                    },
                };
            }),

            /**
             * Get a function that renders reviewer task prompts.
             */
            getReviewerTask: Effect.gen(function* () {
                const systemPrompt = yield* loadRaw("reviewer");

                return {
                    system: systemPrompt,
                    render: (input: ReviewerTaskInput): string => {
                        const parts = ["## Original Goal", input.goal, "", "## Draft to Review", input.draft];

                        if (input.sourceFiles) {
                            parts.push("", "## Source Files (from initial exploration)", input.sourceFiles);
                        }

                        parts.push("", "Evaluate this draft against the original goal.");

                        return parts.join("\n");
                    },
                };
            }),

            /**
             * Get a function that renders editor task prompts.
             */
            getEditorTask: Effect.gen(function* () {
                const systemPrompt = yield* loadRaw("editor");

                return {
                    system: systemPrompt,
                    render: (input: EditorTaskInput): string => {
                        return [
                            "## Original Goal",
                            input.goal,
                            "",
                            "## Approved Content",
                            input.approvedContent,
                            "",
                            "Please apply the approved content to the project files using the available tools.",
                            "You may need to create new files or edit existing ones.",
                            "You HAVE TO save the changes, if none of the files seem fitting, just save it in the CWD with a descriptive name.",
                            "When you have finished, provide a brief summary of the changes.",
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
    getEditorTask: Effect.succeed({
        render: (_: EditorTaskInput) => "prompt",
        system: "system",
    }),
    getReviewerTask: Effect.succeed({
        render: (_: ReviewerTaskInput) => "prompt",
        system: "system",
    }),
});

export const TestPromptsLayer = Layer.succeed(Prompts, TestPrompts);
