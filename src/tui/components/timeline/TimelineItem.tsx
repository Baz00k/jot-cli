import type { TimelineEntry } from "@/tui/hooks/useAgent";
import { DraftItem } from "./DraftItem";
import { ErrorItem } from "./ErrorItem";
import { ProgressItem } from "./ProgressItem";
import { ReviewItem } from "./ReviewItem";
import { ToolCallItem } from "./ToolCallItem";

export const TimelineItem = ({ entry }: { entry: TimelineEntry }) => {
    const { event } = entry;

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
            return null;
        default:
            return null;
    }
};
