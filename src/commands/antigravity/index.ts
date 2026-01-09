import { Command } from "@effect/cli";
import { authCommand } from "./auth";
import { quotaCommand } from "./quota";

export const antigravityCommand = Command.make("antigravity").pipe(
    Command.withDescription("Manage antigravity provider configuration"),
    Command.withSubcommands([quotaCommand, authCommand]),
);
