import { DiffReviewModal } from "@/tui/components/DiffReviewModal";
import { FeedbackModal } from "@/tui/components/FeedbackModal";
import { useTheme } from "@/tui/context/ThemeContext";
import type { PendingUserAction } from "@/tui/hooks/useAgent";
import { Keymap } from "@/tui/keyboard/keymap";
import { useDialog } from "@opentui-ui/dialog/react";
import { useKeyboard } from "@opentui/react";

interface FeedbackWidgetProps {
    pendingAction: PendingUserAction;
    onApprove: () => void;
    onReject: (comment?: string) => void;
    focused: boolean;
}

export const FeedbackWidget = ({ pendingAction, onApprove, onReject, focused }: FeedbackWidgetProps) => {
    const dialog = useDialog();
    const { theme } = useTheme();

    const openReviewModal = () => {
        dialog.prompt({
            content: (ctx) => (
                <DiffReviewModal {...ctx} diffs={pendingAction.diffs} onApprove={onApprove} onReject={onReject} />
            ),
            size: "full",
            style: {
                padding: 0,
            },
        });
    };

    const openRejectModal = () => {
        dialog.prompt({
            content: (ctx) => <FeedbackModal {...ctx} onSubmit={onReject} />,
            size: "medium",
        });
    };

    useKeyboard((key) => {
        if (!focused) return;

        if (key.name === Keymap.Feedback.Approve.name) onApprove();
        else if (key.name === Keymap.Feedback.Reject.name) openRejectModal();
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

            <box style={{ marginTop: 1, flexDirection: "column" }}>
                <text>
                    <strong fg={theme.primaryColor}>[{Keymap.DiffView.ToggleView.label}] View Changes (Diff)</strong>
                </text>
                <text>
                    <strong fg={theme.successColor}>[{Keymap.Feedback.Approve.label}] Approve & Apply</strong>
                </text>
                <text>
                    <strong fg={theme.errorColor}>[{Keymap.Feedback.Reject.label}] Reject & Request Changes</strong>
                </text>
            </box>
        </box>
    );
};
