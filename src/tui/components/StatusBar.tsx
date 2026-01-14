import { useKeyboard } from "@opentui/react";
import { useAgentContext } from "@/tui/context/AgentContext";
import { useConfigContext } from "@/tui/context/ConfigContext";
import { useRenderer } from "@/tui/context/RendererContext";

export interface StatusBarProps {
    isRunning: boolean;
    disabled?: boolean;
}

export const StatusBar = ({ isRunning, disabled = false }: StatusBarProps) => {
    const { config } = useConfigContext();
    const renderer = useRenderer();
    const { state, retry } = useAgentContext();

    useKeyboard((key) => {
        if (disabled) return;

        if (state.error && key.name === "r") {
            retry();
            return;
        }

        if (key.name === "escape") {
            // Reset window title before destroying renderer
            renderer.setTerminalTitle("");
            renderer.destroy();
            process.exit(0);
        }
    });

    const writer = config?.writerModel ?? "default";
    const reviewer = config?.reviewerModel ?? "default";

    return (
        <box
            style={{
                border: true,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                minHeight: 3,
            }}
        >
            <text>Esc: Exit | F2: Settings{state.error ? " | R: Retry" : ""}</text>
            <text>
                W: {writer} | R: {reviewer}
            </text>
            <text>{isRunning ? "Status: Running" : "Status: Ready"}</text>
        </box>
    );
};
