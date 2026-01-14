import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Chunk, Effect, Layer, Option, Ref, Stream } from "effect";
import type { MaxIterationsReached } from "@/domain/errors";
import type { FilePatch } from "@/domain/vfs";
import { Agent, type AgentEvent } from "@/services/agent";
import { TestConfigLayer } from "@/services/config";
import { TestLLM, TestLLMLayer } from "@/services/llm";
import { TestAppLogger } from "@/services/logger";
import { TestPromptsLayer } from "@/services/prompts";
import { Session, SessionData, TestSessionLayer } from "@/services/session";
import { VFS } from "@/services/vfs";
import { TestWebLayer } from "@/services/web";
import { TestProjectFilesLayer } from "@/test/mocks/project-files";

describe("Agent Service", () => {
    const originalStreamText = TestLLM.streamText;

    beforeEach(() => {
        TestLLM.streamText = originalStreamText;
    });

    const TestLayer = Agent.DefaultWithoutDependencies.pipe(
        Layer.provideMerge(
            Layer.mergeAll(
                TestConfigLayer,
                TestPromptsLayer,
                TestAppLogger,
                TestSessionLayer,
                TestLLMLayer,
                VFS.Default,
                TestWebLayer,
                TestProjectFilesLayer,
            ),
        ),
    );

    test("runs successful workflow (draft -> approve -> edit)", async () => {
        const streamTextMock = mock();

        streamTextMock.mockImplementation(() => Effect.succeed({ content: "Fallback", cost: 0 }));

        streamTextMock.mockImplementationOnce((_params, onChunk) => {
            if (onChunk) onChunk("Draft content");
            return Effect.succeed({ content: "Draft content", cost: 0 });
        });

        streamTextMock.mockImplementationOnce(() =>
            Effect.gen(function* () {
                const vfs = yield* VFS;
                yield* vfs.approve();
                return { content: "Approved", cost: 0 };
            }),
        );

        TestLLM.streamText = streamTextMock;

        const program = Effect.gen(function* () {
            const agent = yield* Agent;
            const runner = yield* agent.run({ prompt: "Do work" });

            const eventsChunk = yield* Stream.runCollect(
                runner.events.pipe(
                    Stream.tap((event: AgentEvent) =>
                        event._tag === "UserActionRequired"
                            ? runner.submitUserAction({ type: "approve" })
                            : Effect.void,
                    ),
                ),
            );

            const result = yield* runner.result;

            expect(result.finalContent).toContain("Applied 0 file(s): ");
            expect(result.iterations).toBe(1);

            const events = Chunk.toReadonlyArray(eventsChunk);
            const phases = events.map((e) => e._tag);
            expect(phases).toContain("DraftComplete");
            expect(phases).toContain("ReviewComplete");
            expect(phases).toContain("UserActionRequired");
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    test("handles rejection loop (draft -> reject -> revise -> approve)", async () => {
        const streamTextMock = mock();
        streamTextMock.mockImplementation(() => Effect.succeed({ content: "Fallback", cost: 0 }));

        streamTextMock.mockImplementationOnce(() => Effect.succeed({ content: "Draft 1", cost: 0 }));
        streamTextMock.mockImplementationOnce(() =>
            Effect.gen(function* () {
                const vfs = yield* VFS;
                yield* vfs.reject();
                return { content: "Rejected", cost: 0 };
            }),
        );

        streamTextMock.mockImplementationOnce(() => Effect.succeed({ content: "Draft 2", cost: 0 }));
        streamTextMock.mockImplementationOnce(() =>
            Effect.gen(function* () {
                const vfs = yield* VFS;
                yield* vfs.approve();
                return { content: "Approved", cost: 0 };
            }),
        );

        TestLLM.streamText = streamTextMock;

        const program = Effect.gen(function* () {
            const agent = yield* Agent;
            const runner = yield* agent.run({ prompt: "Do work" });

            yield* Stream.runCollect(
                runner.events.pipe(
                    Stream.tap((event: AgentEvent) =>
                        event._tag === "UserActionRequired"
                            ? runner.submitUserAction({ type: "approve" })
                            : Effect.void,
                    ),
                ),
            );

            const result = yield* runner.result;
            expect(result.iterations).toBe(2);
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    test("stops at max iterations", async () => {
        const streamTextMock = mock();
        streamTextMock.mockImplementation(() =>
            Effect.gen(function* () {
                const vfs = yield* VFS;
                yield* vfs.reject();
                return { content: "Draft", cost: 0 };
            }),
        );
        TestLLM.streamText = streamTextMock;

        const program = Effect.gen(function* () {
            const agent = yield* Agent;
            const runner = yield* agent.run({ prompt: "Do work", maxIterations: 2 });

            const result = yield* runner.result.pipe(Effect.flip);

            expect(result._tag).toBe("MaxIterationsReached");
            expect((result as MaxIterationsReached).iterations).toBe(3);
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    test("handles user rejection", async () => {
        const streamTextMock = mock();
        streamTextMock.mockImplementation(() => Effect.succeed({ content: "Fallback", cost: 0 }));

        streamTextMock.mockImplementationOnce(() => Effect.succeed({ content: "Draft 1", cost: 0 }));
        streamTextMock.mockImplementationOnce(() =>
            Effect.gen(function* () {
                const vfs = yield* VFS;
                yield* vfs.approve();
                return { content: "Approved", cost: 0 };
            }),
        );

        streamTextMock.mockImplementationOnce(() => Effect.succeed({ content: "Draft 2", cost: 0 }));
        streamTextMock.mockImplementationOnce(() =>
            Effect.gen(function* () {
                const vfs = yield* VFS;
                yield* vfs.approve();
                return { content: "Approved", cost: 0 };
            }),
        );

        TestLLM.streamText = streamTextMock;

        const program = Effect.gen(function* () {
            const agent = yield* Agent;
            const runner = yield* agent.run({ prompt: "Do work" });

            let rejectedOnce = false;

            yield* Stream.runCollect(
                runner.events.pipe(
                    Stream.tap((event: AgentEvent) =>
                        event._tag === "UserActionRequired"
                            ? !rejectedOnce
                                ? Effect.sync(() => {
                                      rejectedOnce = true;
                                  }).pipe(
                                      Effect.andThen(runner.submitUserAction({ type: "reject", comment: "Try again" })),
                                  )
                                : runner.submitUserAction({ type: "approve" })
                            : Effect.void,
                    ),
                ),
            );

            const result = yield* runner.result;
            expect(result.iterations).toBe(2);
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    test("getCurrentState returns draft and iteration info", async () => {
        const streamTextMock = mock();
        streamTextMock.mockImplementation(() => Effect.succeed({ content: "Fallback", cost: 0 }));

        streamTextMock.mockImplementationOnce(() => Effect.succeed({ content: "Draft 1", cost: 0 }));
        streamTextMock.mockImplementationOnce(() =>
            Effect.gen(function* () {
                const vfs = yield* VFS;
                yield* vfs.approve();
                return { content: "Approved", cost: 0 };
            }),
        );
        TestLLM.streamText = streamTextMock;

        const program = Effect.gen(function* () {
            const agent = yield* Agent;
            const runner = yield* agent.run({ prompt: "Do work" });

            const stateRef = yield* Ref.make<{ cycle: number; totalCost: number } | undefined>(undefined);

            yield* Stream.runCollect(
                runner.events.pipe(
                    Stream.tap((event: AgentEvent) =>
                        Effect.gen(function* () {
                            if (event._tag === "DraftComplete") {
                                const current = yield* Ref.get(stateRef);
                                if (!current) {
                                    const state = yield* runner.getCurrentState();
                                    yield* Ref.set(stateRef, state);
                                }
                            }
                            if (event._tag === "UserActionRequired") {
                                yield* runner.submitUserAction({ type: "approve" });
                            }
                        }),
                    ),
                ),
            );

            yield* runner.result;

            const capturedState = yield* Ref.get(stateRef);
            expect(capturedState).toBeTruthy();
            expect(capturedState?.cycle).toBe(1);
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    test("resumes session and skips vfs reset if cycle > 1", async () => {
        const streamTextMock = mock();
        streamTextMock.mockImplementation(() => Effect.succeed({ content: "Resumed content", cost: 0 }));
        TestLLM.streamText = streamTextMock;

        const vfsResetMock = mock(() => Effect.void);

        const MockVFSLayer = Layer.succeed(VFS, {
            reset: vfsResetMock,
            writeFile: () => Effect.void,
            editFile: () => Effect.void,
            getSummary: () => Effect.succeed({ files: [], fileCount: 0, commentCount: 0 }),
            getDiffs: () => Effect.succeed(Chunk.empty<FilePatch>()),
            getComments: () => Effect.succeed(Chunk.empty()),
            getDecision: () => Effect.succeed(Option.none()),
            flush: () => Effect.succeed([]),
            readFile: () => Effect.fail(new Error("Not implemented")),
            addComment: () => Effect.void,
            approve: () => Effect.void,
            reject: () => Effect.void,
            getFileDiff: () => Effect.dieMessage("Not implemented"),
            listFiles: () => Effect.succeed([]),
            readDirectory: () => Effect.succeed([]),
        } as unknown as typeof VFS.Service);

        const sessionMock = {
            create: mock(),
            resume: mock(() =>
                Effect.succeed({
                    id: "test-session",
                    path: "/tmp/test-session.json",
                    addEntry: () => Effect.void,
                    addAgentEvent: () => Effect.void,
                    addToolCall: () => Effect.void,
                    updateStatus: () => Effect.void,
                    addCost: () => Effect.void,
                    getTotalCost: () => Effect.succeed(0),
                    getToolCalls: () => Effect.succeed([]),
                    updateIterations: () => Effect.void,
                    getIterations: () => Effect.succeed(1),
                    flush: () => Effect.void,
                    close: () => Effect.void,
                }),
            ),
            list: mock(),
            get: mock(() =>
                Effect.succeed(
                    new SessionData({
                        id: "test-session",
                        modelWriter: "gpt-4",
                        modelReviewer: "claude-3",
                        reasoning: true,
                        reasoningEffort: "high",
                        maxIterations: 5,
                        startedAt: Date.now(),
                        updatedAt: Date.now(),
                        iterations: 1,
                        totalCost: 0,
                        status: "running",
                        entries: [
                            {
                                _tag: "UserInput",
                                prompt: "Test prompt",
                                timestamp: Date.now(),
                            },
                            {
                                _tag: "ToolCall",
                                name: "write_file",
                                input: { filePath: "/test.txt", content: "hello" },
                                output: "ok",
                                timestamp: Date.now(),
                            },
                        ],
                    }),
                ),
            ),
            getSessionsDir: mock(),
        } as unknown as typeof Session.Service;

        const TestLayerWithResume = Agent.DefaultWithoutDependencies.pipe(
            Layer.provideMerge(
                Layer.mergeAll(
                    TestConfigLayer,
                    TestPromptsLayer,
                    TestAppLogger,
                    Layer.succeed(Session, sessionMock),
                    TestLLMLayer,
                    MockVFSLayer,
                    TestWebLayer,
                    TestProjectFilesLayer,
                ),
            ),
        );

        const program = Effect.gen(function* () {
            const agent = yield* Agent;
            const runner = yield* agent.run({ sessionId: "test-session", maxIterations: 2 });

            yield* Stream.runDrain(runner.events);
            yield* runner.result.pipe(Effect.ignore);
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayerWithResume)));

        expect(vfsResetMock).not.toHaveBeenCalled();
    });
});
