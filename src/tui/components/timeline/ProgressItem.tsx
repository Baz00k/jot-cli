import type { AgentEvent } from "@/services/agent";

interface ProgressItemProps {
    event: Extract<AgentEvent, { _tag: "Progress" }>;
    cycle: number;
}

export const ProgressItem = ({ event, cycle }: ProgressItemProps) => {
    return (
        <box style={{ marginBottom: 1 }}>
            <text>
                [Cycle {cycle}] {event.message}
            </text>
        </box>
    );
};
