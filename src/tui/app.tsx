import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { useState } from "react";

function App() {
    const [prompt, setPrompt] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [events, setEvents] = useState<string[]>([]);

    useKeyboard((key) => {
        if (key.name === "escape") {
            process.exit(0);
        }

        if (!isRunning) {
            if (key.name === "return") {
                handleStartAgent();
            } else if (key.name === "r") {
                handleReset();
            }
        }
    });

    const handleStartAgent = () => {
        if (!prompt.trim() || isRunning) return;

        setIsRunning(true);
        setEvents([]);

        // For now, simulate the agent workflow
        // In the future, this will connect to the actual agent service
        const simulateEvents = [
            "Starting agent...",
            "Reading project files...",
            "Generating draft...",
            "Draft complete",
            "Reviewing content...",
            "Review approved",
            "Finalizing result...",
            "Done!",
        ];

        simulateEvents.forEach((event, index) => {
            setTimeout(
                () => {
                    setEvents((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${event}`]);
                    if (index === simulateEvents.length - 1) {
                        setIsRunning(false);
                    }
                },
                (index + 1) * 1000,
            );
        });
    };

    const handleReset = () => {
        if (isRunning) return;

        setPrompt("");
        setEvents([]);
        setIsRunning(false);
    };

    return (
        <box style={{ width: "100%", height: "100%", flexDirection: "column" }}>
            <box style={{ border: true, justifyContent: "center", alignItems: "center" }}>
                <text>Jot CLI - AI Research Assistant</text>
            </box>

            <box style={{ flexGrow: 1, flexDirection: "row" }}>
                <box style={{ width: "50%", border: true, flexDirection: "column" }}>
                    <text>Task Input</text>

                    <box style={{ flexGrow: 1 }}>
                        <textarea focused placeholder="Enter your writing task here..." />
                    </box>

                    <box>
                        <text>{isRunning ? "Running agent..." : "Press Enter to start, R to reset"}</text>
                    </box>
                </box>

                <box style={{ width: "50%", border: true, flexDirection: "column" }}>
                    <text>Agent Activity</text>

                    <scrollbox style={{ flexGrow: 1 }}>
                        {events.map((event, index) => (
                            <box key={`${index}-${event.slice(0, 20)}`}>
                                <text>{event}</text>
                            </box>
                        ))}

                        {isRunning && <text>Agent is working...</text>}
                    </scrollbox>
                </box>
            </box>

            <box
                style={{
                    border: true,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <text>Press ESC to exit</text>
                <text>{isRunning ? "Status: Running" : "Status: Ready"}</text>
            </box>
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
