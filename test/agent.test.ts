import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Chunk, Effect, Layer, Ref, Stream } from "effect";
import type { MaxIterationsReached } from "@/domain/errors";
import { Agent } from "@/services/agent";
import { TestConfigLayer } from "@/services/config";
import { TestLLM, TestLLMLayer } from "@/services/llm";
import { TestAppLogger } from "@/services/logger";
import { TestPromptsLayer } from "@/services/prompts";
import { TestSessionLayer } from "@/services/session";

describe("Agent Service", () => {
    const originalStreamText = TestLLM.streamText;
    const originalGenerateObject = TestLLM.generateObject;

    beforeEach(() => {
        TestLLM.streamText = originalStreamText;
        TestLLM.generateObject = originalGenerateObject;
    });

    const TestLayer = Agent.DefaultWithoutDependencies.pipe(
        Layer.provideMerge(
            Layer.mergeAll(TestConfigLayer, TestPromptsLayer, TestAppLogger, TestSessionLayer, TestLLMLayer),
        ),
    );

    test("runs successful workflow (draft -> approve -> edit)", async () => {
        const streamTextMock = mock();

        streamTextMock.mockImplementationOnce((_params, onChunk) => {
            if (onChunk) onChunk("Draft content");
            return Effect.succeed({ content: "Draft content", cost: 0 });
        });

        streamTextMock.mockImplementationOnce((_params, onChunk) => {
            if (onChunk) onChunk("Editing output");
            return Effect.succeed({ content: "Editing output", cost: 0 });
        });

        TestLLM.streamText = streamTextMock;

        TestLLM.generateObject = mock((_: unknown) =>
            Effect.succeed({
                result: { approved: true, critique: "Good", reasoning: "Ok" },
                cost: 0,
            }),
        ) as unknown as typeof TestLLM.generateObject;

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
        const streamTextMock = mock();

        streamTextMock.mockImplementationOnce((_params, onChunk) => {
            if (onChunk) onChunk("Draft 1");
            return Effect.succeed({ content: "Draft 1", cost: 0 });
        });

        streamTextMock.mockImplementationOnce((_params, onChunk) => {
            if (onChunk) onChunk("Draft 2");
            return Effect.succeed({ content: "Draft 2", cost: 0 });
        });

        streamTextMock.mockImplementationOnce((_params, onChunk) => {
            if (onChunk) onChunk("Editing output");
            return Effect.succeed({ content: "Editing output", cost: 0 });
        });

        TestLLM.streamText = streamTextMock;

        const generateObjectMock = mock();
        generateObjectMock.mockImplementationOnce(() =>
            Effect.succeed({
                result: { approved: false, critique: "Bad", reasoning: "Fix it" },
                cost: 0,
            }),
        );
        generateObjectMock.mockImplementationOnce(() =>
            Effect.succeed({
                result: { approved: true, critique: "Good", reasoning: "Better" },
                cost: 0,
            }),
        );

        TestLLM.generateObject = generateObjectMock as unknown as typeof TestLLM.generateObject;

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
        TestLLM.streamText = mock((_params, onChunk) => {
            if (onChunk) onChunk("Draft");
            return Effect.succeed({ content: "Draft", cost: 0 });
        });

        TestLLM.generateObject = mock((_: unknown) =>
            Effect.succeed({
                result: { approved: false, critique: "Bad", reasoning: "Never ends" },
                cost: 0,
            }),
        ) as unknown as typeof TestLLM.generateObject;

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
        const streamTextMock = mock();
        streamTextMock.mockImplementationOnce((_params, onChunk) => {
            if (onChunk) onChunk("Draft 1");
            return Effect.succeed({ content: "Draft 1", cost: 0 });
        });
        streamTextMock.mockImplementationOnce((_params, onChunk) => {
            if (onChunk) onChunk("Draft 2");
            return Effect.succeed({ content: "Draft 2", cost: 0 });
        });
        streamTextMock.mockImplementationOnce((_params, onChunk) => {
            if (onChunk) onChunk("Editing");
            return Effect.succeed({ content: "Editing", cost: 0 });
        });
        TestLLM.streamText = streamTextMock;

        const generateObjectMock = mock();
        generateObjectMock.mockImplementationOnce(() =>
            Effect.succeed({
                result: { approved: true, critique: "Good", reasoning: "Ok" },
                cost: 0,
            }),
        );
        generateObjectMock.mockImplementationOnce(() =>
            Effect.succeed({
                result: { approved: true, critique: "Good", reasoning: "Ok" },
                cost: 0,
            }),
        );
        TestLLM.generateObject = generateObjectMock as unknown as typeof TestLLM.generateObject;

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
        const streamTextMock = mock();
        streamTextMock.mockImplementationOnce((_params, onChunk) => {
            if (onChunk) onChunk("Draft content");
            return Effect.succeed({ content: "Draft content", cost: 0 });
        });
        streamTextMock.mockImplementationOnce((_params, onChunk) => {
            if (onChunk) onChunk("Draft 2");
            return Effect.succeed({ content: "Draft 2", cost: 0 });
        });
        streamTextMock.mockImplementationOnce((_params, onChunk) => {
            if (onChunk) onChunk("Edit");
            return Effect.succeed({ content: "Edit", cost: 0 });
        });
        TestLLM.streamText = streamTextMock;

        const generateObjectMock = mock();
        generateObjectMock.mockImplementationOnce(() =>
            Effect.sleep("100 millis").pipe(
                Effect.andThen(
                    Effect.succeed({
                        result: { approved: false, critique: "Bad", reasoning: "Try again" },
                        cost: 0,
                    }),
                ),
            ),
        );
        generateObjectMock.mockImplementationOnce(() =>
            Effect.succeed({
                result: { approved: true, critique: "Good", reasoning: "Ok" },
                cost: 0,
            }),
        );
        TestLLM.generateObject = generateObjectMock as unknown as typeof TestLLM.generateObject;

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
