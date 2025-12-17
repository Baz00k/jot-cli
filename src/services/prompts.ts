import { FileSystem } from "@effect/platform";
import { BunFileSystem } from "@effect/platform-bun";
import { Effect } from "effect";
import { PromptReadError } from "@/domain/errors";
import { promptPaths } from "@/prompts";

export type PromptType = keyof typeof promptPaths;

export interface WriterTaskInput {
    readonly goal: string;
    readonly context?: {
        readonly draft: string;
        readonly feedback: string;
    };
}

export interface ReviewerTaskInput {
    readonly goal: string;
    readonly draft: string;
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
                            return [
                                `Task: ${input.goal}`,
                                "",
                                "## Current Draft",
                                input.context.draft,
                                "",
                                "## Critique to Address",
                                input.context.feedback,
                                "",
                                "Please revise the draft to address the critique above. Provide the complete revised content.",
                            ].join("\n");
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
                        return [
                            "## Original Goal",
                            input.goal,
                            "",
                            "## Draft to Review",
                            input.draft,
                            "",
                            "Evaluate this draft against the original goal.",
                        ].join("\n");
                    },
                };
            }),
        };
    }),
    dependencies: [BunFileSystem.layer],
    accessors: true,
}) {}
