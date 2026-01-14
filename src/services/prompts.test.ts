import { describe, expect, test } from "bun:test";
import { Chunk, Effect, Option } from "effect";
import { DiffHunk, FilePatch, ReviewComment } from "@/domain/vfs";
import { Prompts } from "@/services/prompts";

describe("Prompts Service", () => {
    test("reads writer prompt successfully", async () => {
        const program = Effect.gen(function* () {
            const writerPrompt = yield* Prompts.get("writer");

            expect(writerPrompt).toBeDefined();
            expect(writerPrompt.length).toBeGreaterThan(0);
            expect(writerPrompt).toContain("write");
        }).pipe(Effect.provide(Prompts.Default));

        await Effect.runPromise(program);
    });

    test("reads reviewer prompt successfully", async () => {
        const program = Effect.gen(function* () {
            const reviewerPrompt = yield* Prompts.get("reviewer");

            expect(reviewerPrompt).toBeDefined();
            expect(reviewerPrompt.length).toBeGreaterThan(0);
            expect(reviewerPrompt).toContain("reviewer");
        }).pipe(Effect.provide(Prompts.Default));

        await Effect.runPromise(program);
    });

    test("fails gracefully with non-existent prompt", async () => {
        // @ts-expect-error
        const program = Prompts.get("nonexistent").pipe(Effect.provide(Prompts.Default));

        expect(Effect.runPromise(program)).rejects.toThrow();
    });

    test("generates writer task prompt with full context", async () => {
        const program = Effect.gen(function* () {
            const writerTask = yield* Prompts.getWriterTask;

            const input = {
                goal: "Write a test",
                latestComments: Chunk.make(
                    new ReviewComment({
                        id: "1",
                        path: "/src/test.ts",
                        line: Option.some(10),
                        content: "Fix this typo",
                        timestamp: Date.now(),
                    }),
                ),
                latestFeedback: Option.some("Please add more tests"),
                previousContext: Option.some({
                    filesRead: [{ path: "/src/existing.ts", summary: "Existing code" }],
                    filesModified: ["/src/test.ts"],
                }),
            };

            const prompt = writerTask.render(input);

            expect(prompt).toContain("# Task");
            expect(prompt).toContain("Write a test");
            expect(prompt).toContain("Current Date:");

            expect(prompt).toContain("## Context from Previous Iterations");
            expect(prompt).toContain("### Files Already Read");
            expect(prompt).toContain("- /src/existing.ts: Existing code");
            expect(prompt).toContain("### Files You Modified (still staged)");
            expect(prompt).toContain("- /src/test.ts");

            expect(prompt).toContain("## Reviewer Feedback to Address");
            expect(prompt).toContain("- /src/test.ts:10: Fix this typo");

            expect(prompt).toContain("## User Feedback");
            expect(prompt).toContain("Please add more tests");
        }).pipe(Effect.provide(Prompts.Default));

        await Effect.runPromise(program);
    });

    test("generates reviewer task prompt with diffs", async () => {
        const program = Effect.gen(function* () {
            const reviewerTask = yield* Prompts.getReviewerTask;

            const diffHunk = new DiffHunk({
                oldStart: 1,
                oldLines: 1,
                newStart: 1,
                newLines: 2,
                content: "@@ -1,1 +1,2 @@\n-old\n+new line 1\n+new line 2",
            });

            const input = {
                goal: "Review changes",
                diffs: Chunk.make(
                    new FilePatch({
                        path: "/src/changed.ts",
                        hunks: Chunk.make(diffHunk),
                        isNew: false,
                        isDeleted: false,
                    }),
                ),
            };

            const prompt = reviewerTask.render(input);

            expect(prompt).toContain("# Task");
            expect(prompt).toContain("Review changes");
            expect(prompt).toContain("Current Date:");

            expect(prompt).toContain("## Staged Changes (Diffs)");
            expect(prompt).toContain("### /src/changed.ts");
            expect(prompt).toContain("```diff");
            expect(prompt).toContain("@@ -1,1 +1,2 @@");
            expect(prompt).toContain("-old");
            expect(prompt).toContain("+new line 1");
            expect(prompt).toContain("+new line 2");
        }).pipe(Effect.provide(Prompts.Default));

        await Effect.runPromise(program);
    });
});
