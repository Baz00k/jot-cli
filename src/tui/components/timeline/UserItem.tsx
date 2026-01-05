import type { AgentEvent } from "@/services/agent";

interface UserItemProps {
    event: Extract<AgentEvent, { _tag: "UserInput" }>;
}

export const UserItem = ({ event }: UserItemProps) => {
    return (
        <box
            style={{
                marginBottom: 1,
                borderStyle: "rounded",
                borderColor: "green",
                padding: 1,
            }}
        >
            <text>
                <strong fg="green">User:</strong> {event.content}
            </text>
        </box>
    );
};
