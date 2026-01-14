import { FileSystem } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { Effect, Fiber, Layer, Ref, Schema } from "effect";
import { DIR_NAME } from "@/domain/constants";
import type { UserDirError } from "@/domain/errors";
import type { AgentEvent } from "@/services/agent";
import { UserDirs } from "@/services/user-dirs";

const UserInput = Schema.TaggedStruct("UserInput", {
    prompt: Schema.String,
});
const AgentEventEntry = Schema.TaggedStruct("AgentEvent", {
    event: Schema.Unknown,
});
const ToolCall = Schema.TaggedStruct("ToolCall", {
    name: Schema.String,
    input: Schema.Unknown,
    output: Schema.Unknown,
});
const ModelResponse = Schema.TaggedStruct("ModelResponse", {
    phase: Schema.Literal("drafting", "reviewing", "editing"),
    content: Schema.String,
    cost: Schema.Number,
});
const ErrorEntry = Schema.TaggedStruct("Error", {
    message: Schema.String,
    phase: Schema.optional(Schema.String),
});

const SessionEntryBase = Schema.Union(UserInput, AgentEventEntry, ToolCall, ModelResponse, ErrorEntry);
export type SessionEntryInput = Schema.Schema.Type<typeof SessionEntryBase>;

// Full entry schema with timestamp - used for storage
const withTimestamp = <T extends Schema.Struct.Fields>(s: Schema.Struct<T>) =>
    Schema.Struct({ ...s.fields, timestamp: Schema.Number });

export const SessionEntry = Schema.Union(
    UserInput.pipe(withTimestamp),
    AgentEventEntry.pipe(withTimestamp),
    ToolCall.pipe(withTimestamp),
    ModelResponse.pipe(withTimestamp),
    ErrorEntry.pipe(withTimestamp),
);
export type SessionEntry = Schema.Schema.Type<typeof SessionEntry>;

export class SessionData extends Schema.Class<SessionData>("SessionData")({
    id: Schema.String,
    modelWriter: Schema.String,
    modelReviewer: Schema.String,
    reasoning: Schema.Boolean,
    reasoningEffort: Schema.Literal("low", "medium", "high"),
    maxIterations: Schema.Number,
    startedAt: Schema.Number,
    updatedAt: Schema.Number,
    completedAt: Schema.optional(Schema.Number),
    iterations: Schema.Number,
    totalCost: Schema.Number,
    status: Schema.Literal("running", "completed", "failed", "cancelled"),
    entries: Schema.Array(SessionEntry),
    finalContent: Schema.optional(Schema.String),
}) {}

const generateSessionId = (): string => {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, -1);
    const random = Math.random().toString(36).substring(2, 8);
    return `session-${timestamp}-${random}`;
};

export interface SessionConfig {
    readonly prompt: string;
    readonly modelWriter: string;
    readonly modelReviewer: string;
    readonly reasoning: boolean;
    readonly reasoningEffort: "low" | "medium" | "high";
    readonly maxIterations: number;
}

export interface SessionHandle {
    readonly id: string;
    readonly path: string;
    readonly addEntry: (entry: SessionEntryInput) => Effect.Effect<void>;
    readonly addAgentEvent: (event: AgentEvent) => Effect.Effect<void>;
    readonly addToolCall: (name: string, input: unknown, output: unknown) => Effect.Effect<void>;
    readonly updateStatus: (
        status: "running" | "completed" | "failed" | "cancelled",
        finalContent?: string,
    ) => Effect.Effect<void>;
    readonly addCost: (cost: number) => Effect.Effect<void>;
    readonly getTotalCost: () => Effect.Effect<number>;
    readonly getToolCalls: () => Effect.Effect<Array<{ name: string; input: unknown; output: unknown }>>;
    readonly updateIterations: (iterations: number) => Effect.Effect<void>;
    readonly getIterations: () => Effect.Effect<number>;
    readonly flush: () => Effect.Effect<void>;
    readonly close: () => Effect.Effect<void>;
}

const SAVE_INTERVAL_MS = 500;

export class Session extends Effect.Service<Session>()("services/session", {
    effect: Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const userDirs = yield* UserDirs;
        const sessionsDir = yield* userDirs.getPath("data", DIR_NAME.SESSIONS);

        yield* fs
            .makeDirectory(sessionsDir, { recursive: true })
            .pipe(Effect.catchAll((error) => Effect.logWarning(`Failed to create sessions directory: ${error}`)));

        yield* Effect.logDebug(`Sessions directory: ${sessionsDir}`);

        return {
            create: (config: SessionConfig): Effect.Effect<SessionHandle, UserDirError> =>
                Effect.gen(function* () {
                    const id = generateSessionId();
                    const sessionPath = yield* userDirs.getPath("data", DIR_NAME.SESSIONS, `${id}.json`);
                    const now = Date.now();

                    const initialData = new SessionData({
                        id,
                        modelWriter: config.modelWriter,
                        modelReviewer: config.modelReviewer,
                        reasoning: config.reasoning,
                        reasoningEffort: config.reasoningEffort,
                        maxIterations: config.maxIterations,
                        startedAt: now,
                        updatedAt: now,
                        iterations: 0,
                        totalCost: 0,
                        status: "running",
                        entries: [
                            {
                                _tag: "UserInput",
                                prompt: config.prompt,
                                timestamp: now,
                            },
                        ],
                    });

                    const stateRef = yield* Ref.make(initialData);
                    const dirtyRef = yield* Ref.make(true);

                    const doSave = Effect.gen(function* () {
                        const isDirty = yield* Ref.getAndSet(dirtyRef, false);
                        if (!isDirty) return;

                        const data = yield* Ref.get(stateRef);
                        yield* fs
                            .writeFileString(sessionPath, JSON.stringify(data, null, 2))
                            .pipe(Effect.catchAll((error) => Effect.logWarning(`Session save failed: ${error}`)));
                    }).pipe(Effect.uninterruptible);

                    const backgroundSaver = Effect.forever(
                        Effect.sleep(`${SAVE_INTERVAL_MS} millis`).pipe(Effect.zipRight(doSave)),
                    );

                    const saverFiber = yield* Effect.forkDaemon(backgroundSaver);

                    const markDirty = Ref.set(dirtyRef, true);

                    const updateState = (f: (data: SessionData) => SessionData): Effect.Effect<void> =>
                        Ref.update(stateRef, f).pipe(Effect.zipRight(markDirty));

                    yield* Effect.logDebug(`Created session: ${id}`);

                    const flush = Effect.gen(function* () {
                        yield* Ref.set(dirtyRef, true);
                        yield* doSave;
                    });

                    const close = Effect.gen(function* () {
                        yield* Fiber.interrupt(saverFiber);
                        yield* flush;
                    });

                    const handle: SessionHandle = {
                        id,
                        path: sessionPath,

                        addEntry: (entry) =>
                            updateState((data) => {
                                const timestamp = Date.now();
                                const fullEntry = { ...entry, timestamp } as SessionEntry;
                                return new SessionData({
                                    ...data,
                                    updatedAt: timestamp,
                                    entries: [...data.entries, fullEntry],
                                });
                            }),

                        addAgentEvent: (event) =>
                            updateState((data) => {
                                const timestamp = Date.now();
                                return new SessionData({
                                    ...data,
                                    updatedAt: timestamp,
                                    entries: [...data.entries, { _tag: "AgentEvent", event, timestamp }],
                                });
                            }),

                        addToolCall: (name, input, output) =>
                            updateState((data) => {
                                const timestamp = Date.now();
                                return new SessionData({
                                    ...data,
                                    updatedAt: timestamp,
                                    entries: [...data.entries, { _tag: "ToolCall", name, input, output, timestamp }],
                                });
                            }),

                        updateStatus: (status, finalContent) =>
                            updateState((data) => {
                                const now = Date.now();
                                return new SessionData({
                                    ...data,
                                    status,
                                    updatedAt: now,
                                    completedAt: status !== "running" ? now : data.completedAt,
                                    finalContent: finalContent ?? data.finalContent,
                                });
                            }),

                        addCost: (cost) =>
                            updateState(
                                (data) =>
                                    new SessionData({
                                        ...data,
                                        totalCost: data.totalCost + cost,
                                        updatedAt: Date.now(),
                                    }),
                            ),

                        getTotalCost: () => Ref.get(stateRef).pipe(Effect.map((d) => d.totalCost)),

                        getToolCalls: () =>
                            Ref.get(stateRef).pipe(
                                Effect.map((d) =>
                                    d.entries
                                        .filter((e) => e._tag === "ToolCall")
                                        .map((e) => ({ name: e.name, input: e.input, output: e.output })),
                                ),
                            ),

                        updateIterations: (iterations) =>
                            updateState(
                                (data) =>
                                    new SessionData({
                                        ...data,
                                        iterations,
                                        updatedAt: Date.now(),
                                    }),
                            ),

                        getIterations: () => Ref.get(stateRef).pipe(Effect.map((d) => d.iterations)),

                        flush: () => flush,
                        close: () => close,
                    };

                    return handle;
                }),

            resume: (id: string): Effect.Effect<SessionHandle, UserDirError | Error> =>
                Effect.gen(function* () {
                    const sessionPath = yield* userDirs.getPath("data", DIR_NAME.SESSIONS, `${id}.json`);
                    const json = yield* fs
                        .readFileString(sessionPath)
                        .pipe(
                            Effect.catchAll((error) => Effect.fail(new Error(`Failed to read session file: ${error}`))),
                        );
                    const initialData = yield* Effect.try(() => JSON.parse(json)).pipe(
                        Effect.flatMap(Schema.decodeUnknown(SessionData)),
                        Effect.catchAll((error) => Effect.fail(new Error(`Failed to parse session data: ${error}`))),
                    );

                    const dataWithRunningStatus = new SessionData({
                        ...initialData,
                        status: "running",
                    });

                    const stateRef = yield* Ref.make(dataWithRunningStatus);
                    const dirtyRef = yield* Ref.make(false);

                    const doSave = Effect.gen(function* () {
                        const isDirty = yield* Ref.getAndSet(dirtyRef, false);
                        if (!isDirty) return;

                        const data = yield* Ref.get(stateRef);
                        yield* fs
                            .writeFileString(sessionPath, JSON.stringify(data, null, 2))
                            .pipe(Effect.catchAll((error) => Effect.logWarning(`Session save failed: ${error}`)));
                    }).pipe(Effect.uninterruptible);

                    const backgroundSaver = Effect.forever(
                        Effect.sleep(`${SAVE_INTERVAL_MS} millis`).pipe(Effect.zipRight(doSave)),
                    );

                    const saverFiber = yield* Effect.forkDaemon(backgroundSaver);

                    const markDirty = Ref.set(dirtyRef, true);

                    const updateState = (f: (data: SessionData) => SessionData): Effect.Effect<void> =>
                        Ref.update(stateRef, f).pipe(Effect.zipRight(markDirty));

                    const flush = Effect.gen(function* () {
                        yield* Ref.set(dirtyRef, true);
                        yield* doSave;
                    });

                    const close = Effect.gen(function* () {
                        yield* Fiber.interrupt(saverFiber);
                        yield* flush;
                    });

                    const handle: SessionHandle = {
                        id,
                        path: sessionPath,

                        addEntry: (entry) =>
                            updateState((data) => {
                                const timestamp = Date.now();
                                const fullEntry = { ...entry, timestamp } as SessionEntry;
                                return new SessionData({
                                    ...data,
                                    updatedAt: timestamp,
                                    entries: [...data.entries, fullEntry],
                                });
                            }),

                        addAgentEvent: (event) =>
                            updateState((data) => {
                                const timestamp = Date.now();
                                return new SessionData({
                                    ...data,
                                    updatedAt: timestamp,
                                    entries: [...data.entries, { _tag: "AgentEvent", event, timestamp }],
                                });
                            }),

                        addToolCall: (name, input, output) =>
                            updateState((data) => {
                                const timestamp = Date.now();
                                return new SessionData({
                                    ...data,
                                    updatedAt: timestamp,
                                    entries: [...data.entries, { _tag: "ToolCall", name, input, output, timestamp }],
                                });
                            }),

                        updateStatus: (status, finalContent) =>
                            updateState((data) => {
                                const now = Date.now();
                                return new SessionData({
                                    ...data,
                                    status,
                                    updatedAt: now,
                                    completedAt: status !== "running" ? now : data.completedAt,
                                    finalContent: finalContent ?? data.finalContent,
                                });
                            }),

                        addCost: (cost) =>
                            updateState(
                                (data) =>
                                    new SessionData({
                                        ...data,
                                        totalCost: data.totalCost + cost,
                                        updatedAt: Date.now(),
                                    }),
                            ),

                        getTotalCost: () => Ref.get(stateRef).pipe(Effect.map((d) => d.totalCost)),

                        getToolCalls: () =>
                            Ref.get(stateRef).pipe(
                                Effect.map((d) =>
                                    d.entries
                                        .filter((e) => e._tag === "ToolCall")
                                        .map((e) => ({ name: e.name, input: e.input, output: e.output })),
                                ),
                            ),

                        updateIterations: (iterations) =>
                            updateState(
                                (data) =>
                                    new SessionData({
                                        ...data,
                                        iterations,
                                        updatedAt: Date.now(),
                                    }),
                            ),

                        getIterations: () => Ref.get(stateRef).pipe(Effect.map((d) => d.iterations)),

                        flush: () => flush,
                        close: () => close,
                    };

                    yield* Effect.logDebug(`Resumed session: ${id}`);
                    return handle;
                }),

            list: () =>
                Effect.gen(function* () {
                    const files = yield* fs.readDirectory(sessionsDir).pipe(
                        Effect.map((entries) => entries.filter((e) => e.endsWith(".json"))),
                        Effect.catchAll(() => Effect.succeed([] as string[])),
                    );

                    const sessions: SessionData[] = [];

                    for (const file of files) {
                        const filePath = yield* userDirs.getPath("data", DIR_NAME.SESSIONS, file);
                        const content = yield* fs.readFileString(filePath).pipe(
                            Effect.flatMap((json) => Effect.try(() => JSON.parse(json))),
                            Effect.flatMap(Schema.decodeUnknown(SessionData)),
                            Effect.catchAll(() => Effect.succeed(null)),
                        );
                        if (content) {
                            sessions.push(content);
                        }
                    }

                    return sessions.sort((a, b) => b.startedAt - a.startedAt);
                }),

            get: (id: string) =>
                Effect.gen(function* () {
                    const sessionPath = yield* userDirs.getPath("data", DIR_NAME.SESSIONS, `${id}.json`);
                    const content = yield* fs.readFileString(sessionPath).pipe(
                        Effect.flatMap((json) => Effect.try(() => JSON.parse(json))),
                        Effect.flatMap(Schema.decodeUnknown(SessionData)),
                        Effect.catchAll(() => Effect.succeed(null)),
                    );
                    return content;
                }),

            getSessionsDir: () => Effect.succeed(sessionsDir),
        };
    }),
    dependencies: [BunContext.layer, UserDirs.Default],
    accessors: true,
}) {}

export const TestSession = new Session({
    create: () =>
        Effect.gen(function* () {
            const iterationsRef = yield* Ref.make(0);
            return {
                id: "test-session",
                path: "/tmp/test-session.json",
                addEntry: (_entry) => Effect.void,
                addAgentEvent: (_event) => Effect.void,
                addToolCall: (_name, _input, _output) => Effect.void,
                updateStatus: (_status, _finalContent) => Effect.void,
                addCost: (_cost) => Effect.void,
                getTotalCost: () => Effect.succeed(0),
                getToolCalls: () => Effect.succeed([]),
                updateIterations: (i) => Ref.set(iterationsRef, i),
                getIterations: () => Ref.get(iterationsRef),
                flush: () => Effect.void,
                close: () => Effect.void,
            };
        }),
    list: () => Effect.succeed([]),
    get: () => Effect.succeed(null),
    getSessionsDir: () => Effect.succeed("/tmp/sessions"),
    resume: () =>
        Effect.gen(function* () {
            const iterationsRef = yield* Ref.make(0);
            return {
                id: "test-session",
                path: "/tmp/test-session.json",
                addEntry: (_entry) => Effect.void,
                addAgentEvent: (_event) => Effect.void,
                addToolCall: (_name, _input, _output) => Effect.void,
                updateStatus: (_status, _finalContent) => Effect.void,
                addCost: (_cost) => Effect.void,
                getTotalCost: () => Effect.succeed(0),
                getToolCalls: () => Effect.succeed([]),
                updateIterations: (i) => Ref.set(iterationsRef, i),
                getIterations: () => Ref.get(iterationsRef),
                flush: () => Effect.void,
                close: () => Effect.void,
            };
        }),
});

export const TestSessionLayer = Layer.succeed(Session, TestSession);
