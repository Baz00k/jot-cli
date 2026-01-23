import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ToolExecutionOptions } from "ai";
import { editFileTool, listFilesTool, readFileTool, searchFilesTool, writeFileTool } from "@/tools";

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
            const result = (await listFilesTool.execute?.(
                { dirPath: ".", maxResults: 25 },
                {} as ToolExecutionOptions,
            )) as {
                name: string;
            }[];
            expect(result.some((f) => f.name === "test.txt")).toBe(true);
        });
    });

    describe("readFileTool", () => {
        test("executes successfully", async () => {
            await fs.writeFile(path.join(testDir, "test.txt"), "content");
            const result = await readFileTool.execute?.({ filePath: "test.txt" }, {} as ToolExecutionOptions);
            expect(result).toBe("content");
        });
    });

    describe("writeFileTool", () => {
        test("executes successfully", async () => {
            await writeFileTool.execute?.({ filePath: "test.txt", content: "content" }, {} as ToolExecutionOptions);
            const content = await fs.readFile(path.join(testDir, "test.txt"), "utf-8");
            expect(content).toBe("content");
        });
    });

    describe("editFileTool", () => {
        test("executes successfully", async () => {
            await fs.writeFile(path.join(testDir, "test.txt"), "hello world");
            await editFileTool.execute?.(
                { filePath: "test.txt", oldString: "world", newString: "universe" },
                {} as ToolExecutionOptions,
            );
            const content = await fs.readFile(path.join(testDir, "test.txt"), "utf-8");
            expect(content).toBe("hello universe");
        });

        test("handles multi-line strings", async () => {
            const multiLineContent = "line1\nline2\nline3";
            await fs.writeFile(path.join(testDir, "test.txt"), multiLineContent);
            await editFileTool.execute?.(
                { filePath: "test.txt", oldString: "line1\nline2", newString: "newLine1\nnewLine2" },
                {} as ToolExecutionOptions,
            );
            const content = await fs.readFile(path.join(testDir, "test.txt"), "utf-8");
            expect(content).toBe("newLine1\nnewLine2\nline3");
        });

        test("handles special characters", async () => {
            await fs.writeFile(path.join(testDir, "test.txt"), "hello@world#test");
            await editFileTool.execute?.(
                { filePath: "test.txt", oldString: "@world", newString: "@universe" },
                {} as ToolExecutionOptions,
            );
            const content = await fs.readFile(path.join(testDir, "test.txt"), "utf-8");
            expect(content).toBe("hello@universe#test");
        });

        test("fails if oldString and newString are the same", async () => {
            await fs.writeFile(path.join(testDir, "test.txt"), "hello world");
            const result = await editFileTool.execute?.(
                { filePath: "test.txt", oldString: "world", newString: "world" },
                {} as ToolExecutionOptions,
            );
            expect(result).toBe("Error editing file: oldString and newString must be different");
        });

        test("fails if oldString is not found", async () => {
            await fs.writeFile(path.join(testDir, "test.txt"), "hello world");
            const result = await editFileTool.execute?.(
                { filePath: "test.txt", oldString: "universe", newString: "galaxy" },
                {} as ToolExecutionOptions,
            );
            expect(result).toBe("Error editing file: oldString not found in content");
        });

        test("fails if multiple matches exist and replaceAll is false", async () => {
            await fs.writeFile(path.join(testDir, "test.txt"), "hello world hello world");
            const result = await editFileTool.execute?.(
                { filePath: "test.txt", oldString: "world", newString: "universe" },
                {} as ToolExecutionOptions,
            );
            expect(result).toBe(
                "Error editing file: Found multiple matches for oldString. Provide more surrounding lines in oldString to identify the correct match.",
            );
        });

        test("replaces all occurrences if replaceAll is true", async () => {
            await fs.writeFile(path.join(testDir, "test.txt"), "hello world hello world");
            await editFileTool.execute?.(
                { filePath: "test.txt", oldString: "world", newString: "universe", replaceAll: true },
                {} as ToolExecutionOptions,
            );
            const content = await fs.readFile(path.join(testDir, "test.txt"), "utf-8");
            expect(content).toBe("hello universe hello universe");
        });
    });

    describe("searchFilesTool", () => {
        test("executes successfully", async () => {
            await fs.writeFile(path.join(testDir, "test.txt"), "search-target");
            const result = (await searchFilesTool.execute?.(
                { pattern: "search-target", caseSensitive: false, maxResults: 50 },
                {} as ToolExecutionOptions,
            )) as {
                results: unknown[];
            };
            expect(result.results.length).toBe(1);
        });
    });
});
