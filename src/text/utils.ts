import { supportsLanguage } from "cli-highlight";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { STREAM_WINDOW_SIZE } from "@/domain/constants";

const languageRemap: Record<string, string> = {
    bibtex: "latex",
};

const stripUnsupportedLanguages = (markdown: string) =>
    markdown.replace(/```(\w+)/g, (_, lang) => {
        const remappedLang = languageRemap[lang] ?? lang;
        return supportsLanguage(remappedLang) ? `\`\`\`${remappedLang}` : "```";
    });

marked.use(
    {
        hooks: {
            preprocess: stripUnsupportedLanguages,
        },
    },
    markedTerminal({
        width: Math.max(process.stdout.columns - 10, 1),
        reflowText: true,
    }),
);

/**
 * Render markdown in terminal
 */
export const renderMarkdown = (content: string) => {
    return marked.parse(content, { async: false }).trim();
};

/**
 * Render snippet of markdown in terminal
 * If text is less than 5 lines, display text in full
 * If text is longer, display first 3 lines, (...), and a last line
 */
export const renderMarkdownSnippet = (content: string) => {
    const render = renderMarkdown(content);
    const lines = render.split("\n");
    if (lines.length <= 5) {
        return render;
    }

    return `${lines.slice(0, 3).join("\n")}\n\n(...)\n\n${lines[lines.length - 1]}`;
};

export const formatWindow = (content: string) => {
    // Replace all whitespace with single spaces to ensure single-line output
    const cleanContent = content.replace(/\s+/g, " ").trim();
    if (cleanContent.length > STREAM_WINDOW_SIZE) {
        return `...${cleanContent.slice(-STREAM_WINDOW_SIZE)}`;
    }
    return cleanContent;
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
