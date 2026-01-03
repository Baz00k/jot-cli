interface ToolCallWidgetProps {
    name: string;
    input: unknown;
    output: unknown;
}

export const ToolCallWidget = ({ name, input, output }: ToolCallWidgetProps) => {
    // In a real TUI we might make this focusable to toggle, but for now we show a summary
    // and rely on truncation. Ideally, we could use a specialized expanding hook.

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
        >
            <box style={{ flexDirection: "row" }}>
                <text>
                    <strong fg="blue">🔧 {name}</strong>
                </text>
                <text style={{ marginLeft: 1 }}>{formatInput(input)}</text>
            </box>
            {/* Output summary */}
            <text fg="gray">
                {String(output).slice(0, 100).replace(/\n/g, " ")}
                {String(output).length > 100 ? "..." : ""}
            </text>
        </box>
    );
};
