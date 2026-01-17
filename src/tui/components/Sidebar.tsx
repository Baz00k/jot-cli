import { useAgentContext } from "@/tui/context/AgentContext";
import { useTheme } from "@/tui/context/ThemeContext";

export const Sidebar = () => {
    const { state } = useAgentContext();
    const { totalCost, files, phase } = state;
    const { theme } = useTheme();

    return (
        <box
            style={{
                width: 40,
                height: "100%",
                border: true,
                borderStyle: "rounded",
                borderColor: theme.borderColor,
                flexDirection: "column",
                padding: 1,
                marginLeft: 1,
            }}
            title="Context"
        >
            <box style={{ flexDirection: "column", marginBottom: 1 }}>
                <text fg={theme.mutedColor}>STATUS</text>
                <text>
                    <strong fg={phase === "failed" ? theme.errorColor : theme.successColor}>
                        {phase.toUpperCase()}
                    </strong>
                </text>
            </box>

            <box style={{ flexDirection: "column", marginBottom: 1 }}>
                <text fg={theme.mutedColor}>COST</text>
                <text fg={theme.warningColor}>${totalCost.toFixed(4)}</text>
            </box>

            {files.length > 0 && (
                <box style={{ flexDirection: "column", flexGrow: 1 }}>
                    <text fg={theme.mutedColor} style={{ marginBottom: 1 }}>
                        EDITED FILES
                    </text>
                    <scrollbox style={{ flexDirection: "column" }}>
                        {files.map((path) => (
                            <text key={path} fg={theme.primaryColor}>
                                • {path}
                            </text>
                        ))}
                    </scrollbox>
                </box>
            )}
        </box>
    );
};
