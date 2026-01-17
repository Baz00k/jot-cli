import type { AgentEvent } from "@/services/agent";

interface ProgressItemProps {
    event: Extract<AgentEvent, { _tag: "Progress" }>;
    cycle: number;
}

export const ProgressItem = ({ event, cycle }: ProgressItemProps) => {
    return (
        <box
            style={{
                marginBottom: 1,
                padding: 1,
                borderStyle: "rounded",
                borderColor: "#7aa2f7",
                flexDirection: "row",
            }}
        >
            <text style={{ marginRight: 1 }}>
                <strong fg="#7aa2f7">Running Cycle {cycle}:</strong>
            </text>
            <text>{event.message}</text>
        </box>
    );
};
