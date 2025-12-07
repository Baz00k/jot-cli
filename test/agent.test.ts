import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { ResearchAgent } from "../src/agent.js";

describe("ResearchAgent", () => {
    let testDir: string;
    let originalCwd: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), "jot-cli-agent-test-"));
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

    test("requires API key with helpful error message", () => {
        expect(() => {
            new ResearchAgent({ prompt: "Test" });
        }).toThrow(/config set-key/i);
    });

    test("creates instance with valid configuration", () => {
        const agent = new ResearchAgent({
            prompt: "Test prompt",
            openRouterApiKey: "test-key",
            modelWriter: "custom/writer",
            modelReviewer: "custom/reviewer",
        });

        expect(agent).toBeDefined();
    });

    test("writes content to file within project", async () => {
        const agent = new ResearchAgent({
            prompt: "Test",
            openRouterApiKey: "test-key",
        });

        await agent.executeWrite("output.txt", "test content");

        const written = await fs.readFile(path.join(testDir, "output.txt"), "utf-8");
        expect(written).toBe("test content");
    });

    test("creates nested directories when writing files", async () => {
        const agent = new ResearchAgent({
            prompt: "Test",
            openRouterApiKey: "test-key",
        });

        await agent.executeWrite("sections/intro/part1.tex", "content");

        const written = await fs.readFile(path.join(testDir, "sections/intro/part1.tex"), "utf-8");
        expect(written).toBe("content");
    });

    test("prevents writing outside project directory", async () => {
        const agent = new ResearchAgent({
            prompt: "Test",
            openRouterApiKey: "test-key",
        });

        expect(agent.executeWrite("../outside.txt", "bad")).rejects.toThrow(/Access denied/i);
    });
});
