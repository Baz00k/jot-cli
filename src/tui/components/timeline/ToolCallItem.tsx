import type { AgentEvent } from "@/services/agent";
import { ToolCallWidget } from "../ToolCallWidget";

interface ToolCallItemProps {
    event: Extract<AgentEvent, { _tag: "ToolCall" }>;
}

export const ToolCallItem = ({ event }: ToolCallItemProps) => {
    return <ToolCallWidget name={event.name} input={event.input} output={event.output} />;
};
