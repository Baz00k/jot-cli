import { useKeyboard } from "@opentui/react";
import { useDialog } from "@opentui-ui/dialog/react";
import { useState } from "react";
import { DiffReviewModal } from "@/tui/components/DiffView";
import type { PendingUserAction } from "@/tui/hooks/useAgent";
import { useTextBuffer } from "@/tui/hooks/useTextBuffer";
import { Keymap } from "@/tui/keyboard/keymap";
import { formatDiffs } from "@/tui/utils/diff";

interface FeedbackWidgetProps {
    pendingAction: PendingUserAction;
    onApprove: () => void;
    onReject: (comment?: string) => void;
    focused: boolean;
}

export const FeedbackWidget = ({ pendingAction, onApprove, onReject, focused }: FeedbackWidgetProps) => {
    const dialog = useDialog();
    const [rejectMode, setRejectMode] = useState(false);
    const buffer = useTextBuffer("");

    const openReviewModal = () => {
        const diffContent = formatDiffs(pendingAction.diffs);
        dialog.prompt({
            content: (ctx) => <DiffReviewModal {...ctx} diff={diffContent} onApprove={onApprove} onReject={onReject} />,
            size: "full",
        });
    };

    useKeyboard((key) => {
        if (!focused) return;

        if (!rejectMode) {
            if (key.name === Keymap.Feedback.Approve.name) onApprove();
            else if (key.name === Keymap.Feedback.Reject.name) setRejectMode(true);
            else if (key.name === Keymap.DiffView.ToggleView.name) openReviewModal();
        } else {
            if (key.name === Keymap.Feedback.SubmitReject.name) {
                onReject(buffer.text);
                setRejectMode(false);
                buffer.clear();
            } else if (key.name === Keymap.Feedback.CancelReject.name) {
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
                            [{Keymap.Feedback.SubmitReject.label}] Submit [{Keymap.Feedback.CancelReject.label}] Cancel
                        </text>
                    </box>
                ) : (
                    <box style={{ flexDirection: "column" }}>
                        <text>
                            <strong fg="cyan">[{Keymap.DiffView.ToggleView.label}] View Changes (Diff)</strong>
                        </text>
                        <text>
                            <strong fg="green">[{Keymap.Feedback.Approve.label}] Approve & Apply</strong>
                        </text>
                        <text>
                            <strong fg="red">[{Keymap.Feedback.Reject.label}] Reject & Request Changes</strong>
                        </text>
                    </box>
                )}
            </box>
        </box>
    );
};
