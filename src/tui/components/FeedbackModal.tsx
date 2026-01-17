import { type PromptContext, useDialogKeyboard } from "@opentui-ui/dialog/react";
import { Input } from "@/tui/components/Input";
import { useTheme } from "@/tui/context/ThemeContext";

interface FeedbackModalProps extends PromptContext<void> {
    onSubmit: (text: string) => void;
    title?: string;
    placeholder?: string;
}

export function FeedbackModal({
    dialogId,
    dismiss,
    onSubmit,
    title = "Reason for rejection",
    placeholder = "Type your reason here...",
}: FeedbackModalProps) {
    const { theme } = useTheme();

    useDialogKeyboard((key) => {
        if (key.name === "escape") {
            dismiss();
        }
    }, dialogId);

    return (
        <box
            style={{
                flexDirection: "column",
                gap: 1,
                padding: 1,
            }}
        >
            <text>
                <strong>{title}</strong>
            </text>
            <Input
                focused
                placeholder={placeholder}
                onSubmit={(val) => {
                    onSubmit(val);
                    dismiss();
                }}
            />
            <text style={{ fg: theme.mutedColor }}>Enter: Submit | Esc: Cancel</text>
        </box>
    );
}
