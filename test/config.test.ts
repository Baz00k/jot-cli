import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Effect } from "effect";
import { ConfigLive, ConfigService } from "../src/services/ConfigService.js";

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
			const configService = yield* ConfigService;
			return yield* configService.getPath;
		}).pipe(Effect.provide(ConfigLive));

		const location = await Effect.runPromise(program);

		expect(location).toContain("jot-cli");
		expect(location).toContain("config.json");
	});

	test("stores and retrieves API key", async () => {
		const testKey = "sk-or-v1-test-key";

		const program = Effect.gen(function* () {
			const configService = yield* ConfigService;
			yield* configService.update({ openRouterApiKey: testKey });
			const config = yield* configService.get;
			return config.openRouterApiKey;
		}).pipe(Effect.provide(ConfigLive));

		const retrieved = await Effect.runPromise(program);

		expect(retrieved).toBe(testKey);
	});

	test("detects when API key is not set", async () => {
		const program = Effect.gen(function* () {
			const configService = yield* ConfigService;
			const config = yield* configService.get;
			return !!config.openRouterApiKey;
		}).pipe(Effect.provide(ConfigLive));

		const hasKey = await Effect.runPromise(program);

		expect(hasKey).toBe(false);
	});

	test("updates existing API key", async () => {
		const program = Effect.gen(function* () {
			const configService = yield* ConfigService;
			yield* configService.update({ openRouterApiKey: "first-key" });
			yield* configService.update({ openRouterApiKey: "second-key" });
			const config = yield* configService.get;
			return config.openRouterApiKey;
		}).pipe(Effect.provide(ConfigLive));

		const retrieved = await Effect.runPromise(program);

		expect(retrieved).toBe("second-key");
	});
});
