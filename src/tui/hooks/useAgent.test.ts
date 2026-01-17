import { describe, expect, test } from "bun:test";
import { type AgentAction, agentReducer, initialAgentState } from "@/tui/hooks/useAgent";

describe("Agent Reducer State Isolation", () => {
    test("multiple reducer calls maintain separate state", () => {
        const action1: AgentAction = { type: "START", sessionId: "session-1" };
        const action2: AgentAction = { type: "START", sessionId: "session-2" };

        const state1 = agentReducer(initialAgentState, action1);
        const state2 = agentReducer(initialAgentState, action2);

        expect(state1.sessionId).toBe("session-1");
        expect(state2.sessionId).toBe("session-2");
        expect(state1).not.toBe(state2);
    });

    test("reducer correctly updates phase", () => {
        const actions: AgentAction[] = [{ type: "START", sessionId: "test-session" }, { type: "CANCEL" }];

        let state = initialAgentState;
        for (const action of actions) {
            state = agentReducer(state, action);
        }

        expect(state.phase).toBe("cancelled");
        expect(state.sessionId).toBe("test-session");
    });

    test("reducer correctly resets state", () => {
        const startAction: AgentAction = { type: "START", sessionId: "test" };
        const resetAction: AgentAction = { type: "RESET" };

        let state = agentReducer(initialAgentState, startAction);
        expect(state.phase).toBe("initializing");

        state = agentReducer(state, resetAction);
        expect(state.phase).toBe("idle");
        expect(state.sessionId).toBeNull();
    });

    test("reducer handles error state", () => {
        const errorAction: AgentAction = {
            type: "ERROR",
            error: { message: "Test error", canRetry: true },
        };

        const state = agentReducer(initialAgentState, errorAction);

        expect(state.phase).toBe("failed");
        expect(state.error?.message).toBe("Test error");
        expect(state.error?.canRetry).toBe(true);
    });
});
