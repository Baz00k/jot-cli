import { Schema } from "effect";

const BaseSettingsFields = {
    temperature: Schema.optional(Schema.Number),
    topP: Schema.optional(Schema.Number),
    topK: Schema.optional(Schema.Number),
    frequencyPenalty: Schema.optional(Schema.Number),
    presencePenalty: Schema.optional(Schema.Number),
};

export const BaseModelSettings = Schema.Struct(BaseSettingsFields);
export type BaseModelSettings = Schema.Schema.Type<typeof BaseModelSettings>;

export const ModelSettings = Schema.Struct({
    ...BaseSettingsFields,
    writer: Schema.optional(BaseModelSettings),
    reviewer: Schema.optional(BaseModelSettings),
});

export type ModelSettings = Schema.Schema.Type<typeof ModelSettings>;

export const MODEL_SPECIFIC_SETTINGS: Record<string, ModelSettings> = {
    "gemini*": {
        topP: 0.95,
        topK: 64,
        writer: {
            temperature: 1,
        },
    },
    "antigravity-gemini*": {
        topP: 0.95,
        topK: 64,
        writer: {
            temperature: 1,
        },
    },
    "antigravity-claude*": {
        writer: {
            temperature: 1,
        },
    },
    "glm-4.*": {
        writer: {
            temperature: 1,
        },
    },
    "kimi-k2-thinking": {
        writer: {
            temperature: 1,
        },
    },
};

/**
 * Matches a model name against a pattern.
 * Supports simple wildcards (*)
 */
const matchesPattern = (pattern: string, modelName: string): boolean => {
    if (pattern === modelName) return true;
    if (!pattern.includes("*")) return false;

    // Escape special regex characters except *
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    // Replace * with .*
    const regexStr = `^${escaped.replace(/\*/g, ".*")}$`;
    const regex = new RegExp(regexStr);
    return regex.test(modelName);
};

/**
 * Gets model specific settings based on the model name and role.
 */
export const getModelSettings = (
    modelName: string,
    role?: "writer" | "reviewer",
    config: Record<string, ModelSettings> = MODEL_SPECIFIC_SETTINGS,
): BaseModelSettings => {
    let settings: ModelSettings | undefined;

    // 1. Exact match has highest priority
    if (config[modelName]) {
        settings = config[modelName];
    } else {
        // Prepare candidate names: full name and name without provider
        const candidates = [modelName];
        if (modelName.includes("/")) {
            const nameWithoutProvider = modelName.split("/")[1];
            if (nameWithoutProvider) {
                candidates.push(nameWithoutProvider);
            }
        }

        // 2. Pattern match with deterministic ordering (Specific -> General)
        const patterns = Object.keys(config).sort((a, b) => b.length - a.length);

        for (const pattern of patterns) {
            for (const candidate of candidates) {
                if (matchesPattern(pattern, candidate)) {
                    settings = config[pattern];
                    break;
                }
            }
            if (settings) break;
        }
    }

    if (!settings) return {};

    // Merge base settings with role-specific settings
    const { writer: _w, reviewer: _r, ...base } = settings;
    const roleSettings = role ? settings[role] : undefined;

    return {
        ...base,
        ...roleSettings,
    };
};
