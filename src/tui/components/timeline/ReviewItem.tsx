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
                borderColor: event.approved ? "green" : "yellow",
                flexDirection: "column",
                padding: 1,
            }}
        >
            <text>{event.approved ? "REVIEW PASSED" : "REVIEW REJECTED"}</text>
            {!event.approved && (
                <box style={{ flexDirection: "column", marginTop: 1 }}>
                    <text>Critique:</text>
                    <text>{event.critique}</text>
                </box>
            )}
        </box>
    );
};
