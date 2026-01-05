import { useAgentContext } from "@/tui/context/AgentContext";
import { TimelineItem } from "./timeline/TimelineItem";

interface TimelineProps {
    focused: boolean;
    onApprove?: () => void;
    onReject?: (comment?: string) => void;
}

export const Timeline = ({ focused, onApprove, onReject }: TimelineProps) => {
    const { state } = useAgentContext();
    const { timeline: entries, streamBuffer, streamPhase } = state;

    return (
        <scrollbox
            style={{
                stickyScroll: true,
                stickyStart: "bottom",
                scrollbarOptions: {
                    showArrows: true,
                    trackOptions: {
                        foregroundColor: "#7aa2f7",
                        backgroundColor: "#414868",
                    },
                },
                contentOptions: {
                    flexDirection: "column",
                    padding: 1,
                },
                flexGrow: 1,
                border: true,
            }}
            focused={focused}
            title="Jot CLI - AI Research Assistant"
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
                <box style={{ marginTop: 1, borderColor: "gray", flexDirection: "column", borderStyle: "rounded" }}>
                    <text fg="gray">{streamPhase === "drafting" ? "Drafting..." : "Processing..."}</text>
                    <text fg="#a9b1d6">{streamBuffer}</text>
                </box>
            )}
        </scrollbox>
    );
};
