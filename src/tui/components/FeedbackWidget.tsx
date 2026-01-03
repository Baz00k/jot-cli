import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import type { PendingUserAction } from "@/tui/hooks/useAgent";

interface FeedbackWidgetProps {
    pendingAction: PendingUserAction;
    onApprove: () => void;
    onReject: (comment?: string) => void;
    focused: boolean;
}

export const FeedbackWidget = ({ pendingAction, onApprove, onReject, focused }: FeedbackWidgetProps) => {
    const [rejectMode, setRejectMode] = useState(false);
    const [comment, setComment] = useState("");

    useKeyboard((key) => {
        if (!focused) return;

        if (!rejectMode) {
            if (key.name === "y") onApprove();
            else if (key.name === "n") setRejectMode(true);
        } else {
            if (key.name === "return") {
                onReject(comment);
                setRejectMode(false);
                setComment("");
            } else if (key.name === "escape") {
                setRejectMode(false);
                setComment("");
            } else if (key.name === "backspace") {
                setComment((prev) => prev.slice(0, -1));
            } else if (key.name === "space") {
                setComment((prev) => `${prev} `);
            } else if (key.name?.length === 1) {
                setComment((prev) => prev + key.name);
            }
        }
    });

    return (
        <box
            style={{
                marginTop: 1,
                borderStyle: "double",
                borderColor: focused ? "green" : "magenta",
                flexDirection: "column",
                padding: 1,
            }}
        >
            <text>
                <strong fg={focused ? "green" : "magenta"}>
                    {focused ? "▶ USER ACTION REQUIRED" : "USER ACTION REQUIRED (Press Tab to Focus)"}
                </strong>
            </text>

            <text>Draft (Cycle {pendingAction.cycle}) is ready for review.</text>

            <box style={{ marginTop: 1 }}>
                {rejectMode ? (
                    <box style={{ flexDirection: "column" }}>
                        <text>Reason for changes:</text>
                        <box style={{ borderStyle: "single", borderColor: "gray" }}>
                            <text>{comment}█</text>
                        </box>
                        <text fg="gray">[Enter] Submit [Esc] Cancel</text>
                    </box>
                ) : (
                    <text>
                        Approve? <strong fg="green">[y] Yes</strong> /{" "}
                        <strong fg="red">[n] No (Request Changes)</strong>
                    </text>
                )}
            </box>
        </box>
    );
};
