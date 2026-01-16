import type { FilePatch } from "@/domain/vfs";
import { DiffView } from "@/tui/components/DiffView";
import { FeedbackModal } from "@/tui/components/FeedbackModal";
import { useTheme } from "@/tui/context/ThemeContext";
import { Keymap } from "@/tui/keyboard/keymap";
import { formatFilePatch } from "@/tui/utils/diff";
import { type PromptContext, useDialog, useDialogKeyboard } from "@opentui-ui/dialog/react";
import { useRenderer } from "@opentui/react";
import { useState } from "react";

interface DiffReviewModalProps extends PromptContext<void> {
    diffs: ReadonlyArray<FilePatch>;
    filetype?: string;
    onApprove: () => void;
    onReject: (comment?: string) => void;
}

export function DiffReviewModal({
    dialogId,
    dismiss,
    diffs,
    filetype = "markdown",
    onApprove,
    onReject,
}: DiffReviewModalProps) {
    const renderer = useRenderer();
    const dialog = useDialog();
    const { theme } = useTheme();
    const [view, setView] = useState<"unified" | "split">("unified");
    const [showLineNumbers, setShowLineNumbers] = useState(true);
    const [wrapMode, setWrapMode] = useState<"none" | "word">("none");

    useDialogKeyboard((key) => {
        if (key.raw === Keymap.Global.Help.name) {
            return;
        }

        if (key.name === Keymap.DiffView.ToggleView.name && !key.ctrl && !key.meta) {
            setView((prev) => (prev === "unified" ? "split" : "unified"));
        } else if (key.name === Keymap.DiffView.ToggleLineNumbers.name && !key.ctrl && !key.meta) {
            setShowLineNumbers((prev) => !prev);
        } else if (key.name === Keymap.DiffView.ToggleWrap.name && !key.ctrl && !key.meta) {
            setWrapMode((prev) => (prev === "none" ? "word" : "none"));
        } else if (key.name === Keymap.Feedback.Approve.name && !key.ctrl && !key.meta) {
            onApprove();
            dismiss();
        } else if (key.name === Keymap.Feedback.Reject.name && !key.ctrl && !key.meta) {
            dialog.prompt({
                content: (ctx) => (
                    <FeedbackModal
                        {...ctx}
                        onSubmit={(reason) => {
                            onReject(reason);
                            dismiss();
                        }}
                    />
                ),
                size: "medium",
            });
        } else if (key.name === Keymap.Global.Exit.name && key.ctrl) {
            dismiss();
        }
    }, dialogId);

    return (
        <box
            style={{
                flexDirection: "column",
                height: "100%",
                width: "100%",
                maxHeight: Math.round(renderer.height * 0.95),
            }}
        >
            {diffs.length === 0 ? (
                <text style={{ fg: theme.mutedColor }}>No changes to display.</text>
            ) : (
                <scrollbox
                    style={{
                        backgroundColor: theme.backgroundColor,
                        flexGrow: 1,
                        contentOptions: {
                            padding: 2,
                            flexDirection: "column",
                            gap: 1,
                        },
                    }}
                    focused
                >
                    {diffs.map((diff) => (
                        <box
                            key={diff.path}
                            style={{
                                flexDirection: "column",
                                border: true,
                                borderStyle: "rounded",
                                borderColor: theme.borderColor,
                                padding: 1,
                            }}
                            title={diff.path}
                        >
                            <DiffView
                                diff={formatFilePatch(diff)}
                                filetype={filetype}
                                theme={theme.diff}
                                view={view}
                                showLineNumbers={showLineNumbers}
                                wrapMode={wrapMode}
                            />
                        </box>
                    ))}
                </scrollbox>
            )}
            <box
                title="Review Changes"
                titleAlignment="center"
                style={{
                    height: 3,
                    border: true,
                    borderColor: theme.borderColor,
                    backgroundColor: theme.backgroundColor,
                    flexShrink: 0,
                }}
            >
                <text
                    content={`[${Keymap.Feedback.Approve.label}]Approve [${Keymap.Feedback.Reject.label}]Reject | [${Keymap.DiffView.ToggleView.label}]View [${Keymap.DiffView.ToggleLineNumbers.label}]LineNums`}
                    style={{ fg: theme.mutedColor }}
                />
            </box>
        </box>
    );
}
