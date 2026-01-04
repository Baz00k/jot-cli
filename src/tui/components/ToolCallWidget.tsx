import { useState } from "react";

interface ToolCallWidgetProps {
    name: string;
    input: unknown;
    output: unknown;
}

export const ToolCallWidget = ({ name, input, output }: ToolCallWidgetProps) => {
    const [expanded, setExpanded] = useState(false);

    const toggle = () => setExpanded((prev) => !prev);

    const formatInput = (i: unknown) => {
        if (typeof i === "object" && i !== null) {
            if ("filePath" in i) return `file: ${(i as { filePath: string }).filePath}`;
            if ("query" in i) return `query: "${(i as { query: string }).query}"`;
            return JSON.stringify(i).slice(0, 60);
        }
        return String(i);
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
                        {expanded ? "▼" : "▶"} 🔧 {name}
                    </strong>
                </text>
                {!expanded && <text style={{ marginLeft: 1 }}>{formatInput(input)}</text>}
            </box>

            {expanded && (
                <box style={{ flexDirection: "column", marginTop: 1, marginLeft: 2 }}>
                    <text>
                        <strong fg="cyan">Input:</strong>
                    </text>
                    <text>{JSON.stringify(input, null, 2)}</text>

                    <text style={{ marginTop: 1 }}>
                        <strong fg="cyan">Output:</strong>
                    </text>
                    <text>{String(output)}</text>
                </box>
            )}

            {!expanded && (
                <text fg="gray">
                    {String(output).slice(0, 100).replace(/\n/g, " ")}
                    {String(output).length > 100 ? "..." : ""}
                </text>
            )}
        </box>
    );
};
