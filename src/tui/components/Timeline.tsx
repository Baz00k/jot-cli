import { useAgentContext } from "@/tui/context/AgentContext";
import { FeedbackWidget } from "./FeedbackWidget";
import { TimelineItem } from "./timeline/TimelineItem";

interface TimelineProps {
    onApprove: () => void;
    onReject: (comment?: string) => void;
    focused: boolean;
}

export const Timeline = ({ onApprove, onReject, focused }: TimelineProps) => {
    const { state } = useAgentContext();
    const { timeline: entries, streamBuffer, streamPhase, phase, pendingAction } = state;

    return (
        <box
            style={{
                flexGrow: 1,
                border: true,
                flexDirection: "column",
                padding: 1,
            }}
        >
            {entries.map((entry) => (
                <TimelineItem key={entry.id} entry={entry} />
            ))}

            {streamPhase && (
                <box style={{ marginTop: 1, borderColor: "blue", flexDirection: "column" }}>
                    <text>{streamPhase === "drafting" ? "Drafting..." : "Processing..."}</text>
                    <text>{streamBuffer}</text>
                </box>
            )}

            {phase === "awaiting-user" && pendingAction && (
                <FeedbackWidget
                    pendingAction={pendingAction}
                    onApprove={onApprove}
                    onReject={onReject}
                    focused={focused}
                />
            )}
        </box>
    );
};
