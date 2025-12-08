import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { listFilesTool, searchFilesTool } from "../src/tools.js";

describe("Integration Tests", () => {
    let testDir: string;
    let originalCwd: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), "jot-integration-"));
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

    test("gitignore filtering works across list and search in realistic project", async () => {
        // Create a realistic project structure
        await fs.mkdir(path.join(testDir, ".git"));
        await fs.mkdir(path.join(testDir, "src"));
        await fs.mkdir(path.join(testDir, "node_modules"));
        await fs.mkdir(path.join(testDir, "dist"));

        // Create .gitignore
        await fs.writeFile(
            path.join(testDir, ".gitignore"),
            `
node_modules/
dist/
*.log
.env
`,
        );

        // Create source files that should be included
        await fs.writeFile(path.join(testDir, "src/index.ts"), 'export const API_KEY = "placeholder";\n');
        await fs.writeFile(path.join(testDir, "README.md"), "# Project\n\nAPI documentation here\n");

        // Create files that should be ignored
        await fs.writeFile(path.join(testDir, "node_modules/package.json"), '{"api": "ignored"}\n');
        await fs.writeFile(path.join(testDir, "dist/bundle.js"), 'const api = "ignored";\n');
        await fs.writeFile(path.join(testDir, "debug.log"), "API call failed\n");
        await fs.writeFile(path.join(testDir, ".env"), "API_KEY=secret\n");

        // Test list_files respects gitignore
        const listResult = await listFilesTool.execute!({ dirPath: "." }, {} as any);
        const listedNames = (listResult as any[]).map((e: any) => e.name);

        expect(listedNames).toContain("src");
        expect(listedNames).toContain("README.md");
        expect(listedNames).not.toContain("node_modules");
        expect(listedNames).not.toContain("dist");
        expect(listedNames).not.toContain("debug.log");
        expect(listedNames).not.toContain(".env");

        // Test search_files respects gitignore
        const searchResult = await searchFilesTool.execute!(
            { pattern: "API", caseSensitive: true, maxResults: 50 },
            {} as any,
        );

        const searchedFiles = (searchResult as any).results.map((r: any) => r.file);

        expect(searchedFiles.some((f: string) => f.includes("index.ts"))).toBe(true);
        expect(searchedFiles.some((f: string) => f.includes("README.md"))).toBe(true);
        expect(searchedFiles.some((f: string) => f.includes("node_modules"))).toBe(false);
        expect(searchedFiles.some((f: string) => f.includes("dist"))).toBe(false);
        expect(searchedFiles.some((f: string) => f.includes(".log"))).toBe(false);
        expect(searchedFiles.some((f: string) => f.includes(".env"))).toBe(false);
    });
});
