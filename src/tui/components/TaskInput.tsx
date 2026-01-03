import { useKeyboard } from "@opentui/react";
import { useTextBuffer } from "@/tui/hooks/useTextBuffer";

export interface TaskInputProps {
    onTaskSubmit: (task: string) => void;
    isRunning: boolean;
    focused: boolean;
}

export const TaskInput = ({ onTaskSubmit, isRunning, focused }: TaskInputProps) => {
    const buffer = useTextBuffer("");

    useKeyboard((key) => {
        if (!focused || isRunning) return;

        if (key.name === "return") {
            if (key.name === "return" && (key.ctrl || key.meta)) {
                buffer.insert("\n");
            } else {
                if (buffer.text.trim()) {
                    onTaskSubmit(buffer.text);
                    buffer.clear();
                }
            }
        } else if (key.name === "backspace") {
            buffer.deleteBack();
        } else if (key.name === "left") {
            buffer.moveLeft();
        } else if (key.name === "right") {
            buffer.moveRight();
        } else if (key.name === "up") {
            buffer.moveUp();
        } else if (key.name === "down") {
            buffer.moveDown();
        } else if (key.name === "space") {
            buffer.insert(" ");
        } else if (key.name?.length === 1 || (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta)) {
            const char = key.sequence && key.sequence.length === 1 ? key.sequence : key.name;
            if (char && char.length === 1) {
                buffer.insert(char);
            }
        }
    });

    const renderContent = () => {
        const text = buffer.text;
        const cursor = buffer.cursor;

        const before = text.slice(0, cursor);
        const cursorChar = text[cursor] || " ";
        const after = text.slice(cursor + 1);

        return (
            <text>
                {before}
                {focused && !isRunning ? (
                    <span style={{ bg: "white", fg: "black" }}>{cursorChar === "\n" ? " " : cursorChar}</span>
                ) : (
                    cursorChar
                )}
                {cursorChar === "\n" ? "\n" : ""}
                {after}
            </text>
        );
    };

    return (
        <box
            style={{
                width: "100%",
                border: true,
                borderColor: focused ? "cyan" : "gray",
                flexDirection: "column",
                padding: 1,
            }}
        >
            <box style={{ flexGrow: 1, flexDirection: "row", flexWrap: "wrap" }}>
                {!buffer.text && !focused ? (
                    <text fg="gray">Enter your writing task here... (Ctrl+Enter for newline)</text>
                ) : (
                    renderContent()
                )}
            </box>

            <box style={{ marginTop: 0 }}>
                <text fg="gray">
                    {isRunning ? "Running agent..." : "Enter: Submit | Ctrl+Enter: New Line | Esc: Cancel"}
                </text>
            </box>
        </box>
    );
};
