import { useKeyboard } from "@opentui/react";
import { Effect } from "effect";
import { readFromClipboard } from "@/services/clipboard";
import { useEffectRuntime } from "@/tui/context/EffectContext";
import { useTheme } from "@/tui/context/ThemeContext";
import { useTextBuffer } from "@/tui/hooks/useTextBuffer";
import { Keymap } from "@/tui/keyboard/keymap";

export interface TaskInputProps {
    onTaskSubmit: (task: string) => void;
    isRunning: boolean;
    focused: boolean;
}

export const TaskInput = ({ onTaskSubmit, isRunning, focused }: TaskInputProps) => {
    const runtime = useEffectRuntime();
    const buffer = useTextBuffer("");
    const { theme } = useTheme();

    useKeyboard((key) => {
        if (!focused || isRunning) return;

        if (key.name === Keymap.TaskInput.Submit.name) {
            if (key.ctrl || key.meta) {
                buffer.insert("\n");
            } else {
                if (buffer.text.trim()) {
                    onTaskSubmit(buffer.text);
                    buffer.clear();
                }
            }
        } else if ((key.ctrl || key.meta) && key.name === Keymap.TaskInput.Paste.name) {
            runtime
                .runPromise(
                    readFromClipboard().pipe(
                        Effect.tapError(Effect.logError),
                        Effect.catchAll(() => Effect.succeed("")),
                    ),
                )
                .then((text) => buffer.insert(text));
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
                    <span style={{ bg: theme.textColor, fg: theme.backgroundColor }}>
                        {cursorChar === "\n" ? " " : cursorChar}
                    </span>
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
                borderColor: focused ? theme.primaryColor : theme.borderColor,
                flexDirection: "column",
                minHeight: 4,
            }}
        >
            <box style={{ flexGrow: 1, flexDirection: "row", flexWrap: "wrap", padding: 1 }}>
                {!buffer.text && !focused ? (
                    <text fg={theme.mutedColor}>
                        Enter your writing task here... ({Keymap.TaskInput.NewLine.label} for newline)
                    </text>
                ) : (
                    renderContent()
                )}
            </box>

            <box style={{ padding: 1 }}>
                <text fg={theme.mutedColor}>
                    {isRunning
                        ? "Running agent..."
                        : `${Keymap.TaskInput.Submit.label}: Submit | ${Keymap.TaskInput.NewLine.label}: New Line | ${Keymap.Global.Cancel.label}: Cancel`}
                </text>
            </box>
        </box>
    );
};
