import * as fs from "node:fs/promises";
import * as path from "node:path";
import { type ToolCallOptions, tool } from "ai";
import { Glob } from "bun";
import ignore from "ignore";
import { z } from "zod";

export const safePath = (p: string) => {
    const resolved = path.resolve(p);
    const cwd = process.cwd();
    // Normalize for cross-platform comparison (handles Windows drive letter casing)
    const normalizedResolved = path.normalize(resolved).toLowerCase();
    const normalizedCwd = path.normalize(cwd).toLowerCase();
    if (!normalizedResolved.startsWith(normalizedCwd)) {
        throw new Error(`Access denied: ${resolved} is outside of current working directory ${cwd}`);
    }
    return resolved;
};

/**
 * Check if a directory is a git repository by looking for .git directory
 */
async function isGitRepo(dir: string): Promise<boolean> {
    try {
        const gitPath = path.join(dir, ".git");
        const stat = await fs.stat(gitPath);
        return stat.isDirectory();
    } catch {
        return false;
    }
}

/**
 * Load and parse .gitignore file if it exists
 */
async function loadGitignore(dir: string): Promise<ReturnType<typeof ignore> | null> {
    try {
        const gitignorePath = path.join(dir, ".gitignore");
        const content = await fs.readFile(gitignorePath, "utf-8");
        return ignore().add(content).add(".git");
    } catch {
        return null;
    }
}

/**
 * Common function to determine if a path (file or directory) should be ignored
 * Centralizes the logic for filtering across all tools
 */
function shouldIgnorePath(
    pathName: string,
    relativePath: string,
    isDirectory: boolean,
    ig: ReturnType<typeof ignore> | null,
): boolean {
    // Always filter these for noise reduction
    if (pathName.startsWith(".") && pathName !== ".gitignore") return true;

    // Check gitignore if available
    if (ig) {
        const normalizedPath = relativePath.replace(/\/+$/, "");
        const pathToCheck = isDirectory ? normalizedPath + "/" : normalizedPath;
        if (ig.ignores(pathToCheck)) return true;
    }

    return false;
}

export const listFilesTool = tool({
    description:
        "List files in a directory to understand project structure. Automatically respects .gitignore if in a git repository.",
    inputSchema: z.object({
        dirPath: z.string().optional().describe('The directory path to list (relative to cwd). Defaults to "."'),
    }),
    execute: async ({ dirPath }: { dirPath?: string }, options: ToolCallOptions) => {
        const targetDir = safePath(dirPath || ".");
        const entries = await fs.readdir(targetDir, { withFileTypes: true });

        const cwd = process.cwd();
        const isGit = await isGitRepo(cwd);
        const ig = isGit ? await loadGitignore(cwd) : null;

        const filtered = entries.filter((e) => {
            const relativePath = path.relative(cwd, path.join(targetDir, e.name));
            return !shouldIgnorePath(e.name, relativePath, e.isDirectory(), ig);
        });

        return filtered.map((e) => ({
            name: e.name,
            isDirectory: e.isDirectory(),
            path: path.relative(process.cwd(), path.join(targetDir, e.name)),
        }));
    },
});

export const readFileTool = tool({
    description:
        "Read the content of a file (e.g., .md, .tex, .bib, .txt). For large files, returns an excerpt with beginning and end.",
    inputSchema: z.object({
        filePath: z.string().describe("The relative path to the file to read"),
    }),
    execute: async ({ filePath }: { filePath: string }, options: ToolCallOptions) => {
        const targetPath = safePath(filePath);
        const stats = await fs.stat(targetPath);
        const content = await fs.readFile(targetPath, "utf-8");

        const MAX_SIZE = 100 * 1024; // 100KB
        const EXCERPT_SIZE = 40 * 1024; // 40KB for beginning and end each

        if (stats.size > MAX_SIZE) {
            // Create an excerpt with beginning and end
            const beginning = content.slice(0, EXCERPT_SIZE);
            const end = content.slice(-EXCERPT_SIZE);

            return `${beginning}\n\n(...)\n\n${end}\n\nOnly parts of the file were included for brevity.`;
        }

        return content;
    },
});

export const writeFileTool = tool({
    description: "Write or overwrite content to a file. USE WITH CAUTION.",
    inputSchema: z.object({
        filePath: z.string().describe("The relative path to the file to write"),
        content: z.string().describe("The full content to write to the file"),
    }),
    execute: async ({ filePath, content }: { filePath: string; content: string }, options: ToolCallOptions) => {
        const targetPath = safePath(filePath);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, content, "utf-8");
        return `Successfully wrote to ${filePath}`;
    },
});

export const searchFilesTool = tool({
    description:
        "Search for files by content using pattern matching (like ripgrep). Automatically respects .gitignore if in a git repository.",
    inputSchema: z.object({
        pattern: z.string().describe("The regex pattern to search for in file contents"),
        filePattern: z.string().optional().describe("Optional glob pattern to filter files (e.g., '*.ts', '*.md')"),
        caseSensitive: z.boolean().optional().default(false).describe("Whether the search should be case-sensitive"),
        maxResults: z.number().optional().default(50).describe("Maximum number of results to return"),
    }),
    execute: async ({ pattern, filePattern, caseSensitive = false, maxResults = 50 }, options: ToolCallOptions) => {
        const cwd = process.cwd();
        const isGit = await isGitRepo(cwd);
        const ig = isGit ? await loadGitignore(cwd) : null;

        const regex = new RegExp(pattern, caseSensitive ? "g" : "gi");
        const results: Array<{
            file: string;
            line: number;
            content: string;
            matches: number;
        }> = [];

        // Convert simple patterns like "*.ts" to recursive patterns like "**/*.ts"
        // This ensures patterns match files in all subdirectories, not just the root
        let globPattern = filePattern ?? "**/*";
        if (filePattern && !filePattern.includes("/") && !filePattern.startsWith("**")) {
            globPattern = `**/${filePattern}`;
        }
        const glob = new Glob(globPattern);

        for await (const filePath of glob.scan({ cwd, onlyFiles: true })) {
            if (results.length >= maxResults) break;

            const fullPath = path.join(cwd, filePath);

            // Check if path should be ignored
            // We need to check each part of the path for directories
            const pathParts = filePath.split(path.sep);
            let shouldSkip = false;

            for (let i = 0; i < pathParts.length; i++) {
                const partPath = pathParts.slice(0, i + 1).join(path.sep);
                const isDir = i < pathParts.length - 1;
                const partName = pathParts[i];

                if (shouldIgnorePath(partName || "", partPath, isDir, ig)) {
                    shouldSkip = true;
                    break;
                }
            }

            if (shouldSkip) continue;

            try {
                const stats = await fs.stat(fullPath);
                // Skip large files (> 1MB)
                if (stats.size > 1024 * 1024) continue;

                const content = await fs.readFile(fullPath, "utf-8");
                const lines = content.split("\n");

                for (let i = 0; i < lines.length && results.length < maxResults; i++) {
                    const line = lines[i];
                    if (line && regex.test(line)) {
                        results.push({
                            file: filePath,
                            line: i + 1,
                            content: line.trim(),
                            matches: (line.match(regex) || []).length,
                        });
                    }
                }
            } catch (err) {}
        }

        return {
            pattern,
            totalResults: results.length,
            results: results.slice(0, maxResults),
        };
    },
});

export const tools = {
    list_files: listFilesTool,
    read_file: readFileTool,
    write_file: writeFileTool,
    search_files: searchFilesTool,
};
