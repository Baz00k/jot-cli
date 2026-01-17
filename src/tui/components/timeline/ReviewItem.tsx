import type { AgentEvent } from "@/services/agent";

interface ReviewItemProps {
    event: Extract<AgentEvent, { _tag: "ReviewComplete" }>;
}

export const ReviewItem = ({ event }: ReviewItemProps) => {
    return (
        <box
            style={{
                marginTop: 1,
                marginBottom: 1,
                borderStyle: "rounded",
                borderColor: event.approved ? "green" : "yellow",
                flexDirection: "column",
                padding: 1,
            }}
        >
            <text style={{ marginBottom: 1 }}>
                <strong fg={event.approved ? "green" : "yellow"}>
                    Reviewer {event.approved ? "(PASSED)" : "(REQUESTED CHANGES)"}
                </strong>
            </text>
            <text>{event.critique}</text>
        </box>
    );
};
