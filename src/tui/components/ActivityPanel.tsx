export interface ActivityPanelProps {
    events: string[];
    isRunning: boolean;
    focused: boolean;
}

export const ActivityPanel = ({ events, isRunning, focused }: ActivityPanelProps) => {
    return (
        <box
            style={{
                width: "50%",
                border: true,
                borderColor: focused ? "green" : undefined,
                flexDirection: "column",
            }}
        >
            <text>Agent Activity</text>

            <scrollbox style={{ flexGrow: 1 }} focused={focused}>
                {events.map((event, index) => (
                    <box key={`${index}-${event.slice(0, 20)}`}>
                        <text>{event}</text>
                    </box>
                ))}

                {isRunning && <text>Agent is working...</text>}
            </scrollbox>
        </box>
    );
};
