import type { AgentEvent } from "@/services/agent";

interface ErrorItemProps {
    event: Extract<AgentEvent, { _tag: "IterationLimitReached" }>;
}

export const ErrorItem = ({ event }: ErrorItemProps) => {
    return (
        <box style={{ marginTop: 1, borderColor: "red" }}>
            <text>Iteration limit reached! ({event.iterations} cycles)</text>
        </box>
    );
};
