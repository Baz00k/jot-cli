import { parseColor, type SyntaxStyle } from "@opentui/core";

export interface Theme {
    name: string;

    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    borderColor: string;

    textColor: string;
    mutedColor: string;

    successColor: string;
    errorColor: string;
    warningColor: string;

    diff: {
        addedBg: string;
        removedBg: string;
        contextBg: string;
        addedSignColor: string;
        removedSignColor: string;
        lineNumberFg: string;
        lineNumberBg: string;
        addedLineNumberBg: string;
        removedLineNumberBg: string;
        selectionBg: string;
        selectionFg: string;
        syntaxStyle: Parameters<typeof SyntaxStyle.fromStyles>[0];
    };
}

export type DiffTheme = Theme["diff"];

export const themes: [Theme, ...Theme[]] = [
    {
        name: "GitHub Dark",
        primaryColor: "#58A6FF",
        secondaryColor: "#BC8CFF",
        backgroundColor: "#0D1117",
        borderColor: "#30363D",
        textColor: "#C9D1D9",
        mutedColor: "#8B949E",
        successColor: "green",
        errorColor: "red",
        warningColor: "yellow",

        diff: {
            addedBg: "#1a4d1a",
            removedBg: "#4d1a1a",
            contextBg: "transparent",
            addedSignColor: "#22c55e",
            removedSignColor: "#ef4444",
            lineNumberFg: "#6b7280",
            lineNumberBg: "#161b22",
            addedLineNumberBg: "#0d3a0d",
            removedLineNumberBg: "#3a0d0d",
            selectionBg: "#264F78",
            selectionFg: "#FFFFFF",
            syntaxStyle: {
                keyword: { fg: parseColor("#FF7B72"), bold: true },
                "keyword.import": { fg: parseColor("#FF7B72"), bold: true },
                string: { fg: parseColor("#A5D6FF") },
                comment: { fg: parseColor("#8B949E"), italic: true },
                number: { fg: parseColor("#79C0FF") },
                boolean: { fg: parseColor("#79C0FF") },
                constant: { fg: parseColor("#79C0FF") },
                function: { fg: parseColor("#D2A8FF") },
                "function.call": { fg: parseColor("#D2A8FF") },
                constructor: { fg: parseColor("#FFA657") },
                type: { fg: parseColor("#FFA657") },
                operator: { fg: parseColor("#FF7B72") },
                variable: { fg: parseColor("#E6EDF3") },
                property: { fg: parseColor("#79C0FF") },
                bracket: { fg: parseColor("#F0F6FC") },
                punctuation: { fg: parseColor("#F0F6FC") },
                default: { fg: parseColor("#E6EDF3") },
            },
        },
    },
    {
        name: "Monokai",
        primaryColor: "#ff6188",
        secondaryColor: "#a9dc76",
        backgroundColor: "#2d2a2e",
        borderColor: "#c1c0c0",
        textColor: "#fcfcfa",
        mutedColor: "#727072",
        successColor: "#A6E22E",
        errorColor: "#F92672",
        warningColor: "#FD971F",

        diff: {
            addedBg: "#2d4a2b",
            removedBg: "#4a2b2b",
            contextBg: "transparent",
            addedSignColor: "#A6E22E",
            removedSignColor: "#F92672",
            lineNumberFg: "#75715E",
            lineNumberBg: "#1e1f1c",
            addedLineNumberBg: "#1e3a1e",
            removedLineNumberBg: "#3a1e1e",
            selectionBg: "#49483E",
            selectionFg: "#F8F8F2",
            syntaxStyle: {
                keyword: { fg: parseColor("#F92672"), bold: true },
                "keyword.import": { fg: parseColor("#F92672"), bold: true },
                string: { fg: parseColor("#E6DB74") },
                comment: { fg: parseColor("#75715E"), italic: true },
                number: { fg: parseColor("#AE81FF") },
                boolean: { fg: parseColor("#AE81FF") },
                constant: { fg: parseColor("#AE81FF") },
                function: { fg: parseColor("#A6E22E") },
                "function.call": { fg: parseColor("#A6E22E") },
                constructor: { fg: parseColor("#FD971F") },
                type: { fg: parseColor("#66D9EF") },
                operator: { fg: parseColor("#F92672") },
                variable: { fg: parseColor("#F8F8F2") },
                property: { fg: parseColor("#66D9EF") },
                bracket: { fg: parseColor("#F8F8F2") },
                punctuation: { fg: parseColor("#F8F8F2") },
                default: { fg: parseColor("#F8F8F2") },
            },
        },
    },
    {
        name: "Dracula",
        primaryColor: "#BD93F9",
        secondaryColor: "#FF79C6",
        backgroundColor: "#282A36",
        borderColor: "#6272A4",
        textColor: "#F8F8F2",
        mutedColor: "#6272A4",
        successColor: "#50FA7B",
        errorColor: "#FF5555",
        warningColor: "#FFB86C",

        diff: {
            addedBg: "#2d4737",
            removedBg: "#4d2d37",
            contextBg: "transparent",
            addedSignColor: "#50FA7B",
            removedSignColor: "#FF5555",
            lineNumberFg: "#6272A4",
            lineNumberBg: "#21222C",
            addedLineNumberBg: "#1f3626",
            removedLineNumberBg: "#3a2328",
            selectionBg: "#44475A",
            selectionFg: "#F8F8F2",
            syntaxStyle: {
                keyword: { fg: parseColor("#FF79C6"), bold: true },
                "keyword.import": { fg: parseColor("#FF79C6"), bold: true },
                string: { fg: parseColor("#F1FA8C") },
                comment: { fg: parseColor("#6272A4"), italic: true },
                number: { fg: parseColor("#BD93F9") },
                boolean: { fg: parseColor("#BD93F9") },
                constant: { fg: parseColor("#BD93F9") },
                function: { fg: parseColor("#50FA7B") },
                "function.call": { fg: parseColor("#50FA7B") },
                constructor: { fg: parseColor("#FFB86C") },
                type: { fg: parseColor("#8BE9FD") },
                operator: { fg: parseColor("#FF79C6") },
                variable: { fg: parseColor("#F8F8F2") },
                property: { fg: parseColor("#8BE9FD") },
                bracket: { fg: parseColor("#F8F8F2") },
                punctuation: { fg: parseColor("#F8F8F2") },
                default: { fg: parseColor("#F8F8F2") },
            },
        },
    },
];
