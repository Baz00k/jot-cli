import { Data } from "effect";

export class ConfigReadError extends Data.TaggedError("ConfigReadError")<{
    readonly cause: unknown;
}> {}

export class ConfigWriteError extends Data.TaggedError("ConfigWriteError")<{
    readonly cause: unknown;
}> {}

export class UserCancel extends Data.TaggedError("UserCancel") {}

export class PromptReadError extends Data.TaggedError("PromptReadError")<{
    readonly cause: unknown;
    readonly message?: string;
}> {}

export class AgentError extends Data.TaggedError("AgentError")<{
    readonly cause: unknown;
    readonly message?: string;
}> {}

export class AgentStreamError extends Data.TaggedError("AgentStreamError")<{
    readonly cause: unknown;
    readonly message?: string;
}> {}

export class FileReadError extends Data.TaggedError("FileReadError")<{
    readonly cause: unknown;
    readonly message?: string;
}> {}

export class FileWriteError extends Data.TaggedError("FileWriteError")<{
    readonly cause: unknown;
    readonly message?: string;
}> {}

export class MaxIterationsReached extends Data.TaggedError("MaxIterationsReached")<{
    readonly iterations: number;
    readonly lastDraft?: string;
}> {}

export class AgentLoopError extends Data.TaggedError("AgentLoopError")<{
    readonly cause: unknown;
    readonly message?: string;
    readonly phase: "drafting" | "reviewing" | "user_feedback" | "editing";
}> {}

export class NoUserActionPending extends Data.TaggedError("NoUserActionPending")<{
    readonly message?: string;
}> {}
