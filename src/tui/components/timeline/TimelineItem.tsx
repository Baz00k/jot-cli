import { useAgentContext } from "@/tui/context/AgentContext";
import type { TimelineEntry } from "@/tui/hooks/useAgent";
import { FeedbackWidget } from "../FeedbackWidget";
import { DraftItem } from "./DraftItem";
import { ErrorItem } from "./ErrorItem";
import { ProgressItem } from "./ProgressItem";
import { ReviewItem } from "./ReviewItem";
import { ToolCallItem } from "./ToolCallItem";

export const TimelineItem = ({ entry, focused }: { entry: TimelineEntry; focused: boolean }) => {
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
            return <ErrorItem event={event} />;
        case "ToolCall":
            return <ToolCallItem event={event} />;
        case "UserActionRequired":
            return (
                <FeedbackWidget
                    pendingAction={{ draft: event.draft, cycle: event.cycle }}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    focused={focused}
                />
            );
        default:
            return null;
    }
};
