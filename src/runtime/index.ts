import { BunContext } from "@effect/platform-bun";
import { Layer, type ManagedRuntime } from "effect";
import { Agent } from "@/services/agent";
import { Clipboard } from "@/services/clipboard";
import { Config } from "@/services/config";
import { LLM } from "@/services/llm";
import { AppLogger } from "@/services/logger";
import { ProjectFiles } from "@/services/project-files";
import { Prompts } from "@/services/prompts";
import { Session } from "@/services/session";
import { UserDirs } from "@/services/user-dirs";
import { Web } from "@/services/web";

export const UniversalLayer = Layer.mergeAll(
    Agent.Default,
    Config.Default,
    LLM.Default,
    AppLogger,
    ProjectFiles.Default,
    Prompts.Default,
    Session.Default,
    UserDirs.Default,
    Web.Default,
    Clipboard.Default,
).pipe(Layer.provideMerge(BunContext.layer));

export type UniversalServices =
    | Agent
    | Config
    | LLM
    | ProjectFiles
    | Prompts
    | Session
    | UserDirs
    | Web
    | Clipboard
    | BunContext.BunContext;

export type UniversalRuntime = ManagedRuntime.ManagedRuntime<UniversalServices, unknown>;
