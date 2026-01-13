import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import type { PendingUserAction } from "@/tui/hooks/useAgent";
import { useTextBuffer } from "@/tui/hooks/useTextBuffer";

interface FeedbackWidgetProps {
    pendingAction: PendingUserAction;
    onApprove: () => void;
    onReject: (comment?: string) => void;
    focused: boolean;
}

export const FeedbackWidget = ({ pendingAction, onApprove, onReject, focused }: FeedbackWidgetProps) => {
    const [rejectMode, setRejectMode] = useState(false);
    const buffer = useTextBuffer("");

    useKeyboard((key) => {
        if (!focused) return;

        if (!rejectMode) {
            if (key.name === "y") onApprove();
            else if (key.name === "n") setRejectMode(true);
        } else {
            if (key.name === "return") {
                onReject(buffer.text);
                setRejectMode(false);
                buffer.clear();
            } else if (key.name === "escape") {
                setRejectMode(false);
                buffer.clear();
            } else if (key.name === "backspace") {
                buffer.deleteBack();
            } else if (key.name === "left") {
                buffer.moveLeft();
            } else if (key.name === "right") {
                buffer.moveRight();
            } else if (key.name === "space") {
                buffer.insert(" ");
            } else if (key.name?.length === 1 && !key.ctrl && !key.meta) {
                const char = key.sequence && key.sequence.length === 1 ? key.sequence : key.name;
                if (char && char.length === 1) buffer.insert(char);
            }
        }
    });

    const renderInput = () => {
        const text = buffer.text;
        const cursor = buffer.cursor;
        const before = text.slice(0, cursor);
        const cursorChar = text[cursor] || " ";
        const after = text.slice(cursor + 1);

        return (
            <text>
                {before}
                <span style={{ bg: "white", fg: "black" }}>{cursorChar}</span>
                {after}
            </text>
        );
    };

    return (
        <box
            style={{
                marginTop: 1,
                borderStyle: "rounded",
                borderColor: focused ? "green" : "magenta",
                flexDirection: "column",
                padding: 1,
            }}
        >
            <text style={{ marginBottom: 1 }}>
                <strong fg={focused ? "green" : "magenta"}>
                    {focused ? "▶ USER ACTION REQUIRED" : "USER ACTION REQUIRED (Press Tab to Focus)"}
                </strong>
            </text>

            <text>
                Cycle {pendingAction.cycle}: The agent has proposed changes to {pendingAction.diffs.length} file(s).
            </text>

            <box style={{ marginTop: 1 }}>
                {rejectMode ? (
                    <box style={{ flexDirection: "column", width: "100%" }}>
                        <text fg="yellow" style={{ marginBottom: 1 }}>
                            Please describe required changes:
                        </text>
                        <box
                            style={{
                                borderStyle: "single",
                                borderColor: "yellow",
                                padding: 1,
                                width: "100%",
                            }}
                        >
                            {renderInput()}
                        </box>
                        <text fg="gray" style={{ marginTop: 1 }}>
                            [Enter] Submit [Esc] Cancel
                        </text>
                    </box>
                ) : (
                    <box style={{ flexDirection: "column" }}>
                        <text>
                            <strong fg="green">[y] Approve & Apply</strong>
                        </text>
                        <text>
                            <strong fg="red">[n] Reject & Request Changes</strong>
                        </text>
                    </box>
                )}
            </box>
        </box>
    );
};
