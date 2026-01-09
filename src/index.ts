#!/usr/bin/env bun
import { antigravityCommand } from "@/commands/antigravity";
import { authCommand } from "@/commands/antigravity/auth";
import { configCommand } from "@/commands/config";
import { writeCommand } from "@/commands/write";
import { TUIStartupError } from "@/domain/errors";
import { UniversalLayer } from "@/runtime";
import { startTUI } from "@/tui/app";
import { Command } from "@effect/cli";
import { BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import { version } from "../package.json";

const command = Command.make("jot").pipe(
    Command.withDescription("AI Research Assistant CLI"),
    Command.withSubcommands([configCommand, writeCommand, authCommand, antigravityCommand]),
);

const cli = Command.run(command, {
    name: "jot",
    version: version,
});

const program = Effect.gen(function* () {
    const args = process.argv;

    if (args.length <= 2) {
        // Launch TUI when no arguments provided
        yield* Effect.tryPromise({
            try: () => startTUI(),
            catch: (error) => new TUIStartupError({ cause: error, message: `Failed to start TUI: ${error}` }),
        });
    } else {
        // Run normal CLI with arguments
        yield* cli(args);
    }
}).pipe(Effect.tapErrorCause((cause) => Effect.logError("Application error", cause)));

program.pipe(Effect.provide(UniversalLayer), BunRuntime.runMain({ disablePrettyLogger: true }));
