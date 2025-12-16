import { Chunk, Data, Option, Schema } from "effect";

// ============================================================================
// Workflow Events
// ============================================================================

/**
 * Event: Writer produces new content
 */
export class DraftGenerated extends Data.TaggedClass("DraftGenerated")<{
    readonly cycle: number;
    readonly content: string;
    readonly timestamp: number;
}> {}

/**
 * Event: AI Reviewer provides a verdict
 */
export class ReviewCompleted extends Data.TaggedClass("ReviewCompleted")<{
    readonly cycle: number;
    readonly approved: boolean;
    readonly critique: string;
    readonly reasoning: string;
    readonly timestamp: number;
}> {}

/**
 * Event: User intervenes with feedback
 */
export class UserFeedback extends Data.TaggedClass("UserFeedback")<{
    readonly action: "approve" | "reject";
    readonly comment?: string;
    readonly timestamp: number;
}> {}

export type WorkflowEvent = DraftGenerated | ReviewCompleted | UserFeedback;

// ============================================================================
// Review Result Schema (for structured LLM output)
// ============================================================================

export class ReviewResult extends Schema.Class<ReviewResult>("ReviewResult")({
    approved: Schema.Boolean,
    critique: Schema.String,
    reasoning: Schema.String,
}) {}

// ============================================================================
// Workflow State Container
// ============================================================================

/**
 * Immutable state container that wraps the event history and provides
 * computed properties for the Agent to make decisions.
 */
export class WorkflowState extends Data.Class<{
    readonly history: Chunk.Chunk<WorkflowEvent>;
}> {
    static readonly empty = new WorkflowState({ history: Chunk.empty() });

    /**
     * How many drafts have been generated?
     */
    get iterationCount(): number {
        return Chunk.reduce(this.history, 0, (count, event) => (event._tag === "DraftGenerated" ? count + 1 : count));
    }

    /**
     * Get the most recent draft content
     */
    get latestDraft(): Option.Option<string> {
        return Chunk.findLast(this.history, (e): e is DraftGenerated => e._tag === "DraftGenerated").pipe(
            Option.map((e) => e.content),
        );
    }

    /**
     * Get the most recent feedback that needs addressing.
     * Prioritizes the most recent rejection (whether AI or User).
     */
    get latestFeedback(): Option.Option<string> {
        return Chunk.findLast(this.history, (e): e is ReviewCompleted | UserFeedback => {
            if (e._tag === "ReviewCompleted" && !e.approved) return true;
            if (e._tag === "UserFeedback" && e.action === "reject") return true;
            return false;
        }).pipe(
            Option.map((e) => {
                if (e._tag === "ReviewCompleted") return e.critique;
                if (e._tag === "UserFeedback") return e.comment ?? "Please revise based on user request.";
                return "";
            }),
        );
    }

    /**
     * Get the most recent review result
     */
    get latestReview(): Option.Option<ReviewCompleted> {
        return Chunk.findLast(this.history, (e): e is ReviewCompleted => e._tag === "ReviewCompleted");
    }

    /**
     * Check if the workflow has been approved (either by AI review or user).
     */
    get isApproved(): boolean {
        const lastEvent = Chunk.findLast(
            this.history,
            (e): e is ReviewCompleted | UserFeedback => e._tag === "ReviewCompleted" || e._tag === "UserFeedback",
        );
        return Option.match(lastEvent, {
            onNone: () => false,
            onSome: (e) => {
                if (e._tag === "ReviewCompleted") return e.approved;
                if (e._tag === "UserFeedback") return e.action === "approve";
                return false;
            },
        });
    }

    /**
     * Returns a NEW state instance with the event appended
     */
    add(event: WorkflowEvent): WorkflowState {
        return new WorkflowState({
            history: Chunk.append(this.history, event),
        });
    }
}
