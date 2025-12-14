#!/usr/bin/env bun
import { Command } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { configCommand } from "@/commands/config";
import { writeCommand } from "@/commands/write";
import { Agent } from "@/services/agent";
import { Config } from "@/services/config";
import { Prompts } from "@/services/prompts";
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

const MainLayer = Layer.mergeAll(Agent.Default, Config.Default, Prompts.Default, BunContext.layer);

program.pipe(Effect.provide(MainLayer), BunRuntime.runMain);
