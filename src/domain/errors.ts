import { Data } from "effect";

export class ConfigReadError extends Data.TaggedError("ConfigReadError")<{
    readonly cause: unknown;
}> {}

export class ConfigWriteError extends Data.TaggedError("ConfigWriteError")<{
    readonly cause: unknown;
}> {}

export class ConfigDirError extends Data.TaggedError("ConfigDirError")<{
    readonly cause?: unknown;
}> {}

export class UserCancel extends Data.TaggedError("UserCancel") {}

export class PromptReadError extends Data.TaggedError("PromptReadError")<{
    readonly cause: unknown;
    readonly message?: string;
}> {}
