import wrapAnsi from "wrap-ansi";
import { STREAM_WINDOW_SIZE } from "@/domain/constants";

export const formatWindow = (content: string) => {
    // Replace all whitespace with single spaces to ensure single-line output
    const cleanContent = content.replace(/\s+/g, " ").trim();
    if (cleanContent.length > STREAM_WINDOW_SIZE) {
        return `...${cleanContent.slice(-STREAM_WINDOW_SIZE)}`;
    }
    return cleanContent;
};

export const fitToTerminalWidth = (content: string) => {
    const terminalWidth = process.stdout.columns ?? 80;
    const width = Math.max(Math.round(terminalWidth * 0.8 - 2), 1);
    return wrapAnsi(content, width);
};

/**
 * Calculate levenshtein distance between two strings
 */
export function levenshtein(a: string, b: string): number {
    if (a === "" || b === "") {
        return Math.max(a.length, b.length);
    }

    const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            // biome-ignore lint/style/noNonNullAssertion: matrix is initialized with correct size
            matrix[i]![j] = Math.min(matrix[i - 1]![j]! + 1, matrix[i]![j - 1]! + 1, matrix[i - 1]![j - 1]! + cost);
        }
    }
    // biome-ignore lint/style/noNonNullAssertion: matrix is initialized with correct size
    return matrix[a.length]![b.length]!;
}
