#!/usr/bin/env bun
import { Command } from "@effect/cli";
import { BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import { antigravityCommand } from "@/commands/antigravity";
import { configCommand } from "@/commands/config";
import { writeCommand } from "@/commands/write";
import { TUIStartupError } from "@/domain/errors";
import { UniversalLayer } from "@/runtime";
import { startTUI } from "@/tui/app";
import { version } from "../package.json";

const command = Command.make("jot", {}, () =>
    Effect.tryPromise({
        try: () => startTUI(),
        catch: (error) => new TUIStartupError({ cause: error, message: `Failed to start TUI: ${error}` }),
    }),
).pipe(
    Command.withSubcommands([writeCommand, configCommand, antigravityCommand]),
    Command.withDescription("AI Research Assistant CLI"),
);

const cli = Command.run(command, {
    name: "jot",
    version: version,
});

const program = cli(process.argv).pipe(Effect.tapErrorCause((cause) => Effect.logError("Application error", cause)));

program.pipe(Effect.provide(UniversalLayer), BunRuntime.runMain({ disablePrettyLogger: true }));
