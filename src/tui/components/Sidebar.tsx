import { useAgentContext } from "@/tui/context/AgentContext";

export const Sidebar = () => {
    const { state } = useAgentContext();
    const { totalCost, files, phase } = state;

    return (
        <box
            style={{
                width: 40,
                height: "100%",
                border: true,
                borderStyle: "rounded",
                borderColor: "gray",
                flexDirection: "column",
                padding: 1,
                marginLeft: 1,
            }}
            title="Context"
        >
            <box style={{ flexDirection: "column", marginBottom: 1 }}>
                <text fg="gray">STATUS</text>
                <text>
                    <strong fg={phase === "failed" ? "red" : "green"}>{phase.toUpperCase()}</strong>
                </text>
            </box>

            <box style={{ flexDirection: "column", marginBottom: 1 }}>
                <text fg="gray">COST</text>
                <text fg="yellow">${totalCost.toFixed(4)}</text>
            </box>

            {files.length > 0 && (
                <box style={{ flexDirection: "column", flexGrow: 1 }}>
                    <text fg="gray" style={{ marginBottom: 1 }}>
                        EDITED FILES
                    </text>
                    <scrollbox style={{ flexDirection: "column" }}>
                        {files.map((path) => (
                            <text key={path} fg="cyan">
                                • {path}
                            </text>
                        ))}
                    </scrollbox>
                </box>
            )}
        </box>
    );
};
