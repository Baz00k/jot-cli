import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
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
});
