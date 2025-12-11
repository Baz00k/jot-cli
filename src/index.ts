#!/usr/bin/env bun
import { Command } from "commander";
import { ManagedRuntime } from "effect";
import { version } from "../package.json";
import { configCommand } from "./commands/config.js";
import { writeCommand } from "./commands/write.js";
import { ConfigLive } from "./services/ConfigService.js";

const program = new Command();

program.name("jot").description("AI Research Assistant CLI").version(version);

program.addCommand(configCommand);
program.addCommand(writeCommand);

const runtime = ManagedRuntime.make(ConfigLive);

declare global {
    var configRuntime: typeof runtime;
}

globalThis.configRuntime = runtime;

program.parse();
