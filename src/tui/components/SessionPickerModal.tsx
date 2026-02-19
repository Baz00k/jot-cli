import { useRenderer } from "@opentui/react";
import { type PromptContext, useDialogKeyboard } from "@opentui-ui/dialog/react";
import { useState } from "react";
import type { SessionData } from "@/services/session";
import { useTheme } from "@/tui/context/ThemeContext";

interface SessionPickerModalProps extends PromptContext<void> {
    sessions: readonly SessionData[];
    onSelect: (session: SessionData) => void;
}

const statusColor = (status: string, theme: ReturnType<typeof useTheme>["theme"]) => {
    switch (status) {
        case "completed":
            return theme.successColor;
        case "failed":
            return theme.errorColor;
        case "cancelled":
            return theme.warningColor;
        default:
            return theme.mutedColor;
    }
};

const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const truncate = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 3)}...` : text);

const getPrompt = (session: SessionData): string => {
    const entry = session.entries.find((e) => e._tag === "UserInput");
    if (entry && "prompt" in entry) {
        return entry.prompt as string;
    }
    return "(no prompt)";
};

export function SessionPickerModal({ dialogId, dismiss, sessions, onSelect }: SessionPickerModalProps) {
    const { theme } = useTheme();
    const renderer = useRenderer();
    const [selectedIndex, setSelectedIndex] = useState(0);

    useDialogKeyboard((key) => {
        if (key.name === "escape") {
            dismiss();
            return;
        }

        if (key.name === "up" || key.name === "k") {
            setSelectedIndex((prev) => Math.max(0, prev - 1));
            return;
        }

        if (key.name === "down" || key.name === "j") {
            setSelectedIndex((prev) => Math.min(sessions.length - 1, prev + 1));
            return;
        }

        if (key.name === "return") {
            const session = sessions[selectedIndex];
            if (session) {
                onSelect(session);
                dismiss();
            }
        }
    }, dialogId);

    if (sessions.length === 0) {
        return (
            <box style={{ flexDirection: "column", padding: 1 }}>
                <text style={{ alignSelf: "center" }}>
                    <strong>Sessions</strong>
                </text>
                <text fg={theme.mutedColor} style={{ marginTop: 1 }}>
                    No previous sessions found.
                </text>
                <text fg={theme.mutedColor} style={{ marginTop: 1 }}>
                    Esc: Close
                </text>
            </box>
        );
    }

    return (
        <box
            style={{
                flexDirection: "column",
                height: "100%",
                width: "100%",
                maxHeight: Math.round(renderer.height * 0.9),
            }}
        >
            <text style={{ alignSelf: "center", marginBottom: 1 }}>
                <strong>Resume Session</strong>
            </text>

            <scrollbox
                style={{
                    flexGrow: 1,
                    contentOptions: {
                        flexDirection: "column",
                    },
                }}
                focused
            >
                {sessions.map((session, index) => {
                    const isSelected = index === selectedIndex;
                    const prompt = getPrompt(session);

                    return (
                        <box
                            key={session.id}
                            style={{
                                flexDirection: "column",
                                border: true,
                                borderStyle: "rounded",
                                borderColor: isSelected ? theme.primaryColor : theme.borderColor,
                                padding: 1,
                                marginBottom: 1,
                            }}
                            onMouseDown={() => {
                                setSelectedIndex(index);
                                onSelect(session);
                                dismiss();
                            }}
                        >
                            <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                <text fg={isSelected ? theme.primaryColor : theme.textColor}>
                                    {isSelected ? "> " : "  "}
                                    {truncate(prompt, 50)}
                                </text>
                                <text fg={statusColor(session.status, theme)}>{session.status.toUpperCase()}</text>
                            </box>
                            <box style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 1 }}>
                                <text fg={theme.mutedColor}>
                                    {formatDate(session.startedAt)} | {session.iterations}c | $
                                    {session.totalCost.toFixed(3)}
                                </text>
                                <text fg={theme.mutedColor}>
                                    {session.modelWriter.split("/").pop()} / {session.modelReviewer.split("/").pop()}
                                </text>
                            </box>
                        </box>
                    );
                })}
            </scrollbox>

            <box
                style={{
                    height: 3,
                    border: true,
                    borderColor: theme.borderColor,
                    flexShrink: 0,
                    flexDirection: "row",
                }}
            >
                <text fg={theme.mutedColor}>j/k: Navigate | Enter/Click: Select | Esc: Cancel</text>
                <box style={{ flexGrow: 1 }} />
                <text fg={theme.mutedColor}>
                    {selectedIndex + 1}/{sessions.length}
                </text>
            </box>
        </box>
    );
}
