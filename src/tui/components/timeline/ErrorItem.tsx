import type { AgentEvent } from "@/services/agent";

interface ErrorItemProps {
    event: Extract<AgentEvent, { _tag: "IterationLimitReached" | "Error" }>;
}

export const ErrorItem = ({ event }: ErrorItemProps) => {
    if (event._tag === "Error") {
        return (
            <box style={{ marginTop: 1, borderColor: "red", padding: 1 }}>
                <text fg="red">Error: {event.message}</text>
            </box>
        );
    }

    return (
        <box style={{ marginTop: 1, borderColor: "red", padding: 1 }}>
            <text fg="red">Iteration limit reached! ({event.iterations} cycles)</text>
        </box>
    );
};
