import type { KeyBinding, PasteEvent, TextareaRenderable } from "@opentui/core";
import { useEffect, useRef } from "react";
import { useTheme } from "@/tui/context/ThemeContext";
import { Keymap } from "@/tui/keyboard/keymap";

export interface TaskInputProps {
    onTaskSubmit: (task: string) => void;
    isRunning: boolean;
    focused: boolean;
}

const keyBindings: KeyBinding[] = [
    {
        name: Keymap.TaskInput.Submit.name,
        ctrl: false,
        action: "submit",
    },
    {
        name: Keymap.TaskInput.NewLine.name,
        ctrl: true,
        action: "newline",
    },
    {
        name: "backspace",
        ctrl: true,
        action: "delete-word-backward",
    },
    {
        name: "left",
        ctrl: true,
        action: "word-backward",
    },
    {
        name: "right",
        ctrl: true,
        action: "word-forward",
    },
];

export const TaskInput = ({ onTaskSubmit, isRunning, focused }: TaskInputProps) => {
    const { theme } = useTheme();
    const inputRef = useRef<TextareaRenderable>(null);

    useEffect(() => {
        if (focused && inputRef.current) {
            inputRef.current.focus();
        }
    }, [focused]);

    const handleSubmit = () => {
        const text = inputRef.current?.plainText || "";
        if (text?.trim()) {
            onTaskSubmit(text);
            if (inputRef.current) {
                inputRef.current.clear();
                inputRef.current.focus();
            }
        }
    };

    const handlePaste = (event: PasteEvent) => {
        if (!focused) return event.preventDefault();

        const text = event.text.trim();
        inputRef.current?.insertText(text);
    };

    return (
        <box
            style={{
                width: "100%",
                border: true,
                borderColor: focused ? theme.primaryColor : theme.borderColor,
                flexDirection: "column",
                paddingBottom: 1,
            }}
        >
            <textarea
                ref={inputRef}
                placeholder={`Enter your writing task here... (${Keymap.TaskInput.NewLine.label} for newline)`}
                focused={focused}
                keyBindings={keyBindings}
                onSubmit={handleSubmit}
                onPaste={handlePaste}
                style={{
                    textColor: theme.textColor,
                    focusedTextColor: theme.textColor,
                    cursorColor: theme.primaryColor,
                    minHeight: 3,
                    maxHeight: 10,
                }}
            />
            <text fg={theme.mutedColor}>
                {isRunning
                    ? "Running agent..."
                    : `${Keymap.TaskInput.Submit.label}: Submit | ${Keymap.TaskInput.NewLine.label}: New Line | ${Keymap.Global.Cancel.label}: Cancel`}
            </text>
        </box>
    );
};
