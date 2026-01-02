import { useKeyboard } from "@opentui/react";
import { useState } from "react";

export const TaskInput = ({
    onTaskSubmit,
    isRunning,
}: {
    onTaskSubmit: (task: string) => void;
    isRunning: boolean;
}) => {
    const [task, _setTask] = useState("");

    useKeyboard((key) => {
        if (!isRunning && key.name === "return" && task.trim()) {
            onTaskSubmit(task);
        }
    });

    return (
        <box style={{ width: "50%", border: true, flexDirection: "column" }}>
            <text>Task Input</text>

            <box style={{ flexGrow: 1 }}>
                <textarea focused={!isRunning} placeholder="Enter your writing task here..." />
            </box>

            <box>
                <text>{isRunning ? "Running agent..." : "Press Enter to start, R to reset"}</text>
            </box>
        </box>
    );
};
