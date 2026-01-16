import { useKeyboard } from "@opentui/react";
import { useDialog } from "@opentui-ui/dialog/react";
import { useState } from "react";
import { DiffReviewModal } from "@/tui/components/DiffReviewModal";
import { Input } from "@/tui/components/Input";
import { useTheme } from "@/tui/context/ThemeContext";
import type { PendingUserAction } from "@/tui/hooks/useAgent";
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
    const { theme } = useTheme();
    const [rejectMode, setRejectMode] = useState(false);

    const openReviewModal = () => {
        const diffContent = formatDiffs(pendingAction.diffs);
        dialog.prompt({
            content: (ctx) => <DiffReviewModal {...ctx} diff={diffContent} onApprove={onApprove} onReject={onReject} />,
            size: "full",
        });
    };

    useKeyboard((key) => {
        if (!focused) return;

        if (rejectMode) {
            if (key.name === Keymap.Feedback.CancelReject.name) {
                setRejectMode(false);
            }
            return;
        }

        if (key.name === Keymap.Feedback.Approve.name) onApprove();
        else if (key.name === Keymap.Feedback.Reject.name) setRejectMode(true);
        else if (key.name === Keymap.DiffView.ToggleView.name) openReviewModal();
    });

    return (
        <box
            style={{
                marginTop: 1,
                borderStyle: "rounded",
                borderColor: focused ? theme.successColor : theme.secondaryColor,
                flexDirection: "column",
                padding: 1,
            }}
        >
            <text style={{ marginBottom: 1 }}>
                <strong fg={focused ? theme.successColor : theme.secondaryColor}>
                    {focused ? "▶ USER ACTION REQUIRED" : "USER ACTION REQUIRED (Press Tab to Focus)"}
                </strong>
            </text>

            <text>
                Cycle {pendingAction.cycle}: The agent has proposed changes to {pendingAction.diffs.length} file(s).
            </text>

            <box style={{ marginTop: 1 }}>
                {rejectMode ? (
                    <box style={{ flexDirection: "column", width: "100%" }}>
                        <text fg={theme.warningColor} style={{ marginBottom: 1 }}>
                            Please describe required changes:
                        </text>
                        <Input
                            focused={focused}
                            placeholder="Type reason..."
                            onSubmit={(text) => {
                                onReject(text);
                                setRejectMode(false);
                            }}
                        />
                        <text fg={theme.mutedColor} style={{ marginTop: 1 }}>
                            [{Keymap.Feedback.SubmitReject.label}] Submit [{Keymap.Feedback.CancelReject.label}] Cancel
                        </text>
                    </box>
                ) : (
                    <box style={{ flexDirection: "column" }}>
                        <text>
                            <strong fg={theme.primaryColor}>
                                [{Keymap.DiffView.ToggleView.label}] View Changes (Diff)
                            </strong>
                        </text>
                        <text>
                            <strong fg={theme.successColor}>[{Keymap.Feedback.Approve.label}] Approve & Apply</strong>
                        </text>
                        <text>
                            <strong fg={theme.errorColor}>
                                [{Keymap.Feedback.Reject.label}] Reject & Request Changes
                            </strong>
                        </text>
                    </box>
                )}
            </box>
        </box>
    );
};
