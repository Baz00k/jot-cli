import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

/**
 * Creates a temporary directory for testing and returns its path.
 * The directory will be created in the system's temp directory.
 */
export async function createTempDir(prefix: string = "jot-cli-test-"): Promise<string> {
    return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * Recursively removes a directory and all its contents.
 * Ignores errors if the directory doesn't exist.
 */
export async function cleanupDir(dirPath: string): Promise<void> {
    try {
        await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
        // Ignore cleanup errors
    }
}

/**
 * Creates a test file structure with the given files and contents.
 *
 * @param baseDir - The base directory to create the structure in
 * @param structure - Object mapping file paths to their contents
 *
 * @example
 * await createFileStructure(testDir, {
 *   "file1.txt": "content1",
 *   "subdir/file2.md": "content2",
 * });
 */
export async function createFileStructure(
    baseDir: string,
    structure: Record<string, string>,
): Promise<void> {
    for (const [filePath, content] of Object.entries(structure)) {
        const fullPath = path.join(baseDir, filePath);
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");
    }
}

/**
 * Reads all files in a directory structure and returns their contents.
 * Useful for verifying file operations in tests.
 *
 * @param baseDir - The base directory to read from
 * @returns Object mapping relative file paths to their contents
 */
export async function readFileStructure(baseDir: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    async function readDir(dir: string, relativePath: string = ""): Promise<void> {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const entryPath = path.join(dir, entry.name);
            const relPath = path.join(relativePath, entry.name);

            if (entry.isDirectory()) {
                await readDir(entryPath, relPath);
            } else {
                const content = await fs.readFile(entryPath, "utf-8");
                result[relPath] = content;
            }
        }
    }

    await readDir(baseDir);
    return result;
}

/**
 * Creates a test configuration file with the given data.
 *
 * @param configDir - Directory to create the config file in
 * @param data - Configuration data to write
 * @returns Path to the created config file
 */
export async function createTestConfig(configDir: string, data: any): Promise<string> {
    await fs.mkdir(configDir, { recursive: true });
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(data, null, 2), "utf-8");
    return configPath;
}

/**
 * Checks if a file exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Checks if a directory exists.
 */
export async function dirExists(dirPath: string): Promise<boolean> {
    try {
        const stat = await fs.stat(dirPath);
        return stat.isDirectory();
    } catch {
        return false;
    }
}

/**
 * Creates a file with random content of the specified size in bytes.
 * Useful for testing file size limits.
 */
export async function createFileWithSize(filePath: string, sizeInBytes: number): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Create content of exact size
    const content = "x".repeat(sizeInBytes);
    await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Waits for a specified number of milliseconds.
 * Useful for testing timing-dependent behavior.
 */
export function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Captures the current working directory and provides a function to restore it.
 * Useful for tests that change the working directory.
 */
export function captureWorkingDirectory(): { restore: () => void } {
    const originalCwd = process.cwd();
    return {
        restore: () => process.chdir(originalCwd),
    };
}

/**
 * Captures environment variables and provides a function to restore them.
 *
 * @param vars - Array of environment variable names to capture
 */
export function captureEnvVars(vars: string[]): { restore: () => void } {
    const captured = new Map<string, string | undefined>();

    for (const varName of vars) {
        captured.set(varName, process.env[varName]);
    }

    return {
        restore: () => {
            for (const [varName, value] of captured.entries()) {
                if (value === undefined) {
                    delete process.env[varName];
                } else {
                    process.env[varName] = value;
                }
            }
        },
    };
}

/**
 * Creates a mock progress callback that collects messages.
 */
export function createMockProgress(): {
    callback: (message: string) => void;
    messages: string[];
    clear: () => void;
} {
    const messages: string[] = [];

    return {
        callback: (message: string) => messages.push(message),
        messages,
        clear: () => (messages.length = 0),
    };
}

/**
 * Normalizes line endings for cross-platform string comparison.
 */
export function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, "\n");
}

/**
 * Asserts that a string contains all of the given substrings.
 */
export function containsAll(haystack: string, needles: string[]): boolean {
    return needles.every((needle) => haystack.includes(needle));
}

/**
 * Creates a temporary directory, runs a test function, and cleans up.
 * Useful for tests that need an isolated file system.
 */
export async function withTempDir<T>(
    testFn: (dirPath: string) => Promise<T>,
    prefix: string = "jot-cli-test-",
): Promise<T> {
    const dir = await createTempDir(prefix);
    try {
        return await testFn(dir);
    } finally {
        await cleanupDir(dir);
    }
}

/**
 * Creates a test environment with isolated config and working directory.
 */
export async function withTestEnvironment<T>(
    testFn: (env: { configDir: string; workDir: string }) => Promise<T>,
): Promise<T> {
    const configDir = await createTempDir("jot-config-");
    const workDir = await createTempDir("jot-work-");

    const envCapture = captureEnvVars(["HOME", "USERPROFILE", "XDG_CONFIG_HOME", "APPDATA"]);
    const cwdCapture = captureWorkingDirectory();

    try {
        // Set up test environment
        process.env.HOME = configDir;
        process.env.USERPROFILE = configDir;
        process.env.XDG_CONFIG_HOME = path.join(configDir, ".config");
        delete process.env.APPDATA;

        process.chdir(workDir);

        return await testFn({ configDir, workDir });
    } finally {
        envCapture.restore();
        cwdCapture.restore();
        await cleanupDir(configDir);
        await cleanupDir(workDir);
    }
}
