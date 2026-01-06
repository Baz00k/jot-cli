import { useConfigContext } from "@/tui/context/ConfigContext";
import { useRenderer } from "@/tui/context/RendererContext";
import { useKeyboard } from "@opentui/react";

export interface StatusBarProps {
    isRunning: boolean;
    disabled?: boolean;
}

export const StatusBar = ({ isRunning, disabled = false }: StatusBarProps) => {
    const { config } = useConfigContext();
    const renderer = useRenderer();

    useKeyboard((key) => {
        if (disabled) return;

        if (key.name === "escape") {
            // Reset window title before destroying renderer
            renderer.setTerminalTitle("");
            renderer.destroy();
            process.kill(process.pid, "SIGINT");
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
                minHeight: 2,
            }}
        >
            <text>Esc: Exit | F2: Settings</text>
            <text>
                W: {writer} | R: {reviewer}
            </text>
            <text>{isRunning ? "Status: Running" : "Status: Ready"}</text>
        </box>
    );
};
