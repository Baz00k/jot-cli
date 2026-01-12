import { name } from "../../package.json";

export const APP_NAME = name;

export const DIR_NAME = {
    LOGS: "logs",
    SESSIONS: "sessions",
} as const;

export const DEFAULT_MODEL_WRITER = "moonshotai/kimi-k2-thinking";
export const DEFAULT_MODEL_REVIEWER = "google/gemini-3-pro-preview";

/** Maximum number of steps allowed in a single iteration */
export const MAX_STEP_COUNT = 50;

/** Maximum number of iterations on a draft before generation fails */
export const DEFAULT_MAX_AGENT_ITERATIONS = 10;

export const MAX_FULL_FILE_SIZE_KB = 100 * 1024;
export const MAX_LIST_FILE_SIZE_KB = 1024 * 1024;
export const EXCERPT_SIZE_KB = 40 * 1024;

export const STREAM_WINDOW_SIZE = 80;
