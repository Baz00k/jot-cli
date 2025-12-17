import { Chunk, Data, Option, Schema } from "effect";

export class DraftGenerated extends Data.TaggedClass("DraftGenerated")<{
    readonly cycle: number;
    readonly content: string;
    readonly timestamp: number;
}> {}

export class ReviewCompleted extends Data.TaggedClass("ReviewCompleted")<{
    readonly cycle: number;
    readonly approved: boolean;
    readonly critique: string;
    readonly reasoning: string;
    readonly timestamp: number;
}> {}

export class UserFeedback extends Data.TaggedClass("UserFeedback")<{
    readonly action: "approve" | "reject";
    readonly comment?: string;
    readonly timestamp: number;
}> {}

export type WorkflowEvent = DraftGenerated | ReviewCompleted | UserFeedback;

export class ReviewResult extends Schema.Class<ReviewResult>("ReviewResult")({
    approved: Schema.Boolean.annotations({ description: "True if the reviewed content meets the goal" }),
    critique: Schema.String.annotations({ description: "Specific feedback if not approved, empty if approved" }),
    reasoning: Schema.String.annotations({ description: "Reasoning behind the review result" }),
}) {}

export class WorkflowState extends Data.Class<{
    readonly history: Chunk.Chunk<WorkflowEvent>;
}> {
    static readonly empty = new WorkflowState({ history: Chunk.empty() });

    get iterationCount(): number {
        return Chunk.reduce(this.history, 0, (count, event) => (event._tag === "DraftGenerated" ? count + 1 : count));
    }

    get latestDraft(): Option.Option<string> {
        return Chunk.findLast(this.history, (e): e is DraftGenerated => e._tag === "DraftGenerated").pipe(
            Option.map((e) => e.content),
        );
    }

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

    get latestReview(): Option.Option<ReviewCompleted> {
        return Chunk.findLast(this.history, (e): e is ReviewCompleted => e._tag === "ReviewCompleted");
    }

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

    add(event: WorkflowEvent): WorkflowState {
        return new WorkflowState({
            history: Chunk.append(this.history, event),
        });
    }
}
