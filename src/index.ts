#!/usr/bin/env bun
import { Command } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { authCommand } from "@/commands/auth";
import { configCommand } from "@/commands/config";
import { writeCommand } from "@/commands/write";
import { Agent } from "@/services/agent";
import { Config } from "@/services/config";
import { AppLogger } from "@/services/logger";
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

const MainLayer = Layer.mergeAll(Agent.Default, Config.Default, AppLogger).pipe(Layer.provideMerge(BunContext.layer));

program.pipe(Effect.provide(MainLayer), BunRuntime.runMain({ disablePrettyLogger: true }));
