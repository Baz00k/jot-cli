import { describe, expect, test } from "bun:test";
import { getModelSettings, type ModelSettings } from "@/domain/model-settings";

describe("getModelSettings", () => {
    describe("Exact Matches", () => {
        const config: Record<string, ModelSettings> = {
            "exact-model": { temperature: 0.5 },
            "other-model": { temperature: 0.9 },
        };

        test("should return settings for exact match", () => {
            const settings = getModelSettings("exact-model", undefined, config);
            expect(settings).toEqual({ temperature: 0.5 });
        });

        test("should return empty object for no match", () => {
            const settings = getModelSettings("unknown-model", undefined, config);
            expect(settings).toEqual({});
        });
    });

    describe("Pattern Matching", () => {
        const config: Record<string, ModelSettings> = {
            "*qwen*": { temperature: 0.1 },
            "*gemini*": { temperature: 0.2 },
        };

        test("should match wildcard patterns", () => {
            expect(getModelSettings("alibaba/qwen-plus", undefined, config)).toEqual({ temperature: 0.1 });
            expect(getModelSettings("google/gemini-pro", undefined, config)).toEqual({ temperature: 0.2 });
        });
    });

    describe("Provider Ignoring", () => {
        const config: Record<string, ModelSettings> = {
            "qwen*": { temperature: 0.3 },
        };

        test("should match when provider is stripped", () => {
            // "alibaba/qwen-plus" -> candidates ["alibaba/qwen-plus", "qwen-plus"]
            // "qwen-plus" matches "qwen*"
            expect(getModelSettings("alibaba/qwen-plus", undefined, config)).toEqual({ temperature: 0.3 });
        });
    });

    describe("Specificity Ordering", () => {
        const config: Record<string, ModelSettings> = {
            "model-v2*": { temperature: 0.5 },
            "model-v2.1*": { temperature: 0.9 },
        };

        test("should prefer longer (more specific) patterns", () => {
            // "model-v2.1" matches both, but should pick specific
            expect(getModelSettings("model-v2.1", undefined, config)).toEqual({ temperature: 0.9 });
        });

        test("should fallback to general pattern if specific doesn't match", () => {
            expect(getModelSettings("model-v2.0", undefined, config)).toEqual({ temperature: 0.5 });
        });
    });

    describe("Role-Based Overrides", () => {
        const config: Record<string, ModelSettings> = {
            "test-model": {
                temperature: 0.5,
                topP: 0.9,
                writer: { temperature: 0.8 },
                reviewer: { topP: 0.1 },
            },
        };

        test("should return base settings when no role specified", () => {
            expect(getModelSettings("test-model", undefined, config)).toEqual({
                temperature: 0.5,
                topP: 0.9,
            });
        });

        test("should override settings for writer role", () => {
            expect(getModelSettings("test-model", "writer", config)).toEqual({
                temperature: 0.8, // Overridden
                topP: 0.9, // Inherited
            });
        });

        test("should override settings for reviewer role", () => {
            expect(getModelSettings("test-model", "reviewer", config)).toEqual({
                temperature: 0.5, // Inherited
                topP: 0.1, // Overridden
            });
        });
    });
});
