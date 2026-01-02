export const StatusBar = ({ isRunning }: { isRunning: boolean }) => {
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
