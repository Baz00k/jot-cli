import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BunContext } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { Config, ConfigLive } from "@/services/config";

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

    // Provide the Config service, with its dependencies satisfied by BunContext
    const MainLayer = ConfigLive.pipe(Layer.provide(BunContext.layer));

    const runWithConfig = <A, E>(effect: Effect.Effect<A, E, Config>) =>
        Effect.runPromise(Effect.provide(effect, MainLayer));

    test("returns correct config path for platform", () =>
        runWithConfig(
            Effect.gen(function* () {
                const config = yield* Config;
                expect(config.location).toContain("jot-cli");
                expect(config.location).toContain("config.json");
            }),
        ));

    test("stores and retrieves API key", () =>
        runWithConfig(
            Effect.gen(function* () {
                const testKey = "sk-or-v1-test-key";
                const config = yield* Config;
                yield* config.update({ openRouterApiKey: testKey });

                const userConfig = yield* config.get;
                expect(userConfig.openRouterApiKey).toBe(testKey);
            }),
        ));

    test("detects when API key is not set", () =>
        runWithConfig(
            Effect.gen(function* () {
                const config = yield* Config;
                const userConfig = yield* config.get;
                expect(userConfig.openRouterApiKey).toBeUndefined();
            }),
        ));

    test("updates existing API key", () =>
        runWithConfig(
            Effect.gen(function* () {
                const config = yield* Config;
                yield* config.update({ openRouterApiKey: "first-key" });
                yield* config.update({ openRouterApiKey: "second-key" });

                const userConfig = yield* config.get;
                expect(userConfig.openRouterApiKey).toBe("second-key");
            }),
        ));
});
