import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { DialogProvider, useDialog, useDialogState } from "@opentui-ui/dialog/react";
import { Effect } from "effect";
import { StrictMode, useState } from "react";
import { copyToClipboard } from "@/services/clipboard";
import { ErrorBoundary } from "@/tui/components/ErrorBoundary";
import { SettingsModal } from "@/tui/components/SettingsModal";
import { StatusBar } from "@/tui/components/StatusBar";
import { AgentProvider, useAgentContext } from "@/tui/context/AgentContext";
import { ConfigProvider } from "@/tui/context/ConfigContext";
import { EffectProvider } from "@/tui/context/EffectContext";
import { RendererProvider } from "@/tui/context/RendererContext";
import { TaskInput } from "./components/TaskInput";
import { Timeline } from "./components/Timeline";

function AgentWorkflow() {
    const { state, start, submitAction, cancel } = useAgentContext();
    const dialog = useDialog();
    const isDialogOpen = useDialogState((s) => s.isOpen);

    const [activeFocus, setActiveFocus] = useState<"input" | "timeline">("input");

    useKeyboard((key) => {
        if (isDialogOpen) return;

        if (key.name === "f2") {
            dialog.prompt({
                content: (ctx) => <SettingsModal {...ctx} />,
                size: "large",
            });
            return;
        }

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

    const isAgentRunning =
        state.phase !== "idle" &&
        state.phase !== "completed" &&
        state.phase !== "failed" &&
        state.phase !== "cancelled";

    return (
        <box style={{ width: "100%", height: "100%", flexDirection: "column" }}>
            <Timeline
                focused={!isDialogOpen && activeFocus === "timeline"}
                onApprove={handleApprove}
                onReject={handleReject}
            />

            <TaskInput
                onTaskSubmit={handleTaskSubmit}
                isRunning={isAgentRunning}
                focused={!isDialogOpen && activeFocus === "input"}
            />

            <StatusBar isRunning={isAgentRunning} disabled={isDialogOpen} />
        </box>
    );
}

function App() {
    return (
        // @ts-expect-error ErrorBoundary component type mismatch with opentui JSX
        <ErrorBoundary>
            <EffectProvider>
                <ConfigProvider>
                    <DialogProvider size="large">
                        <AgentProvider>
                            <StrictMode>
                                <AgentWorkflow />
                            </StrictMode>
                        </AgentProvider>
                    </DialogProvider>
                </ConfigProvider>
            </EffectProvider>
        </ErrorBoundary>
    );
}

export async function startTUI() {
    const renderer = await createCliRenderer({
        exitOnCtrlC: false,
        gatherStats: false,
        consoleOptions: {
            keyBindings: [{ name: "y", ctrl: true, action: "copy-selection" }],
            onCopySelection: (text) => {
                Effect.runPromise(copyToClipboard(text));
            },
        },
    });

    createRoot(renderer).render(
        <RendererProvider value={renderer}>
            <App />
        </RendererProvider>,
    );

    renderer.setTerminalTitle("Jot CLI");
    renderer.start();
}
