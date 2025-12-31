import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Chunk, Effect, Layer, Ref, Stream } from "effect";
import type { MaxIterationsReached } from "@/domain/errors";
import { Agent } from "@/services/agent";
import { TestConfigLayer } from "@/services/config";
import { LLM } from "@/services/llm";
import { TestAppLogger } from "@/services/logger";
import { TestPromptsLayer } from "@/services/prompts";
import { TestSessionLayer } from "@/services/session";

const mockStreamText = mock();
const mockGenerateObject = mock();
const mockGenerateText = mock();

mock.module("ai", () => ({
    streamText: mockStreamText,
    generateObject: mockGenerateObject,
    generateText: mockGenerateText,
    jsonSchema: (s: unknown) => s,
    Output: { object: (s: unknown) => s },
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
    providerMetadata: Promise.resolve({}),
});

describe("Agent Service", () => {
    beforeEach(() => {
        mockStreamText.mockReset();
        mockGenerateObject.mockReset();
        mockGenerateText.mockReset();
    });

    const TestLayer = Agent.DefaultWithoutDependencies.pipe(
        Layer.provideMerge(
            Layer.mergeAll(TestConfigLayer, TestPromptsLayer, TestAppLogger, TestSessionLayer, LLM.Default),
        ),
    );

    test("runs successful workflow (draft -> approve -> edit)", async () => {
        mockStreamText.mockReturnValueOnce(createMockStream("Draft content"));

        mockGenerateText.mockReturnValueOnce({
            output: { approved: true, critique: "Good", reasoning: "Ok" },
            providerMetadata: {},
        });

        mockStreamText.mockReturnValueOnce(createMockStream("Editing output"));

        const program = Effect.gen(function* () {
            const agent = yield* Agent;
            const runner = yield* agent.run({ prompt: "Do work" });

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

            const events = Chunk.toReadonlyArray(eventsChunk);
            const phases = events.map((e) => e._tag);
            expect(phases).toContain("DraftComplete");
            expect(phases).toContain("ReviewComplete");
            expect(phases).toContain("UserActionRequired");
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    test("handles rejection loop (draft -> reject -> revise -> approve)", async () => {
        mockStreamText.mockReturnValueOnce(createMockStream("Draft 1"));

        mockGenerateText.mockReturnValueOnce({
            output: { approved: false, critique: "Bad", reasoning: "Fix it" },
            providerMetadata: {},
        });

        mockStreamText.mockReturnValueOnce(createMockStream("Draft 2"));

        mockGenerateText.mockReturnValueOnce({
            output: { approved: true, critique: "Good", reasoning: "Better" },
            providerMetadata: {},
        });

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

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    test("stops at max iterations", async () => {
        mockStreamText.mockImplementation(() => createMockStream("Draft"));
        mockGenerateText.mockReturnValue({
            output: { approved: false, critique: "Bad", reasoning: "Never ends" },
            providerMetadata: {},
        });

        const program = Effect.gen(function* () {
            const agent = yield* Agent;
            const runner = yield* agent.run({ prompt: "Do work", maxIterations: 2 });

            const result = yield* runner.result.pipe(Effect.flip);

            expect(result._tag).toBe("MaxIterationsReached");
            expect((result as MaxIterationsReached).iterations).toBe(2);
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    test("handles user rejection", async () => {
        mockStreamText.mockReturnValueOnce(createMockStream("Draft 1"));
        mockGenerateText.mockReturnValueOnce({
            output: { approved: true, critique: "Good", reasoning: "Ok" },
            providerMetadata: {},
        });

        mockStreamText.mockReturnValueOnce(createMockStream("Draft 2"));
        mockGenerateText.mockReturnValueOnce({
            output: { approved: true, critique: "Good", reasoning: "Ok" },
            providerMetadata: {},
        });
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

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    test("getCurrentState returns draft and iteration info", async () => {
        mockStreamText.mockReturnValueOnce(createMockStream("Draft content"));
        mockGenerateText.mockReturnValueOnce({
            output: { approved: false, critique: "Bad", reasoning: "Try again" },
            providerMetadata: {},
        });
        mockStreamText.mockReturnValueOnce(createMockStream("Draft 2"));
        mockGenerateText.mockReturnValueOnce({
            output: { approved: true, critique: "Good", reasoning: "Ok" },
            providerMetadata: {},
        });
        mockStreamText.mockReturnValueOnce(createMockStream("Edit"));

        const program = Effect.gen(function* () {
            const agent = yield* Agent;
            const runner = yield* agent.run({ prompt: "Do work" });

            const stateRef = yield* Ref.make<
                Effect.Effect.Success<ReturnType<typeof runner.getCurrentState>> | undefined
            >(undefined);

            yield* Stream.runCollect(
                runner.events.pipe(
                    Stream.tap((event) =>
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
            expect(capturedState?.workflowState.iterationCount).toBe(1);
            expect(capturedState?.workflowState.latestDraft).toBeTruthy();
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });
});
