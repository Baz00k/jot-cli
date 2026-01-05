import { ErrorBoundary } from "@/tui/components/ErrorBoundary";
import { StatusBar } from "@/tui/components/StatusBar";
import { AgentProvider, useAgentContext } from "@/tui/context/AgentContext";
import { EffectProvider } from "@/tui/context/EffectContext";
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { StrictMode, useState } from "react";
import { TaskInput } from "./components/TaskInput";
import { Timeline } from "./components/Timeline";

function AgentWorkflow() {
    const { state, start, submitAction, cancel } = useAgentContext();

    const [activeFocus, setActiveFocus] = useState<"input" | "timeline">("input");

    useKeyboard((key) => {
        if (key.name === "tab") {
            setActiveFocus((prev) => (prev === "input" ? "timeline" : "input"));
        }
        if (state.phase === "awaiting-user" && activeFocus !== "timeline") {
            setActiveFocus("timeline");
        }
        if (key.name === "escape" && state.phase !== "idle") {
            cancel();
        }
    });

    const handleTaskSubmit = (task: string) => {
        start({ prompt: task });
    };

    const handleApprove = () => {
        submitAction({ type: "approve" });
        setActiveFocus("input");
    };

    const handleReject = (comment?: string) => {
        submitAction({ type: "reject", comment });
        setActiveFocus("timeline");
    };

    const isInputDisabled =
        state.phase !== "idle" &&
        state.phase !== "completed" &&
        state.phase !== "failed" &&
        state.phase !== "cancelled";

    return (
        <box style={{ width: "100%", height: "100%", flexDirection: "column" }}>
            <Timeline focused={activeFocus === "timeline"} onApprove={handleApprove} onReject={handleReject} />

            <TaskInput onTaskSubmit={handleTaskSubmit} isRunning={isInputDisabled} focused={activeFocus === "input"} />

            <StatusBar isRunning={state.phase !== "idle" && state.phase !== "completed"} />
        </box>
    );
}

function App() {
    return (
        // @ts-expect-error ErrorBoundary component type mismatch with opentui JSX
        <ErrorBoundary>
            <EffectProvider>
                <AgentProvider>
                    <AgentWorkflow />
                </AgentProvider>
            </EffectProvider>
        </ErrorBoundary>
    );
}

export async function startTUI() {
    const renderer = await createCliRenderer({
        exitOnCtrlC: false,
    });

    createRoot(renderer).render(
        <StrictMode>
            <App />
        </StrictMode>,
    );

    renderer.setTerminalTitle("Jot CLI");
    renderer.start();
}
