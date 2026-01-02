import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { useState } from "react";
import { ActivityPanel } from "@/tui/components/ActivityPanel";
import { StatusBar } from "@/tui/components/StatusBar";
import { TaskInput } from "@/tui/components/TaskInput";
import { useAgentSimulation, useKeyboardShortcuts } from "@/tui/hooks";

function App() {
    const [prompt, setPrompt] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [events, setEvents] = useState<string[]>([]);

    const { startAgent, reset } = useAgentSimulation({
        isRunning,
        setIsRunning,
        setEvents,
    });

    useKeyboardShortcuts({
        onExit: () => process.exit(0),
        onSubmit: () => prompt.trim() && startAgent(),
        onReset: reset,
        isRunning,
    });

    const handleTaskSubmit = (task: string) => {
        setPrompt(task);
        startAgent();
    };

    return (
        <box style={{ width: "100%", height: "100%", flexDirection: "column" }}>
            <box style={{ border: true, justifyContent: "center", alignItems: "center" }}>
                <text>Jot CLI - AI Research Assistant</text>
            </box>

            <box style={{ flexGrow: 1, flexDirection: "row" }}>
                <TaskInput onTaskSubmit={handleTaskSubmit} isRunning={isRunning} />
                <ActivityPanel events={events} isRunning={isRunning} />
            </box>

            <StatusBar isRunning={isRunning} />
        </box>
    );
}

export async function startTUI() {
    const renderer = await createCliRenderer({
        exitOnCtrlC: false,
    });

    createRoot(renderer).render(<App />);

    renderer.setTerminalTitle("Jot CLI");
    renderer.start();
}
