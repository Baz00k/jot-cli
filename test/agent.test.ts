import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Chunk, Effect, Layer, Logger, LogLevel, Stream } from "effect";
import type { MaxIterationsReached } from "@/domain/errors";
import { Agent } from "@/services/agent";
import { Config } from "@/services/config";
import { Prompts } from "@/services/prompts";

// Local definition matching the service's return type for tasks
interface MockPromptTask {
    render: (input: unknown) => string;
    system: string;
}

// Mocks
const mockStreamText = mock();
const mockGenerateObject = mock();

mock.module("ai", () => ({
    streamText: mockStreamText,
    generateObject: mockGenerateObject,
    jsonSchema: (s: unknown) => s,
    stepCountIs: () => undefined,
}));

mock.module("@openrouter/ai-sdk-provider", () => ({
    createOpenRouter: () => () => ({}),
}));

const createMockStream = (content: string) => ({
    textStream: (async function* () {
        yield content;
    })(),
    text: Promise.resolve(content),
});

describe("Agent Service", () => {
    beforeEach(() => {
        mockStreamText.mockReset();
        mockGenerateObject.mockReset();
    });

    const TestConfigLayer = Layer.succeed(
        Config,
        Config.of({
            get: Effect.succeed({
                openRouterApiKey: "test-key",
                agentMaxIterations: 5,
                writerModel: "writer",
                reviewerModel: "reviewer",
                reasoning: true,
                reasoningEffort: "medium",
            }),
        } as unknown as Config),
    );

    const mockPromptTask = {
        render: () => "prompt",
        system: "system",
    } as unknown as MockPromptTask;

    const TestPromptsLayer = Layer.succeed(
        Prompts,
        Prompts.of({
            get: (_type: unknown) => Effect.succeed("raw prompt"),
            getWriterTask: Effect.succeed(mockPromptTask),
            getReviewerTask: Effect.succeed(mockPromptTask),
            getEditorTask: Effect.succeed(mockPromptTask),
        } as unknown as Prompts),
    );

    const TestLayer = Layer.mergeAll(TestConfigLayer, TestPromptsLayer).pipe(Layer.provideMerge(Agent.Default));

    test("runs successful workflow (draft -> approve -> edit)", async () => {
        // 1. Drafting
        mockStreamText.mockReturnValueOnce(createMockStream("Draft content"));

        // 2. Reviewing (Approved)
        mockGenerateObject.mockReturnValueOnce({
            object: { approved: true, critique: "Good", reasoning: "Ok" },
        });

        // 3. Editing
        mockStreamText.mockReturnValueOnce(createMockStream("Editing output"));

        const program = Effect.gen(function* () {
            const agent = yield* Agent;
            const runner = yield* agent.run({ prompt: "Do work" });

            // Collect events and handle user action
            const eventsChunk = yield* Stream.runCollect(
                runner.events.pipe(
                    Stream.tap((event) =>
                        Effect.gen(function* () {
                            if (event._tag === "UserActionRequired") {
                                yield* runner.submitUserAction({ type: "approve" });
                            }
                        }),
                    ),
                ),
            );

            const result = yield* runner.result;

            expect(result.finalContent).toBe("Draft content");
            expect(result.iterations).toBe(1);

            // Verify phases
            const events = Chunk.toReadonlyArray(eventsChunk);
            const phases = events.map((e) => e._tag);
            expect(phases).toContain("DraftComplete");
            expect(phases).toContain("ReviewComplete");
            expect(phases).toContain("UserActionRequired");
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer), Logger.withMinimumLogLevel(LogLevel.None)));
    });

    test("handles rejection loop (draft -> reject -> revise -> approve)", async () => {
        // 1. Initial Draft
        mockStreamText.mockReturnValueOnce(createMockStream("Draft 1"));

        // 2. Review (Rejected)
        mockGenerateObject.mockReturnValueOnce({
            object: { approved: false, critique: "Bad", reasoning: "Fix it" },
        });

        // 3. Revised Draft
        mockStreamText.mockReturnValueOnce(createMockStream("Draft 2"));

        // 4. Review (Approved)
        mockGenerateObject.mockReturnValueOnce({
            object: { approved: true, critique: "Good", reasoning: "Better" },
        });

        // 5. Editing
        mockStreamText.mockReturnValueOnce(createMockStream("Editing output"));

        const program = Effect.gen(function* () {
            const agent = yield* Agent;
            const runner = yield* agent.run({ prompt: "Do work" });

            const _events = yield* Stream.runCollect(
                runner.events.pipe(
                    Stream.tap((event) =>
                        Effect.gen(function* () {
                            if (event._tag === "UserActionRequired") {
                                yield* runner.submitUserAction({ type: "approve" });
                            }
                        }),
                    ),
                ),
            );

            const result = yield* runner.result;

            expect(result.finalContent).toBe("Draft 2");
            expect(result.iterations).toBe(2);
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer), Logger.withMinimumLogLevel(LogLevel.None)));
    });

    test("stops at max iterations", async () => {
        // Setup infinite rejection loop
        mockStreamText.mockReturnValue(createMockStream("Draft"));
        mockGenerateObject.mockReturnValue({
            object: { approved: false, critique: "Bad", reasoning: "Never ends" },
        });

        const program = Effect.gen(function* () {
            const agent = yield* Agent;
            // Set max iterations to 2 via options
            const runner = yield* agent.run({ prompt: "Do work", maxIterations: 2 });

            // We expect it to fail with MaxIterationsReached
            const result = yield* runner.result.pipe(Effect.flip);

            expect(result._tag).toBe("MaxIterationsReached");
            expect((result as MaxIterationsReached).iterations).toBe(2);
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer), Logger.withMinimumLogLevel(LogLevel.None)));
    });

    test("handles user rejection", async () => {
        // 1. Draft 1
        mockStreamText.mockReturnValueOnce(createMockStream("Draft 1"));
        // 2. Review 1 (Approved)
        mockGenerateObject.mockReturnValueOnce({
            object: { approved: true, critique: "Good", reasoning: "Ok" },
        });

        // 3. Draft 2 (Revision after user reject)
        mockStreamText.mockReturnValueOnce(createMockStream("Draft 2"));
        // 4. Review 2 (Approved)
        mockGenerateObject.mockReturnValueOnce({
            object: { approved: true, critique: "Good", reasoning: "Ok" },
        });
        // 5. Editing
        mockStreamText.mockReturnValueOnce(createMockStream("Editing"));

        const program = Effect.gen(function* () {
            const agent = yield* Agent;
            const runner = yield* agent.run({ prompt: "Do work" });

            let rejectedOnce = false;

            yield* Stream.runCollect(
                runner.events.pipe(
                    Stream.tap((event) =>
                        Effect.gen(function* () {
                            if (event._tag === "UserActionRequired") {
                                if (!rejectedOnce) {
                                    rejectedOnce = true;
                                    yield* runner.submitUserAction({ type: "reject", comment: "Try again" });
                                } else {
                                    yield* runner.submitUserAction({ type: "approve" });
                                }
                            }
                        }),
                    ),
                ),
            );

            const result = yield* runner.result;
            expect(result.finalContent).toBe("Draft 2");
            expect(result.iterations).toBe(2);
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer), Logger.withMinimumLogLevel(LogLevel.None)));
    });
});
