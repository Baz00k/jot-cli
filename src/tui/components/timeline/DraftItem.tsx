import type { AgentEvent } from "@/services/agent";

interface DraftItemProps {
    event: Extract<AgentEvent, { _tag: "DraftComplete" }>;
    cycle: number;
}

export const DraftItem = ({ event, cycle }: DraftItemProps) => {
    return (
        <box
            style={{
                marginTop: 1,
                marginBottom: 1,
                flexDirection: "column",
                padding: 1,
            }}
        >
            <text>DRAFT (Cycle {cycle})</text>
            <text>{event.content}</text>
        </box>
    );
};
