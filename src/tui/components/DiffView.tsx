import { parseColor, type SyntaxStyle } from "@opentui/core";
import { type PromptContext, useDialog, useDialogKeyboard } from "@opentui-ui/dialog/react";
import { Chunk } from "effect";
import { useState } from "react";
import type { DiffHunk, FilePatch } from "@/domain/vfs";
import { useTextBuffer } from "@/tui/hooks/useTextBuffer";
import { Keymap } from "@/tui/keyboard/keymap";

export interface DiffTheme {
    name: string;
    backgroundColor: string;
    borderColor: string;
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
    defaultFg: string;
    syntaxStyle: Parameters<typeof SyntaxStyle.fromStyles>[0];
}

export const themes: [DiffTheme, ...DiffTheme[]] = [
    {
        name: "GitHub Dark",
        backgroundColor: "#0D1117",
        borderColor: "#4ECDC4",
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
        defaultFg: "#E6EDF3",
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
    {
        name: "Monokai",
        backgroundColor: "#272822",
        borderColor: "#FD971F",
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
        defaultFg: "#F8F8F2",
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
    {
        name: "Dracula",
        backgroundColor: "#282A36",
        borderColor: "#BD93F9",
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
        defaultFg: "#F8F8F2",
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
];

interface DiffViewProps {
    patches: ReadonlyArray<FilePatch>;
    filetype: string;
    theme: DiffTheme;
    view: "unified" | "split";
    showLineNumbers: boolean;
    wrapMode: "none" | "word";
}

export function DiffView({ patches, theme, view, showLineNumbers, wrapMode }: DiffViewProps) {
    return (
        <box
            style={{
                backgroundColor: theme.backgroundColor,
                flexGrow: 1,
                flexDirection: "column",
            }}
        >
            {patches.map((patch) => (
                <FilePatchView
                    key={patch.path}
                    patch={patch}
                    theme={theme}
                    showLineNumbers={showLineNumbers}
                    wrapMode={wrapMode}
                    view={view}
                />
            ))}
        </box>
    );
}

interface FilePatchViewProps {
    patch: FilePatch;
    theme: DiffTheme;
    showLineNumbers: boolean;
    wrapMode: "none" | "word";
    view: "unified" | "split";
}

function FilePatchView({ patch, theme, showLineNumbers }: FilePatchViewProps) {
    const hunks = Chunk.toReadonlyArray(patch.hunks);

    return (
        <box style={{ flexDirection: "column", marginBottom: 1 }}>
            <box style={{ backgroundColor: theme.lineNumberBg, paddingLeft: 1, paddingRight: 1, marginBottom: 0 }}>
                <text style={{ fg: theme.borderColor }}>
                    {patch.path} {patch.isNew ? "(New)" : patch.isDeleted ? "(Deleted)" : ""}
                </text>
            </box>
            {hunks.map((hunk, i) => (
                <HunkView key={`${patch.path}-hunk-${i}`} hunk={hunk} theme={theme} showLineNumbers={showLineNumbers} />
            ))}
        </box>
    );
}

function HunkView({ hunk, theme, showLineNumbers }: { hunk: DiffHunk; theme: DiffTheme; showLineNumbers: boolean }) {
    const lines = hunk.content.split("\n");
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;

    return (
        <box style={{ flexDirection: "column" }}>
            {lines.map((line, i) => {
                if (line.length === 0) return null;
                const isAdd = line.startsWith("+");
                const isRem = line.startsWith("-");
                const isHeader = line.startsWith("@@");

                let currentOld = "";
                let currentNew = "";

                if (!isHeader) {
                    if (isAdd) {
                        currentNew = String(newLine++);
                    } else if (isRem) {
                        currentOld = String(oldLine++);
                    } else {
                        currentOld = String(oldLine++);
                        currentNew = String(newLine++);
                    }
                }

                const bgColor = isAdd
                    ? theme.addedBg
                    : isRem
                      ? theme.removedBg
                      : isHeader
                        ? theme.lineNumberBg
                        : theme.backgroundColor;
                const fgColor = isAdd
                    ? theme.addedSignColor
                    : isRem
                      ? theme.removedSignColor
                      : isHeader
                        ? theme.borderColor
                        : theme.defaultFg;

                return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no unique id
                    <box key={i} style={{ flexDirection: "row", backgroundColor: bgColor }}>
                        {showLineNumbers && !isHeader && (
                            <box style={{ width: 10, marginRight: 1, flexDirection: "row" }}>
                                <box style={{ width: 4, justifyContent: "flex-end" }}>
                                    <text style={{ fg: theme.lineNumberFg }}>{currentOld}</text>
                                </box>
                                <box style={{ width: 2, justifyContent: "center" }}>
                                    <text style={{ fg: theme.lineNumberFg }}>│</text>
                                </box>
                                <box style={{ width: 4, justifyContent: "flex-end" }}>
                                    <text style={{ fg: theme.lineNumberFg }}>{currentNew}</text>
                                </box>
                            </box>
                        )}
                        <text style={{ fg: fgColor }}>{line}</text>
                    </box>
                );
            })}
        </box>
    );
}

interface DiffReviewModalProps extends PromptContext<void> {
    patches: ReadonlyArray<FilePatch>;
    onApprove: () => void;
    onReject: (comment?: string) => void;
}

export function DiffReviewModal({ dialogId, dismiss, patches, onApprove, onReject }: DiffReviewModalProps) {
    const dialog = useDialog();
    const [themeIndex, setThemeIndex] = useState(0);
    const [view, setView] = useState<"unified" | "split">("unified");
    const [showLineNumbers, setShowLineNumbers] = useState(true);
    const [wrapMode, setWrapMode] = useState<"none" | "word">("none");
    const [rejectMode, setRejectMode] = useState(false);

    const theme = themes[themeIndex % themes.length] ?? themes[0];

    useDialogKeyboard((key) => {
        if (rejectMode) {
            return;
        }

        if (key.raw === Keymap.Global.Help.name) {
            return;
        }

        if (key.name === Keymap.DiffView.ToggleView.name && !key.ctrl && !key.meta) {
            setView((prev) => (prev === "unified" ? "split" : "unified"));
        } else if (key.name === Keymap.DiffView.ToggleLineNumbers.name && !key.ctrl && !key.meta) {
            setShowLineNumbers((prev) => !prev);
        } else if (key.name === Keymap.DiffView.ToggleWrap.name && !key.ctrl && !key.meta) {
            setWrapMode((prev) => (prev === "none" ? "word" : "none"));
        } else if (key.name === Keymap.DiffView.CycleTheme.name && !key.ctrl && !key.meta) {
            setThemeIndex((prev) => (prev + 1) % themes.length);
        } else if (key.name === Keymap.Feedback.Approve.name && !key.ctrl && !key.meta) {
            onApprove();
            dismiss();
        } else if (key.name === Keymap.Feedback.Reject.name && !key.ctrl && !key.meta) {
            setRejectMode(true);
            dialog.prompt({
                content: (ctx) => (
                    <RejectInput
                        {...ctx}
                        onSubmit={(reason) => {
                            onReject(reason);
                            dismiss();
                        }}
                    />
                ),
                size: "small",
            });
        } else if (key.name === Keymap.Global.Exit.name && key.ctrl) {
            dismiss();
        }
    }, dialogId);

    return (
        <box style={{ flexDirection: "column", height: "100%", width: "100%" }}>
            <box
                title={`Review Changes - ${theme.name}`}
                titleAlignment="center"
                style={{
                    height: 3,
                    border: true,
                    borderStyle: "double",
                    borderColor: theme.borderColor,
                    backgroundColor: theme.backgroundColor,
                    flexShrink: 0,
                }}
            >
                <text
                    content={`[${Keymap.Feedback.Approve.label}]Approve [${Keymap.Feedback.Reject.label}]Reject | [${Keymap.DiffView.ToggleView.label}]View [${Keymap.DiffView.ToggleLineNumbers.label}]LineNums [${Keymap.DiffView.CycleTheme.label}]Theme`}
                    style={{ fg: "#888888" }}
                />
            </box>

            <DiffView
                patches={patches}
                filetype="typescript"
                theme={theme}
                view={view}
                showLineNumbers={showLineNumbers}
                wrapMode={wrapMode}
            />
        </box>
    );
}

function RejectInput({ dialogId, dismiss, onSubmit }: PromptContext<void> & { onSubmit: (text: string) => void }) {
    const buffer = useTextBuffer("");

    useDialogKeyboard((key) => {
        if (key.name === "return") {
            onSubmit(buffer.text);
            dismiss();
        } else if (key.name === "escape") {
            dismiss();
        } else if (key.name === "backspace") {
            buffer.deleteBack();
        } else if (key.name?.length === 1 && !key.ctrl && !key.meta) {
            buffer.insert(key.name);
        }
    }, dialogId);

    return (
        <box style={{ flexDirection: "column", gap: 1 }}>
            <text>Reason for rejection:</text>
            <box style={{ border: true, height: 3 }}>
                <text>{buffer.text}</text>
            </box>
            <text fg="gray">Enter: Submit | Esc: Cancel</text>
        </box>
    );
}
