#!/usr/bin/env bun
import { Command } from "@effect/cli";
import { BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import { authCommand } from "@/commands/auth";
import { configCommand } from "@/commands/config";
import { writeCommand } from "@/commands/write";
import { UniversalLayer } from "@/runtime";
import { startTUI } from "@/tui/app";
import { version } from "../package.json";

const command = Command.make("jot").pipe(
    Command.withDescription("AI Research Assistant CLI"),
    Command.withSubcommands([configCommand, writeCommand, authCommand]),
);

const cli = Command.run(command, {
    name: "jot",
    version: version,
});

const program = Effect.gen(function* () {
    // Check if no subcommand was provided
    const args = process.argv.slice(2);

    if (args.length === 0) {
        // Launch TUI when no arguments provided
        yield* Effect.tryPromise({
            try: () => startTUI(),
            catch: (error) => new Error(`Failed to start TUI: ${error}`),
        });
    } else {
        // Run normal CLI with arguments
        yield* Effect.suspend(() => cli(process.argv));
    }
}).pipe(Effect.tapErrorCause((cause) => Effect.logError("Application error", cause)));

program.pipe(Effect.provide(UniversalLayer), BunRuntime.runMain({ disablePrettyLogger: true }));
