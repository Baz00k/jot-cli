#!/usr/bin/env bun
import { Command } from "commander";
import { configCommand } from "./commands/config.js";
import { writeCommand } from "./commands/write.js";

const program = new Command();

program.name("jot").description("AI Research Assistant CLI").version("0.0.2");

program.addCommand(configCommand);
program.addCommand(writeCommand);

program.parse();
