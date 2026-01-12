import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Effect } from "effect";
import { Config } from "@/services/config";

describe("Config Module", () => {
    let originalHome: string | undefined;
    let originalUserProfile: string | undefined;
    let originalXdgConfigHome: string | undefined;
    let testConfigDir: string;

    beforeEach(async () => {
        originalHome = process.env.HOME;
        originalUserProfile = process.env.USERPROFILE;
        originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

        testConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), "jot-cli-test-"));

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

    test("returns correct config path for platform", async () => {
        const program = Effect.gen(function* () {
            const config = yield* Config;
            expect(config.location).toContain("jot-cli");
            expect(config.location).toContain("config.json");
        }).pipe(Effect.provide(Config.Default));

        await Effect.runPromise(program);
    });

    test("stores and retrieves API key", async () => {
        const program = Effect.gen(function* () {
            const testKey = "sk-or-v1-test-key";
            const config = yield* Config;
            yield* config.update({ openRouterApiKey: testKey });

            const userConfig = yield* config.get;
            expect(userConfig.openRouterApiKey).toBe(testKey);
        }).pipe(Effect.provide(Config.Default));

        await Effect.runPromise(program);
    });

    test("detects when API key is not set", async () => {
        const program = Effect.gen(function* () {
            const config = yield* Config;
            const userConfig = yield* config.get;
            expect(userConfig.openRouterApiKey).toBeUndefined();
        }).pipe(Effect.provide(Config.Default));

        await Effect.runPromise(program);
    });

    test("updates existing API key", async () => {
        const program = Effect.gen(function* () {
            const config = yield* Config;
            yield* config.update({ openRouterApiKey: "first-key" });
            yield* config.update({ openRouterApiKey: "second-key" });

            const userConfig = yield* config.get;
            expect(userConfig.openRouterApiKey).toBe("second-key");
        }).pipe(Effect.provide(Config.Default));

        await Effect.runPromise(program);
    });
});
