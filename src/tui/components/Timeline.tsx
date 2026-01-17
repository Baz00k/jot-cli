import { useAgentContext } from "@/tui/context/AgentContext";
import { useTheme } from "@/tui/context/ThemeContext";
import { TimelineItem } from "./timeline/TimelineItem";

interface TimelineProps {
    focused: boolean;
    onApprove?: () => void;
    onReject?: (comment?: string) => void;
}

export const Timeline = ({ focused, onApprove, onReject }: TimelineProps) => {
    const { state } = useAgentContext();
    const { timeline: entries, streamBuffer, streamPhase } = state;
    const { theme } = useTheme();

    return (
        <scrollbox
            style={{
                stickyScroll: true,
                stickyStart: "bottom",
                scrollbarOptions: {
                    showArrows: true,
                    trackOptions: {
                        foregroundColor: theme.primaryColor,
                        backgroundColor: theme.diff.lineNumberBg,
                    },
                },
                contentOptions: {
                    flexDirection: "column",
                    padding: 1,
                },
                flexGrow: 1,
                border: true,
                borderColor: focused ? theme.primaryColor : theme.borderColor,
            }}
            focused={focused}
            title="Jot CLI - AI Research Assistant"
            titleAlignment="center"
        >
            {entries.map((entry) => (
                <TimelineItem
                    key={entry.id}
                    entry={entry}
                    focused={focused && entry.event._tag === "UserActionRequired"}
                    onApprove={onApprove}
                    onReject={onReject}
                />
            ))}

            {streamPhase && (
                <box
                    style={{
                        marginTop: 1,
                        borderColor: theme.borderColor,
                        flexDirection: "column",
                        borderStyle: "rounded",
                    }}
                >
                    <text fg={theme.mutedColor}>{streamPhase === "drafting" ? "Drafting..." : "Processing..."}</text>
                    <text fg={theme.secondaryColor}>{streamBuffer}</text>
                </box>
            )}
        </scrollbox>
    );
};
