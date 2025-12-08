import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { listFilesTool, readFileTool, safePath, searchFilesTool, writeFileTool } from "../src/tools.js";

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

    describe("Security - Path Traversal Prevention", () => {
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
            expect(fileNames).not.toContain(".");
            expect(fileNames).not.toContain(".git");
        });

        test("reads file content and creates excerpts for large files", async () => {
            await fs.writeFile(path.join(testDir, "small.txt"), "content");
            const smallResult = await readFileTool.execute!({ filePath: "small.txt" }, {} as any);
            expect(smallResult).toBe("content");

            // Large file
            const largeContent = "START\n" + "x".repeat(101 * 1024) + "\nEND";
            await fs.writeFile(path.join(testDir, "large.txt"), largeContent);
            const largeResult = await readFileTool.execute!({ filePath: "large.txt" }, {} as any);

            expect(largeResult).toContain("START");
            expect(largeResult).toContain("(...)");
            expect(largeResult).toContain("Only parts of the file were included for brevity.");
        });

        test("writes files and creates directories", async () => {
            await writeFileTool.execute!({ filePath: "a/b/c/file.txt", content: "test" }, {} as any);

            const written = await fs.readFile(path.join(testDir, "a/b/c/file.txt"), "utf-8");
            expect(written).toBe("test");
        });
    });

    describe("Gitignore Integration", () => {
        test("respects .gitignore when listing files", async () => {
            await fs.mkdir(path.join(testDir, ".git"));
            await fs.writeFile(path.join(testDir, ".gitignore"), "ignored.txt\ntemp/\n");

            await fs.writeFile(path.join(testDir, "included.txt"), "content");
            await fs.writeFile(path.join(testDir, "ignored.txt"), "content");
            await fs.mkdir(path.join(testDir, "temp"));

            const result = await listFilesTool.execute!({ dirPath: "." }, {} as any);
            const fileNames = (result as any[]).map((entry: any) => entry.name);

            expect(fileNames).toContain("included.txt");
            expect(fileNames).not.toContain("ignored.txt");
            expect(fileNames).not.toContain("temp");
        });

        test("respects .gitignore when searching", async () => {
            await fs.mkdir(path.join(testDir, ".git"));
            await fs.writeFile(path.join(testDir, ".gitignore"), "ignored.txt\n");

            await fs.writeFile(path.join(testDir, "included.txt"), "searchme\n");
            await fs.writeFile(path.join(testDir, "ignored.txt"), "searchme\n");

            const result = await searchFilesTool.execute!(
                { pattern: "searchme", caseSensitive: false, maxResults: 50 },
                {} as any,
            );

            expect((result as any).results.length).toBe(1);
            expect((result as any).results[0].file).toContain("included.txt");
        });
    });

    describe("Search Functionality", () => {
        test("searches for patterns in file contents", async () => {
            await fs.writeFile(path.join(testDir, "file1.txt"), "hello world\n");
            await fs.writeFile(path.join(testDir, "file2.txt"), "hello there\n");

            const result = await searchFilesTool.execute!(
                { pattern: "hello", caseSensitive: false, maxResults: 50 },
                {} as any,
            );

            expect((result as any).totalResults).toBe(2);
        });

        test("filters by file pattern", async () => {
            await fs.writeFile(path.join(testDir, "file.ts"), "const test = 123;\n");
            await fs.writeFile(path.join(testDir, "file.txt"), "const test = 456;\n");

            const result = await searchFilesTool.execute!(
                {
                    pattern: "test",
                    filePattern: "*.ts",
                    caseSensitive: false,
                    maxResults: 50,
                },
                {} as any,
            );

            expect((result as any).results.length).toBe(1);
            expect((result as any).results[0].file).toContain(".ts");
        });

        test("searches recursively in subdirectories", async () => {
            await fs.mkdir(path.join(testDir, "subdir"));
            await fs.writeFile(path.join(testDir, "root.txt"), "find this\n");
            await fs.writeFile(path.join(testDir, "subdir/nested.txt"), "find this\n");

            const result = await searchFilesTool.execute!(
                { pattern: "find this", caseSensitive: false, maxResults: 50 },
                {} as any,
            );

            expect((result as any).totalResults).toBe(2);
        });
    });
});
