import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Effect } from "effect";
import { FileWriteError } from "@/domain/errors";
import { Agent } from "@/services/agent";

describe("Agent", () => {
    let testDir: string;
    let originalCwd: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), "jot-agent-test-"));
        process.chdir(testDir);
    });

    afterEach(async () => {
        process.chdir(originalCwd);
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (_error) {
            // Ignore cleanup errors
        }
    });

    test("writes content to file within project", async () => {
        const program = Effect.gen(function* () {
            const agent = yield* Agent;
            yield* agent.executeWrite("output.txt", "test content");
        });

        await Effect.runPromise(program.pipe(Effect.provide(Agent.Default)));

        const written = await fs.readFile(path.join(testDir, "output.txt"), "utf-8");
        expect(written).toBe("test content");
    });

    test("creates nested directories when writing files", async () => {
        const program = Effect.gen(function* () {
            const agent = yield* Agent;
            yield* agent.executeWrite("sections/intro/part1.tex", "content");
        });

        await Effect.runPromise(program.pipe(Effect.provide(Agent.Default)));

        const written = await fs.readFile(path.join(testDir, "sections/intro/part1.tex"), "utf-8");
        expect(written).toBe("content");
    });

    test("prevents writing outside project directory", async () => {
        const program = Effect.gen(function* () {
            const agent = yield* Agent;
            yield* agent.executeWrite("../outside.txt", "content");
        });

        const result = await Effect.runPromise(program.pipe(Effect.provide(Agent.Default), Effect.either));

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(FileWriteError);
            const error = result.left as FileWriteError;
            expect(error.message).toMatch(/Access denied/i);
        }
    });
});
