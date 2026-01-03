import { Effect, Fiber, type ManagedRuntime, Stream } from "effect";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { Agent, type AgentEvent, type RunOptions, type RunResult, type UserAction } from "@/services/agent";
import type { Config } from "@/services/config";

export type AgentPhase =
    | "idle"
    | "initializing"
    | "drafting"
    | "reviewing"
    | "awaiting-user"
    | "editing"
    | "completed"
    | "failed"
    | "cancelled";

export interface TimelineEntry {
    readonly id: string;
    readonly timestamp: number;
    readonly event: AgentEvent;
    readonly cycle: number;
}

export interface PendingUserAction {
    readonly draft: string;
    readonly cycle: number;
}

export interface AgentState {
    readonly phase: AgentPhase;
    readonly cycle: number;
    readonly timeline: readonly TimelineEntry[];
    readonly streamBuffer: string;
    readonly streamPhase: "drafting" | "reviewing" | "editing" | null;
    readonly currentDraft: string | null;
    readonly pendingAction: PendingUserAction | null;
    readonly result: RunResult | null;
    readonly error: {
        readonly message: string;
        readonly phase?: string;
        readonly canRetry: boolean;
        readonly lastDraft?: string;
    } | null;
    readonly totalCost: number;
    readonly sessionId: string | null;
}

export const initialAgentState: AgentState = {
    phase: "idle",
    cycle: 0,
    timeline: [],
    streamBuffer: "",
    streamPhase: null,
    currentDraft: null,
    pendingAction: null,
    result: null,
    error: null,
    totalCost: 0,
    sessionId: null,
};

export interface UseAgentOptions {
    onComplete?: (result: RunResult) => void;
    onError?: (error: AgentState["error"]) => void;
}

export interface UseAgentReturn {
    readonly state: AgentState;
    readonly start: (options: RunOptions) => void;
    readonly submitAction: (action: UserAction) => void;
    readonly cancel: () => void;
    readonly reset: () => void;
    readonly isRunning: boolean;
    readonly canSubmitAction: boolean;
    readonly hasError: boolean;
}

type AgentAction =
    | { type: "START"; sessionId: string }
    | { type: "EVENT"; event: AgentEvent }
    | { type: "COMPLETE"; result: RunResult }
    | { type: "ERROR"; error: AgentState["error"] }
    | { type: "CANCEL" }
    | { type: "RESET" };

function inferPhaseFromProgress(message: string): AgentPhase {
    const msg = message.toLowerCase();
    if (msg.includes("drafting")) return "drafting";
    if (msg.includes("reviewing")) return "reviewing";
    if (msg.includes("editing") || msg.includes("applying")) return "editing";
    if (msg.includes("starting")) return "initializing";
    return "drafting";
}

function handleAgentEvent(state: AgentState, event: AgentEvent): AgentState {
    const entry: TimelineEntry = {
        id: `${Date.now()}-${event._tag}-${Math.random()}`,
        timestamp: Date.now(),
        event,
        cycle: "cycle" in event ? event.cycle : state.cycle,
    };

    const timeline = [...state.timeline, entry];

    switch (event._tag) {
        case "Progress":
            return {
                ...state,
                timeline,
                cycle: event.cycle,
                phase: inferPhaseFromProgress(event.message),
                streamBuffer: "",
            };

        case "StreamChunk":
            return {
                ...state,
                streamBuffer: state.streamBuffer + event.content,
                streamPhase: event.phase,
                phase: event.phase,
            };

        case "DraftComplete":
            return {
                ...state,
                timeline,
                currentDraft: event.content,
                streamBuffer: "",
                streamPhase: null,
            };

        case "ReviewComplete":
            return {
                ...state,
                timeline,
                phase: event.approved ? "awaiting-user" : "drafting",
            };

        case "UserActionRequired":
            return {
                ...state,
                timeline,
                phase: "awaiting-user",
                pendingAction: { draft: event.draft, cycle: event.cycle },
            };

        case "IterationLimitReached":
            return {
                ...state,
                timeline,
                phase: "failed",
                error: {
                    message: `Maximum iterations (${event.iterations}) reached`,
                    canRetry: false,
                    lastDraft: event.lastDraft,
                },
            };

        case "ToolCall":
            return {
                ...state,
                timeline,
            };
    }
}

function agentReducer(state: AgentState, action: AgentAction): AgentState {
    switch (action.type) {
        case "START":
            return {
                ...initialAgentState,
                phase: "initializing",
                sessionId: action.sessionId,
            };

        case "EVENT":
            return handleAgentEvent(state, action.event);

        case "COMPLETE":
            return {
                ...state,
                phase: "completed",
                result: action.result,
                totalCost: action.result.totalCost,
            };

        case "ERROR":
            return {
                ...state,
                phase: "failed",
                error: action.error,
            };

        case "CANCEL":
            return { ...state, phase: "cancelled" };

        case "RESET":
            return initialAgentState;

        default:
            return state;
    }
}

function mapErrorToState(error: unknown): AgentState["error"] {
    const message = error instanceof Error ? error.message : String(error);
    return {
        message,
        canRetry: true,
    };
}

export function useAgent(
    runtime: ManagedRuntime.ManagedRuntime<Agent | Config, unknown>,
    options: UseAgentOptions = {},
): UseAgentReturn {
    const [state, dispatch] = useReducer(agentReducer, initialAgentState);

    const sessionRef = useRef<{
        submitUserAction: (action: UserAction) => Effect.Effect<void, unknown>;
        cancel: () => Effect.Effect<void>;
        fiber: Fiber.RuntimeFiber<void, unknown> | null;
    } | null>(null);

    useEffect(() => {
        return () => {
            if (sessionRef.current) {
                void runtime.runPromise(sessionRef.current.cancel());
            }
        };
    }, [runtime]);

    const start = useCallback(
        (runOptions: RunOptions) => {
            const program = Effect.gen(function* () {
                const agent = yield* Agent;
                const session = yield* agent.run(runOptions);

                dispatch({ type: "START", sessionId: session.sessionId });

                sessionRef.current = {
                    submitUserAction: session.submitUserAction,
                    cancel: session.cancel,
                    fiber: null,
                };

                const eventFiber = yield* session.events.pipe(
                    Stream.runForEach((event) => Effect.sync(() => dispatch({ type: "EVENT", event }))),
                    Effect.fork,
                );

                if (sessionRef.current) {
                    sessionRef.current.fiber = eventFiber;
                }

                const result = yield* session.result;

                yield* Fiber.join(eventFiber);

                dispatch({ type: "COMPLETE", result });
                if (options.onComplete) {
                    options.onComplete(result);
                }

                return result;
            }).pipe(
                Effect.catchAll((error) => {
                    const errorState = mapErrorToState(error);
                    dispatch({ type: "ERROR", error: errorState });
                    if (options.onError) {
                        options.onError(errorState);
                    }
                    return Effect.void;
                }),
            );

            try {
                void runtime.runPromise(program);
            } catch (error) {
                const errorState = mapErrorToState(error);
                dispatch({ type: "ERROR", error: errorState });
                if (options.onError) {
                    options.onError(errorState);
                }
            }
        },
        [runtime, options.onComplete, options.onError],
    );

    const submitAction = useCallback(
        (action: UserAction) => {
            if (!sessionRef.current || state.phase !== "awaiting-user") return;

            runtime.runPromise(sessionRef.current.submitUserAction(action)).catch((error) => {
                console.error("Failed to submit action:", error);
                dispatch({ type: "ERROR", error: mapErrorToState(error) });
            });

            dispatch({
                type: "EVENT",
                event: {
                    _tag: "Progress",
                    message: action.type === "approve" ? "Applying changes..." : "Revising...",
                    cycle: state.cycle,
                },
            });
        },
        [runtime, state.phase, state.cycle],
    );

    const cancel = useCallback(() => {
        if (!sessionRef.current) return;

        runtime
            .runPromise(sessionRef.current.cancel())
            .then(() => dispatch({ type: "CANCEL" }))
            .catch((error) => {
                console.error("Failed to cancel:", error);
                dispatch({ type: "CANCEL" });
            });
    }, [runtime]);

    const reset = useCallback(() => {
        sessionRef.current = null;
        dispatch({ type: "RESET" });
    }, []);

    return {
        state,
        start,
        submitAction,
        cancel,
        reset,
        isRunning: !["idle", "completed", "failed", "cancelled"].includes(state.phase),
        canSubmitAction: state.phase === "awaiting-user" && state.pendingAction !== null,
        hasError: state.error !== null,
    };
}
