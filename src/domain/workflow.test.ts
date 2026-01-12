import { describe, expect, test } from "bun:test";
import { Option } from "effect";
import { DraftGenerated, ReviewCompleted, UserFeedback, WorkflowState } from "@/domain/workflow";

describe("WorkflowState", () => {
    test("empty state has zero iterations", () => {
        const state = WorkflowState.empty;
        expect(state.iterationCount).toBe(0);
    });

    test("empty state has no latest draft", () => {
        const state = WorkflowState.empty;
        expect(Option.isNone(state.latestDraft)).toBe(true);
    });

    test("empty state has no latest feedback", () => {
        const state = WorkflowState.empty;
        expect(Option.isNone(state.latestFeedback)).toBe(true);
    });

    test("empty state is not approved", () => {
        const state = WorkflowState.empty;
        expect(state.isApproved).toBe(false);
    });

    test("adding a draft increments iteration count", () => {
        const state = WorkflowState.empty.add(
            new DraftGenerated({
                cycle: 1,
                content: "First draft",
                timestamp: Date.now(),
            }),
        );

        expect(state.iterationCount).toBe(1);
    });

    test("latestDraft returns the most recent draft content", () => {
        const state = WorkflowState.empty
            .add(
                new DraftGenerated({
                    cycle: 1,
                    content: "First draft",
                    timestamp: Date.now(),
                }),
            )
            .add(
                new ReviewCompleted({
                    cycle: 1,
                    approved: false,
                    critique: "Needs improvement",
                    reasoning: "Not detailed enough",
                    timestamp: Date.now(),
                }),
            )
            .add(
                new DraftGenerated({
                    cycle: 2,
                    content: "Second draft",
                    timestamp: Date.now(),
                }),
            );

        expect(Option.getOrElse(state.latestDraft, () => "")).toBe("Second draft");
        expect(state.iterationCount).toBe(2);
    });

    test("latestFeedback returns AI critique when not approved", () => {
        const state = WorkflowState.empty
            .add(
                new DraftGenerated({
                    cycle: 1,
                    content: "First draft",
                    timestamp: Date.now(),
                }),
            )
            .add(
                new ReviewCompleted({
                    cycle: 1,
                    approved: false,
                    critique: "Needs more examples",
                    reasoning: "Analysis",
                    timestamp: Date.now(),
                }),
            );

        expect(Option.getOrElse(state.latestFeedback, () => "")).toBe("Needs more examples");
    });

    test("latestFeedback returns user comment when user rejects", () => {
        const state = WorkflowState.empty
            .add(
                new DraftGenerated({
                    cycle: 1,
                    content: "First draft",
                    timestamp: Date.now(),
                }),
            )
            .add(
                new ReviewCompleted({
                    cycle: 1,
                    approved: true,
                    critique: "",
                    reasoning: "Looks good",
                    timestamp: Date.now(),
                }),
            )
            .add(
                new UserFeedback({
                    action: "reject",
                    comment: "Make it more formal",
                    timestamp: Date.now(),
                }),
            );

        expect(Option.getOrElse(state.latestFeedback, () => "")).toBe("Make it more formal");
    });

    test("latestFeedback returns default message when user rejects without comment", () => {
        const state = WorkflowState.empty
            .add(
                new DraftGenerated({
                    cycle: 1,
                    content: "First draft",
                    timestamp: Date.now(),
                }),
            )
            .add(
                new ReviewCompleted({
                    cycle: 1,
                    approved: true,
                    critique: "",
                    reasoning: "Looks good",
                    timestamp: Date.now(),
                }),
            )
            .add(
                new UserFeedback({
                    action: "reject",
                    timestamp: Date.now(),
                }),
            );

        expect(Option.getOrElse(state.latestFeedback, () => "")).toBe("Please revise based on user request.");
    });

    test("isApproved is true when AI review approves", () => {
        const state = WorkflowState.empty
            .add(
                new DraftGenerated({
                    cycle: 1,
                    content: "First draft",
                    timestamp: Date.now(),
                }),
            )
            .add(
                new ReviewCompleted({
                    cycle: 1,
                    approved: true,
                    critique: "",
                    reasoning: "Perfect",
                    timestamp: Date.now(),
                }),
            );

        expect(state.isApproved).toBe(true);
    });

    test("isApproved is true when user approves", () => {
        const state = WorkflowState.empty
            .add(
                new DraftGenerated({
                    cycle: 1,
                    content: "First draft",
                    timestamp: Date.now(),
                }),
            )
            .add(
                new ReviewCompleted({
                    cycle: 1,
                    approved: true,
                    critique: "",
                    reasoning: "Looks good",
                    timestamp: Date.now(),
                }),
            )
            .add(
                new UserFeedback({
                    action: "approve",
                    timestamp: Date.now(),
                }),
            );

        expect(state.isApproved).toBe(true);
    });

    test("isApproved is false after user rejection", () => {
        const state = WorkflowState.empty
            .add(
                new DraftGenerated({
                    cycle: 1,
                    content: "First draft",
                    timestamp: Date.now(),
                }),
            )
            .add(
                new ReviewCompleted({
                    cycle: 1,
                    approved: true,
                    critique: "",
                    reasoning: "Looks good",
                    timestamp: Date.now(),
                }),
            )
            .add(
                new UserFeedback({
                    action: "reject",
                    comment: "Needs work",
                    timestamp: Date.now(),
                }),
            );

        expect(state.isApproved).toBe(false);
    });

    test("immutability - add returns a new state instance", () => {
        const state1 = WorkflowState.empty;
        const state2 = state1.add(
            new DraftGenerated({
                cycle: 1,
                content: "Draft",
                timestamp: Date.now(),
            }),
        );

        expect(state1).not.toBe(state2);
        expect(state1.iterationCount).toBe(0);
        expect(state2.iterationCount).toBe(1);
    });

    test("latestReview returns the most recent review", () => {
        const review = new ReviewCompleted({
            cycle: 1,
            approved: false,
            critique: "Test critique",
            reasoning: "Test reasoning",
            timestamp: 12345,
        });

        const state = WorkflowState.empty
            .add(
                new DraftGenerated({
                    cycle: 1,
                    content: "Draft",
                    timestamp: Date.now(),
                }),
            )
            .add(review);

        const latestReview = Option.getOrNull(state.latestReview);
        expect(latestReview).not.toBeNull();
        expect(latestReview?.critique).toBe("Test critique");
        expect(latestReview?.approved).toBe(false);
    });

    test("full workflow cycle - draft, reject, revise, approve", () => {
        let state = WorkflowState.empty;

        // Cycle 1: Initial draft
        state = state.add(
            new DraftGenerated({
                cycle: 1,
                content: "Initial draft content",
                timestamp: Date.now(),
            }),
        );
        expect(state.iterationCount).toBe(1);

        // AI rejects
        state = state.add(
            new ReviewCompleted({
                cycle: 1,
                approved: false,
                critique: "Too short",
                reasoning: "Analysis",
                timestamp: Date.now(),
            }),
        );
        expect(state.isApproved).toBe(false);
        expect(Option.getOrElse(state.latestFeedback, () => "")).toBe("Too short");

        // Cycle 2: Revised draft
        state = state.add(
            new DraftGenerated({
                cycle: 2,
                content: "Expanded draft with more content",
                timestamp: Date.now(),
            }),
        );
        expect(state.iterationCount).toBe(2);
        expect(Option.getOrElse(state.latestDraft, () => "")).toBe("Expanded draft with more content");

        // AI approves
        state = state.add(
            new ReviewCompleted({
                cycle: 2,
                approved: true,
                critique: "",
                reasoning: "Good",
                timestamp: Date.now(),
            }),
        );
        expect(state.isApproved).toBe(true);

        // User also approves
        state = state.add(
            new UserFeedback({
                action: "approve",
                timestamp: Date.now(),
            }),
        );
        expect(state.isApproved).toBe(true);
    });
});
