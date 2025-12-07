import { tool } from "ai";
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";

const safePath = (p: string) => {
    const resolved = path.resolve(p);
    const cwd = process.cwd();
    if (!resolved.startsWith(cwd)) {
        throw new Error(`Access denied: ${resolved} is outside of current working directory ${cwd}`);
    }
    return resolved;
};

export const listFilesTool = tool({
    description: "List files in a directory to understand project structure",
    parameters: z.object({
        dirPath: z.string().optional().describe('The directory path to list (relative to cwd). Defaults to "."'),
    }),
    execute: async ({ dirPath }: { dirPath?: string }) => {
        try {
            const targetDir = safePath(dirPath || ".");
            const entries = await fs.readdir(targetDir, { withFileTypes: true });

            // Filter out node_modules and hidden files for noise reduction
            const filtered = entries.filter(
                (e) => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "dist" && e.name !== "out",
            );

            return filtered.map((e) => ({
                name: e.name,
                isDirectory: e.isDirectory(),
                path: path.relative(process.cwd(), path.join(targetDir, e.name)),
            }));
        } catch (error: any) {
            return `Error listing files: ${error.message}`;
        }
    },
});

export const readFileTool = tool({
    description: "Read the content of a file (e.g., .md, .tex, .bib, .txt)",
    parameters: z.object({
        filePath: z.string().describe("The relative path to the file to read"),
    }),
    execute: async ({ filePath }: { filePath: string }) => {
        try {
            const targetPath = safePath(filePath);
            const stats = await fs.stat(targetPath);
            if (stats.size > 100 * 1024) {
                // 100KB limit for context window safety
                return `Error: File ${filePath} is too large (${stats.size} bytes). Read specific sections if possible or summarize.`;
            }
            const content = await fs.readFile(targetPath, "utf-8");
            return content;
        } catch (error: any) {
            return `Error reading file: ${error.message}`;
        }
    },
});

export const writeFileTool = tool({
    description: "Write or overwrite content to a file. USE WITH CAUTION.",
    parameters: z.object({
        filePath: z.string().describe("The relative path to the file to write"),
        content: z.string().describe("The full content to write to the file"),
    }),
    execute: async ({ filePath, content }: { filePath: string; content: string }) => {
        try {
            const targetPath = safePath(filePath);
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.writeFile(targetPath, content, "utf-8");
            return `Successfully wrote to ${filePath}`;
        } catch (error: any) {
            return `Error writing file: ${error.message}`;
        }
    },
});

export const tools = {
    list_files: listFilesTool,
    read_file: readFileTool,
    write_file: writeFileTool,
};
