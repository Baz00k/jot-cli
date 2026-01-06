import { Match } from "effect";
import { useState } from "react";
import type { AgentEvent } from "@/services/agent";

interface ToolCallItemProps {
    event: Extract<AgentEvent, { _tag: "ToolCall" }>;
}

export const ToolCallItem = ({ event }: ToolCallItemProps) => {
    const [expanded, setExpanded] = useState(false);

    const toggle = () => setExpanded((prev) => !prev);

    const formatInput = (i: unknown) =>
        Match.value(i).pipe(
            Match.when({ filePath: Match.nonEmptyString }, (i) => `file: ${i.filePath}`),
            Match.when({ query: Match.nonEmptyString }, (i) => `query: "${i.query}"`),
            Match.when({ url: Match.nonEmptyString }, (i) => `url: ${i.url}`),
            Match.orElse(() => undefined),
        );

    const formatDetail = (v: unknown) => {
        if (typeof v === "string") return v;
        try {
            return JSON.stringify(v, null, 2);
        } catch {
            return String(v);
        }
    };

    return (
        <box
            style={{
                marginBottom: 1,
                borderStyle: "rounded",
                borderColor: "gray",
                flexDirection: "column",
                paddingLeft: 1,
            }}
            onMouseDown={toggle}
        >
            <box style={{ flexDirection: "row" }}>
                <text>
                    <strong fg="blue">
                        {expanded ? "▼" : "▶"} 🔧 {event.name}
                    </strong>
                </text>
                {!expanded && <text style={{ marginLeft: 1 }}>{formatInput(event.input)}</text>}
            </box>

            {expanded && (
                <box style={{ flexDirection: "column", marginTop: 1, marginLeft: 2 }}>
                    <text>
                        <strong fg="cyan">Input:</strong>
                    </text>
                    <text>{formatDetail(event.input)}</text>

                    <text style={{ marginTop: 1 }}>
                        <strong fg="cyan">Output:</strong>
                    </text>
                    <text>{formatDetail(event.output)}</text>
                </box>
            )}
        </box>
    );
};
