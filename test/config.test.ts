import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { getConfigLocation, getOpenRouterApiKey, hasOpenRouterApiKey, setOpenRouterApiKey } from "@/config";

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

    test("returns correct config path for platform", () => {
        const location = getConfigLocation();
        expect(location).toContain("jot-cli");
        expect(location).toContain("config.json");
    });

    test("stores and retrieves API key", async () => {
        const testKey = "sk-or-v1-test-key";
        await setOpenRouterApiKey(testKey);

        const retrieved = await getOpenRouterApiKey();
        expect(retrieved).toBe(testKey);
    });

    test("detects when API key is not set", async () => {
        const hasKey = await hasOpenRouterApiKey();
        expect(hasKey).toBe(false);
    });

    test("updates existing API key", async () => {
        await setOpenRouterApiKey("first-key");
        await setOpenRouterApiKey("second-key");

        const retrieved = await getOpenRouterApiKey();
        expect(retrieved).toBe("second-key");
    });
});
