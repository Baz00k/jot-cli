import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { listFilesTool, readFileTool, safePath, writeFileTool } from "../src/tools.js";

describe("Tools Module", () => {
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
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe("safePath - Security Critical", () => {
        test("allows legitimate paths within project", () => {
            const result = safePath("sections/intro.tex");
            expect(result).toContain("sections");
            expect(path.isAbsolute(result)).toBe(true);
        });

        test("prevents path traversal with ..", () => {
            expect(() => safePath("../outside.txt")).toThrow("Access denied");
        });

        test("prevents complex path traversal attempts", () => {
            expect(() => safePath("subdir/../../outside.txt")).toThrow("Access denied");
        });

        test("prevents absolute path escapes", () => {
            expect(() => safePath("/tmp/outside.txt")).toThrow("Access denied");
        });
    });

    describe("Core File Operations", () => {
        test("lists files and filters noise (node_modules, hidden)", async () => {
            await fs.mkdir(path.join(testDir, "node_modules"));
            await fs.mkdir(path.join(testDir, ".git"));
            await fs.writeFile(path.join(testDir, "paper.tex"), "content");

            const result = await listFilesTool.execute!({ dirPath: "." }, {} as any);
            const fileNames = (result as any[]).map((entry: any) => entry.name);

            expect(fileNames).toContain("paper.tex");
            expect(fileNames).not.toContain("node_modules");
            expect(fileNames).not.toContain(".git");
        });

        test("reads file content", async () => {
            await fs.writeFile(path.join(testDir, "test.txt"), "content");
            const result = await readFileTool.execute!({ filePath: "test.txt" }, {} as any);
            expect(result).toBe("content");
        });

        test("enforces file size limit", async () => {
            const largeContent = "x".repeat(101 * 1024);
            await fs.writeFile(path.join(testDir, "large.txt"), largeContent);

            expect(readFileTool.execute!({ filePath: "large.txt" }, {} as any)).rejects.toThrow(/too large/i);
        });

        test("writes content and creates directories", async () => {
            await writeFileTool.execute!({ filePath: "a/b/c/file.txt", content: "test" }, {} as any);

            const written = await fs.readFile(path.join(testDir, "a/b/c/file.txt"), "utf-8");
            expect(written).toBe("test");
        });

        test("respects security boundaries on write", async () => {
            expect(writeFileTool.execute!({ filePath: "../outside.txt", content: "bad" }, {} as any)).rejects.toThrow();
        });
    });
});
