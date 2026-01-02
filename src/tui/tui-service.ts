import { Effect, Fiber, Option, Stream } from "effect";
import type { RunResult } from "@/services/agent";
import { Agent, type AgentEvent } from "@/services/agent";
import { Config } from "@/services/config";

export interface TUIState {
    prompt: string;
    isRunning: boolean;
    events: AgentEvent[];
    finalResult: Option.Option<RunResult>;
    error: Option.Option<Error>;
}

export const initialTUIState: TUIState = {
    prompt: "",
    isRunning: false,
    events: [],
    finalResult: Option.none(),
    error: Option.none(),
};

export interface TUIServiceInstance {
    state: TUIState;
    setPrompt: (prompt: string) => void;
    startAgent: Effect.Effect<RunResult, Error>;
    reset: () => void;
}

export const TUIService = Effect.Service<TUIServiceInstance>()("TUIService", {
    effect: Effect.gen(function* () {
        const agent = yield* Agent;
        const config = yield* Config;

        const state = initialTUIState;

        return {
            state,

            setPrompt: (prompt: string) => {
                state.prompt = prompt;
            },

            startAgent: Effect.gen(function* () {
                state.isRunning = true;
                state.events = [];
                state.finalResult = Option.none();
                state.error = Option.none();

                const userConfig = yield* config.get;
                const apiKey = userConfig.openRouterApiKey;

                if (!apiKey) {
                    return yield* Effect.fail(new Error("API key not configured"));
                }

                const agentSession = yield* agent.run({
                    prompt: state.prompt,
                    modelWriter: userConfig.writerModel ?? "google/gemini-3-pro-preview",
                    modelReviewer: userConfig.reviewerModel ?? "google/gemini-3-pro-preview",
                    reasoningEffort: userConfig.reasoningEffort ?? "high",
                    reasoning: userConfig.reasoning ?? true,
                    maxIterations: userConfig.agentMaxIterations ?? 10,
                });

                const processEvent = (event: AgentEvent) =>
                    Effect.sync(() => {
                        state.events.push(event);
                    });

                const eventProcessor = yield* agentSession.events.pipe(Stream.runForEach(processEvent), Effect.fork);

                const result = yield* agentSession.result;

                yield* Fiber.join(eventProcessor);
                state.finalResult = Option.some(result);
                state.isRunning = false;

                return result;
            }).pipe(
                Effect.catchAll((error) => {
                    state.error = Option.some(error as Error);
                    state.isRunning = false;
                    return Effect.fail(error);
                }),
            ),

            reset: () => {
                Object.assign(state, initialTUIState);
            },
        };
    }),
});
