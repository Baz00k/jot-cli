export const ActivityPanel = ({ events, isRunning }: { events: string[]; isRunning: boolean }) => {
    return (
        <box style={{ width: "50%", border: true, flexDirection: "column" }}>
            <text>Agent Activity</text>

            <scrollbox style={{ flexGrow: 1 }}>
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
