import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ToolCallOptions } from "ai";
import { listFilesTool, readFileTool, searchFilesTool, writeFileTool } from "@/tools";

describe("Tools Wrappers", () => {
    let testDir: string;
    let originalCwd: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), "jot-cli-tools-test-"));
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

    describe("listFilesTool", () => {
        test("executes successfully", async () => {
            await fs.writeFile(path.join(testDir, "test.txt"), "content");
            const result = (await listFilesTool.execute?.({ dirPath: "." }, {} as ToolCallOptions)) as {
                name: string;
            }[];
            expect(result.some((f) => f.name === "test.txt")).toBe(true);
        });
    });

    describe("readFileTool", () => {
        test("executes successfully", async () => {
            await fs.writeFile(path.join(testDir, "test.txt"), "content");
            const result = await readFileTool.execute?.({ filePath: "test.txt" }, {} as ToolCallOptions);
            expect(result).toBe("content");
        });
    });

    describe("writeFileTool", () => {
        test("executes successfully", async () => {
            await writeFileTool.execute?.({ filePath: "test.txt", content: "content" }, {} as ToolCallOptions);
            const content = await fs.readFile(path.join(testDir, "test.txt"), "utf-8");
            expect(content).toBe("content");
        });
    });

    describe("searchFilesTool", () => {
        test("executes successfully", async () => {
            await fs.writeFile(path.join(testDir, "test.txt"), "search-target");
            const result = (await searchFilesTool.execute?.({ pattern: "search-target" }, {} as ToolCallOptions)) as {
                results: unknown[];
            };
            expect(result.results.length).toBe(1);
        });
    });
});
