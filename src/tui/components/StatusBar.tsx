import { useKeyboard } from "@opentui/react";
import { useAgentContext } from "@/tui/context/AgentContext";
import { useConfigContext } from "@/tui/context/ConfigContext";
import { useTheme } from "@/tui/context/ThemeContext";
import { Keymap } from "@/tui/keyboard/keymap";
import { areKeyBindingsEqual } from "../keyboard/utils";

export interface StatusBarProps {
    isRunning: boolean;
    disabled?: boolean;
}

export const StatusBar = ({ isRunning, disabled = false }: StatusBarProps) => {
    const { config } = useConfigContext();
    const { state, retry } = useAgentContext();
    const { theme } = useTheme();

    useKeyboard((keyEvent) => {
        if (disabled) return;

        if (state.error && areKeyBindingsEqual(keyEvent, Keymap.Global.Retry)) {
            retry();
            return;
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
                borderColor: theme.borderColor,
            }}
        >
            <text>
                {Keymap.Global.Cancel.label}: Exit | {Keymap.Global.Settings.label}: Settings
                {state.error ? ` | ${Keymap.Global.Retry.label}: Retry` : ""}
            </text>
            <text>
                W: {writer} | R: {reviewer}
            </text>
            <text fg={isRunning ? theme.successColor : theme.mutedColor}>
                {isRunning ? "Status: Running" : "Status: Ready"}
            </text>
        </box>
    );
};
