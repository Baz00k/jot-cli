import { useAgentContext } from "@/tui/context/AgentContext";
import { TimelineItem } from "./timeline/TimelineItem";

interface TimelineProps {
    focused: boolean;
}

export const Timeline = ({ focused }: TimelineProps) => {
    const { state } = useAgentContext();
    const { timeline: entries, streamBuffer, streamPhase } = state;

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
                <TimelineItem
                    key={entry.id}
                    entry={entry}
                    focused={focused && entry.event._tag === "UserActionRequired"}
                />
            ))}

            {streamPhase && (
                <box style={{ marginTop: 1, borderColor: "blue", flexDirection: "column" }}>
                    <text>{streamPhase === "drafting" ? "Drafting..." : "Processing..."}</text>
                    <text>{streamBuffer}</text>
                </box>
            )}
        </box>
    );
};
