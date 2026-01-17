import { SyntaxStyle } from "@opentui/core";
import { useMemo } from "react";
import type { DiffTheme } from "@/tui/theme";

interface DiffViewProps {
    diff: string;
    filetype: string;
    theme: DiffTheme;
    view: "unified" | "split";
    showLineNumbers: boolean;
    wrapMode: "none" | "word";
}

export function DiffView({ diff, filetype, theme, view, showLineNumbers, wrapMode = "word" }: DiffViewProps) {
    const syntaxStyle = useMemo(() => SyntaxStyle.fromStyles(theme.syntaxStyle), [theme]);

    return (
        <diff
            diff={diff}
            view={view}
            filetype={filetype}
            syntaxStyle={syntaxStyle}
            showLineNumbers={showLineNumbers}
            wrapMode={wrapMode}
            addedBg={theme.addedBg}
            removedBg={theme.removedBg}
            contextBg={theme.contextBg}
            addedSignColor={theme.addedSignColor}
            removedSignColor={theme.removedSignColor}
            lineNumberFg={theme.lineNumberFg}
            lineNumberBg={theme.lineNumberBg}
            addedLineNumberBg={theme.addedLineNumberBg}
            removedLineNumberBg={theme.removedLineNumberBg}
            selectionBg={theme.selectionBg}
            selectionFg={theme.selectionFg}
            style={{
                width: "100%",
            }}
        />
    );
}
