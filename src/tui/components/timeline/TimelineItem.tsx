import { useAgentContext } from "@/tui/context/AgentContext";
import type { TimelineEntry } from "@/tui/hooks/useAgent";
import { FeedbackWidget } from "../FeedbackWidget";
import { DraftItem } from "./DraftItem";
import { ErrorItem } from "./ErrorItem";
import { ProgressItem } from "./ProgressItem";
import { ReviewItem } from "./ReviewItem";
import { ToolCallItem } from "./ToolCallItem";
import { UserItem } from "./UserItem";

export const TimelineItem = ({
    entry,
    focused,
    onApprove,
    onReject,
}: {
    entry: TimelineEntry;
    focused: boolean;
    onApprove?: () => void;
    onReject?: (comment?: string) => void;
}) => {
    const { event } = entry;
    const { submitAction } = useAgentContext();

    const handleApprove = () => {
        submitAction({ type: "approve" });
    };

    const handleReject = (comment?: string) => {
        submitAction({ type: "reject", comment });
    };

    switch (event._tag) {
        case "Progress":
            return <ProgressItem event={event} cycle={entry.cycle} />;
        case "DraftComplete":
            return <DraftItem event={event} cycle={entry.cycle} />;
        case "ReviewComplete":
            return <ReviewItem event={event} />;
        case "IterationLimitReached":
        case "Error":
            return <ErrorItem event={event} />;
        case "ToolCall":
            return <ToolCallItem event={event} />;
        case "UserInput":
            return <UserItem event={event} />;
        case "UserActionRequired":
            return (
                <FeedbackWidget
                    pendingAction={{ draft: event.draft, cycle: event.cycle }}
                    onApprove={onApprove ?? handleApprove}
                    onReject={onReject ?? handleReject}
                    focused={focused}
                />
            );
        default:
            return null;
    }
};
