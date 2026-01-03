import { name } from "../../package.json";

export const APP_NAME = name;

export const DIR_NAME = {
    LOGS: "logs",
    SESSIONS: "sessions",
} as const;

export const DEFAULT_MODEL_WRITER = "moonshotai/kimi-k2-thinking";
export const DEFAULT_MODEL_REVIEWER = "google/gemini-3-pro-preview";

export const ANTIGRAVITY_CLIENT_ID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
export const ANTIGRAVITY_CLIENT_SECRET = "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";
export const ANTIGRAVITY_REDIRECT_URI = "http://localhost:51121/oauth-callback";
export const ANTIGRAVITY_SCOPES: readonly string[] = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cclog",
    "https://www.googleapis.com/auth/experimentsandconfigs",
];

export const MAX_STEP_COUNT = 20;

export const MAX_FULL_FILE_SIZE_KB = 100 * 1024;
export const MAX_LIST_FILE_SIZE_KB = 1024 * 1024;
export const EXCERPT_SIZE_KB = 40 * 1024;

export const STREAM_WINDOW_SIZE = 80;

export const DEFAULT_MAX_AGENT_ITERATIONS = 10;
