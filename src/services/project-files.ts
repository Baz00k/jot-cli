import { FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { Glob } from "bun";
import { Effect } from "effect";
import ignore from "ignore";
import { EXCERPT_SIZE_KB, MAX_FULL_FILE_SIZE_KB, MAX_LIST_FILE_SIZE_KB } from "@/domain/constants";
import { FileReadError, FileWriteError } from "@/domain/errors";

const IGNORE_PATTERNS = [
    ".*",
    "node_modules/",
    "__pycache__/",
    "dist/",
    "build/",
    "target/",
    "vendor/",
    "bin/",
    "obj/",
    "tmp/",
    "temp/",
    "cache/",
    "logs/",
    "venv/",
    "env/",
].join("\n");

export class ProjectFiles extends Effect.Service<ProjectFiles>()("services/ProjectFiles", {
    effect: Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cwd = process.cwd();

        const ig = yield* Effect.gen(function* () {
            const gitignorePath = path.join(cwd, ".gitignore");
            const content = yield* fs.readFileString(gitignorePath).pipe(Effect.orElse(() => Effect.succeed("")));
            return ignore().add(content).add(IGNORE_PATTERNS);
        });

        /**
         * Returns a safe path that is within the project directory.
         */
        const safePath = (p: string) =>
            Effect.gen(function* () {
                const resolved = path.resolve(p);
                const absCwd = path.resolve(cwd);
                const normResolved = path.normalize(resolved);
                const normCwd = path.normalize(absCwd);
                const lowerResolved = normResolved.toLowerCase();
                const lowerCwd = normCwd.toLowerCase();

                if (!lowerResolved.startsWith(lowerCwd)) {
                    return yield* Effect.fail(
                        new FileReadError({
                            cause: "Access denied",
                            message: `Access denied: ${resolved} is outside of ${cwd}`,
                        }),
                    );
                }

                return resolved;
            });

        /**
         * Returns true if the given path should be ignored.
         */
        const shouldIgnore = (relativePath: string) => Effect.sync(() => ig.ignores(relativePath));

        /**
         * List files in the project directory. Respects .gitignore.
         */
        const listFiles = (dirPath?: string, recursive = false) =>
            Effect.gen(function* () {
                const targetDir = yield* safePath(dirPath ?? ".");
                const names = yield* fs.readDirectory(targetDir, { recursive });

                const entries = yield* Effect.all(
                    names.map((name) =>
                        Effect.gen(function* () {
                            const fullPath = path.join(targetDir, name);
                            const stats = yield* fs.stat(fullPath);
                            const relPath = path.relative(cwd, fullPath);
                            const checkPath =
                                stats.type === "Directory" && !relPath.endsWith("/") ? `${relPath}/` : relPath;

                            const should = yield* shouldIgnore(checkPath);
                            if (should) {
                                return null;
                            }
                            return {
                                name: path.basename(name),
                                type: stats.type,
                                path: relPath,
                            };
                        }),
                    ),
                    { concurrency: "unbounded" },
                );

                return entries.filter(Boolean);
            });

        /**
         * Read a file within the project directory.
         * Creates excerpts of large files by default.
         */
        const readFile = (
            filePath: string,
            options: { disableExcerpts?: boolean; lineRange?: { startLine: number; endLine: number } } = {},
        ) =>
            Effect.gen(function* () {
                const targetPath = yield* safePath(filePath);
                const stats = yield* fs.stat(targetPath);
                const content = yield* fs.readFileString(targetPath);

                if (options.lineRange) {
                    const lines = content.split("\n");
                    const { startLine, endLine } = options.lineRange;
                    const startIdx = Math.max(0, startLine - 1);
                    const endIdx = Math.min(lines.length, endLine);
                    return lines.slice(startIdx, endIdx).join("\n");
                }

                if (stats.size >= MAX_FULL_FILE_SIZE_KB && !options.disableExcerpts) {
                    const beginning = content.slice(0, EXCERPT_SIZE_KB);
                    const end = content.slice(-EXCERPT_SIZE_KB);
                    return [beginning, "(...)", end, "Only parts of the file were included for brevity."].join("\n");
                }

                return content;
            });

        /**
         * Write a file within the project directory.
         */
        const writeFile = (filePath: string, content: string, overwrite = false) =>
            Effect.gen(function* () {
                const targetPath = yield* safePath(filePath);

                if (!overwrite) {
                    const exists = yield* fs.exists(targetPath);
                    if (exists) {
                        return yield* Effect.fail(
                            new FileWriteError({
                                cause: "File already exists",
                                message: `File ${filePath} already exists and overwrite is disabled`,
                            }),
                        );
                    }
                }

                const dir = path.dirname(targetPath);
                yield* fs.makeDirectory(dir, { recursive: true });
                yield* fs.writeFileString(targetPath, content);
                return `Successfully wrote to ${filePath}`;
            });

        /**
         * Search for files within the project directory using a glob pattern.
         */
        const searchFiles = (pattern: string, filePattern?: string, caseSensitive = false, maxResults = 50) =>
            Effect.gen(function* () {
                const results: Array<{
                    file: string;
                    line: number;
                    content: string;
                    matches: number;
                }> = [];

                const regex = new RegExp(pattern, caseSensitive ? "g" : "gi");

                // Glob pattern calculation
                let globPattern = filePattern ?? "**/*";
                if (filePattern && !filePattern.includes("/") && !filePattern.startsWith("**")) {
                    globPattern = `**/${filePattern}`;
                }

                const glob = new Glob(globPattern);
                const filePaths = yield* Effect.tryPromise(() => Array.fromAsync(glob.scan({ cwd, onlyFiles: true })));

                for (const filePath of filePaths) {
                    if (results.length >= maxResults) break;

                    if (ig.ignores(filePath)) continue;

                    yield* Effect.catchAll(
                        Effect.gen(function* () {
                            const fullPath = path.join(cwd, filePath);
                            const stats = yield* fs.stat(fullPath);
                            if (stats.size > MAX_LIST_FILE_SIZE_KB) return;

                            const content = yield* fs.readFileString(fullPath);
                            const lines = content.split("\n");

                            for (let i = 0; i < lines.length && results.length < maxResults; i++) {
                                const line = lines[i];
                                if (!line) continue;
                                const matches = line.match(regex);
                                if (matches && matches.length > 0) {
                                    results.push({
                                        file: filePath,
                                        line: i + 1,
                                        content: line.trim(),
                                        matches: matches.length,
                                    });
                                }
                            }
                        }),
                        () => Effect.succeed(undefined),
                    );
                }

                return results;
            });

        return {
            safePath,
            shouldIgnore,
            listFiles,
            readFile,
            writeFile,
            searchFiles,
        };
    }),
    dependencies: [BunContext.layer],
    accessors: true,
}) {}
