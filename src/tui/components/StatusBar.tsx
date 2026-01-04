import { useKeyboard } from "@opentui/react";

export const StatusBar = ({ isRunning }: { isRunning: boolean }) => {
    useKeyboard((key) => {
        if (key.name === "escape") {
            process.exit(0);
        }
    });

    return (
        <box
            style={{
                border: true,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
            }}
        >
            <text>Press ESC to exit</text>
            <text>{isRunning ? "Status: Running" : "Status: Ready"}</text>
        </box>
    );
};
