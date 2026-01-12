import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";
import type { UserConfig } from "@/services/config";

describe("CLI Integration", () => {
    let testConfigDir: string;
    let originalHome: string | undefined;
    let originalUserProfile: string | undefined;
    let originalXdgConfigHome: string | undefined;

    beforeEach(async () => {
        originalHome = process.env.HOME;
        originalUserProfile = process.env.USERPROFILE;
        originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

        testConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), "jot-cli-config-test-"));

        process.env.HOME = testConfigDir;
        process.env.USERPROFILE = testConfigDir;
        process.env.XDG_CONFIG_HOME = path.join(testConfigDir, ".config");
    });

    afterEach(async () => {
        if (originalHome !== undefined) {
            process.env.HOME = originalHome;
        } else {
            delete process.env.HOME;
        }
        if (originalUserProfile !== undefined) {
            process.env.USERPROFILE = originalUserProfile;
        } else {
            delete process.env.USERPROFILE;
        }
        if (originalXdgConfigHome !== undefined) {
            process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
        } else {
            delete process.env.XDG_CONFIG_HOME;
        }

        try {
            await fs.rm(testConfigDir, { recursive: true, force: true });
        } catch (_error) {
            // Ignore cleanup errors
        }
    });

    test("shows version", async () => {
        const { stdout } = await $`bun run src/index.ts --version`.quiet();
        const output = stdout.toString();
        expect(output.trim()).toMatch(/\d+\.\d+\.\d+/);
    });

    test("shows help with available commands", async () => {
        const { stdout } = await $`bun run src/index.ts --help`.quiet();
        const output = stdout.toString();
        expect(output).toContain("AI Research Assistant CLI");
        expect(output).toContain("config");
        expect(output).toContain("write");
    });

    test("config set-key stores API key", async () => {
        const testKey = "sk-or-v1-test-key";
        await $`bun run src/index.ts config set-key ${testKey}`.quiet();

        const { stdout } = await $`bun run src/index.ts config show-path`.quiet();
        const configPath = stdout.toString().trim();

        const content = await fs.readFile(configPath, "utf-8");
        const config = JSON.parse(content) as UserConfig;

        expect(config.openRouterApiKey).toBe(testKey);
    });

    test("config status shows when not configured", async () => {
        const { stdout } = await $`bun run src/index.ts config status`.quiet();
        expect(stdout.toString()).toContain("not configured");
    });

    test("config status shows when configured", async () => {
        await $`bun run src/index.ts config set-key test-key`.quiet();

        const { stdout } = await $`bun run src/index.ts config status`.quiet();
        expect(stdout.toString()).toContain("configured");
    });

    test("write command requires API key", async () => {
        const result = await $`bun run src/index.ts write "test prompt"`.nothrow().quiet();

        expect(result.exitCode).toBe(1);
        const output = result.stdout.toString();
        expect(output).toContain("not configured");
        expect(output).toContain("config set-key");
    });

    test("config show-path returns valid path", async () => {
        const { stdout } = await $`bun run src/index.ts config show-path`.quiet();
        const output = stdout.toString().trim();
        expect(output).toContain("jot-cli");
        expect(output).toContain("config.json");
    });

    test("handles invalid commands gracefully", async () => {
        const result = await $`bun run src/index.ts invalid-command`.nothrow().quiet();
        expect(result.exitCode).toBe(0);
        expect(result.stdout.toString()).toContain("USAGE");
    });

    test("handles invalid subcommand gracefully", async () => {
        const result = await $`bun run src/index.ts config invalid-subcommand`.nothrow().quiet();
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr.toString()).toContain("Invalid subcommand");
    });

    test("config file is valid JSON with proper formatting", async () => {
        await $`bun run src/index.ts config set-key test-key-123`.quiet();

        const { stdout } = await $`bun run src/index.ts config show-path`.quiet();
        const configPath = stdout.toString().trim();

        const content = await fs.readFile(configPath, "utf-8");

        // Should be valid JSON
        const config = JSON.parse(content);
        expect(config).toHaveProperty("openRouterApiKey");

        // Should have indentation (readable)
        expect(content).toContain("\n");
    });
});
