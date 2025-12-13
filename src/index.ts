#!/usr/bin/env bun
import { Command } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import { configCommand } from "@/commands/config";
import { writeCommand } from "@/commands/write";
import { version } from "../package.json";

const command = Command.make("jot").pipe(
    Command.withDescription("AI Research Assistant CLI"),
    Command.withSubcommands([configCommand, writeCommand]),
);

const cli = Command.run(command, {
    name: "jot",
    version: version,
});

const program = Effect.suspend(() => cli(process.argv));

program.pipe(Effect.provide(BunContext.layer), BunRuntime.runMain);
