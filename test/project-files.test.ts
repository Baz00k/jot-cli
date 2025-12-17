import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Effect } from "effect";
import { MAX_FULL_FILE_SIZE_KB } from "@/domain/constants";
import { ProjectFiles } from "@/services/project-files";

describe("ProjectFiles Service", () => {
    let testDir: string;
    let originalCwd: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), "jot-cli-service-test-"));
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

    const runEffect = <A, E>(effect: Effect.Effect<A, E, ProjectFiles>) =>
        Effect.runPromise(effect.pipe(Effect.provide(ProjectFiles.Default)));

    describe("Security - Path Traversal Prevention", () => {
        const runSafePath = (p: string) => runEffect(ProjectFiles.safePath(p));

        test("prevents path traversal with ..", async () => {
            expect(runSafePath("../outside.txt")).rejects.toThrow("Access denied");
        });

        test("prevents complex path traversal attempts", async () => {
            expect(runSafePath("subdir/../../outside.txt")).rejects.toThrow("Access denied");
        });

        test("prevents absolute path escapes", async () => {
            expect(runSafePath("/tmp/outside.txt")).rejects.toThrow("Access denied");
        });
    });

    describe("Core File Operations", () => {
        test("lists files and filters noise (node_modules, hidden)", async () => {
            await fs.mkdir(path.join(testDir, "node_modules"));
            await fs.mkdir(path.join(testDir, ".git"));
            await fs.writeFile(path.join(testDir, "paper.tex"), "content");

            const result = (await runEffect(ProjectFiles.listFiles(undefined, false))) as {
                name: string;
            }[];

            const fileNames = result.map((entry) => entry.name);
            expect(fileNames).not.toContain(".");
            expect(fileNames).not.toContain(".git");
            expect(fileNames).toContain("paper.tex");
        });

        test("reads file content and creates excerpts for large files", async () => {
            await fs.writeFile(path.join(testDir, "small.txt"), "content");
            const smallResult = await runEffect(ProjectFiles.readFile("small.txt"));
            expect(smallResult).toBe("content");

            // Large file
            const largeContent = `START\n${"x".repeat(MAX_FULL_FILE_SIZE_KB + 1)}\nEND`;
            await fs.writeFile(path.join(testDir, "large.txt"), largeContent);
            const largeResult = await runEffect(ProjectFiles.readFile("large.txt"));

            expect(largeResult).toContain("START");
            expect(largeResult).toContain("(...)");
            expect(largeResult).toContain("END");
        });

        test("writes files and creates directories", async () => {
            await runEffect(ProjectFiles.writeFile("a/b/c/file.txt", "test", false));

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

            const result = (await runEffect(ProjectFiles.listFiles(".", false))) as {
                name: string;
            }[];
            const fileNames = result.map((entry) => entry.name);

            expect(fileNames).toContain("included.txt");
            expect(fileNames).not.toContain("ignored.txt");
            expect(fileNames).not.toContain("temp");
        });

        test("respects .gitignore when searching", async () => {
            await fs.mkdir(path.join(testDir, ".git"));
            await fs.writeFile(path.join(testDir, ".gitignore"), "ignored.txt\n");

            await fs.writeFile(path.join(testDir, "included.txt"), "searchme\n");
            await fs.writeFile(path.join(testDir, "ignored.txt"), "searchme\n");

            const result = await runEffect(ProjectFiles.searchFiles("searchme"));

            expect(result.length).toBe(1);
            expect(result[0]?.file).toContain("included.txt");
        });
    });

    describe("Search Functionality", () => {
        test("searches for patterns in file contents", async () => {
            await fs.writeFile(path.join(testDir, "file1.txt"), "hello world\n");
            await fs.writeFile(path.join(testDir, "file2.txt"), "hello there\n");

            const result = await runEffect(ProjectFiles.searchFiles("hello"));

            expect(result.length).toBe(2);
        });

        test("filters by file pattern", async () => {
            await fs.writeFile(path.join(testDir, "file.ts"), "const test = 123;\n");
            await fs.writeFile(path.join(testDir, "file.txt"), "const test = 456;\n");

            const result = await runEffect(ProjectFiles.searchFiles("test", "*.ts"));

            expect(result.length).toBe(1);
            expect(result[0]?.file).toContain(".ts");
        });

        test("searches recursively in subdirectories", async () => {
            await fs.mkdir(path.join(testDir, "subdir"));
            await fs.writeFile(path.join(testDir, "root.txt"), "find this\n");
            await fs.writeFile(path.join(testDir, "subdir/nested.txt"), "find this\n");

            const result = await runEffect(ProjectFiles.searchFiles("find this"));

            expect(result.length).toBe(2);
        });
    });
});
