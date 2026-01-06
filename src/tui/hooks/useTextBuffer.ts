import { useCallback, useState } from "react";

interface TextBufferState {
    text: string;
    cursor: number;
}

export const useTextBuffer = (initialText = "") => {
    const [state, setState] = useState<TextBufferState>({
        text: initialText,
        cursor: initialText.length,
    });

    const insert = useCallback((char: string) => {
        setState((prev) => ({
            text: prev.text.slice(0, prev.cursor) + char + prev.text.slice(prev.cursor),
            cursor: prev.cursor + char.length,
        }));
    }, []);

    const deleteBack = useCallback(() => {
        setState((prev) => {
            if (prev.cursor === 0) return prev;
            return {
                text: prev.text.slice(0, prev.cursor - 1) + prev.text.slice(prev.cursor),
                cursor: prev.cursor - 1,
            };
        });
    }, []);

    const moveLeft = useCallback(() => {
        setState((prev) => ({
            ...prev,
            cursor: Math.max(0, prev.cursor - 1),
        }));
    }, []);

    const moveRight = useCallback(() => {
        setState((prev) => ({
            ...prev,
            cursor: Math.min(prev.text.length, prev.cursor + 1),
        }));
    }, []);

    const moveUp = useCallback(() => {
        setState((prev) => {
            const lines = prev.text.split("\n");
            let currentLineIdx = 0;
            let currentPos = 0;
            let cursorInLine = 0;

            // Find current line and cursor position within it
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line === undefined) break;

                const lineLen = line.length + 1;
                if (currentPos + lineLen > prev.cursor) {
                    currentLineIdx = i;
                    cursorInLine = prev.cursor - currentPos;
                    break;
                } else if (i === lines.length - 1) {
                    currentLineIdx = i;
                    cursorInLine = prev.cursor - currentPos;
                }
                currentPos += lineLen;
            }

            if (currentLineIdx === 0) return { ...prev, cursor: 0 };

            const targetLineIdx = currentLineIdx - 1;
            const targetLine = lines[targetLineIdx];

            if (targetLine === undefined) return prev; // Safety check

            const targetCol = Math.min(cursorInLine, targetLine.length);

            let newCursor = 0;
            for (let i = 0; i < targetLineIdx; i++) {
                const l = lines[i];
                if (l !== undefined) {
                    newCursor += l.length + 1;
                }
            }
            newCursor += targetCol;

            return { ...prev, cursor: newCursor };
        });
    }, []);

    const moveDown = useCallback(() => {
        setState((prev) => {
            const lines = prev.text.split("\n");
            let currentLineIdx = 0;
            let currentPos = 0;
            let cursorInLine = 0;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line === undefined) continue;

                const lineLen = line.length + 1;
                if (currentPos + lineLen > prev.cursor) {
                    currentLineIdx = i;
                    cursorInLine = prev.cursor - currentPos;
                    break;
                } else if (i === lines.length - 1) {
                    currentLineIdx = i;
                    cursorInLine = prev.cursor - currentPos;
                }
                currentPos += lineLen;
            }

            if (currentLineIdx === lines.length - 1) return { ...prev, cursor: prev.text.length };

            const targetLineIdx = currentLineIdx + 1;
            const targetLine = lines[targetLineIdx];

            if (targetLine === undefined) return prev;

            const targetCol = Math.min(cursorInLine, targetLine.length);

            let newCursor = 0;
            for (let i = 0; i < targetLineIdx; i++) {
                const l = lines[i];
                if (l !== undefined) {
                    newCursor += l.length + 1;
                }
            }
            newCursor += targetCol;

            return { ...prev, cursor: newCursor };
        });
    }, []);

    const clear = useCallback(() => {
        setState({ text: "", cursor: 0 });
    }, []);

    return {
        text: state.text,
        cursor: state.cursor,
        insert,
        deleteBack,
        moveLeft,
        moveRight,
        moveUp,
        moveDown,
        clear,
        setText: (text: string) => setState({ text, cursor: text.length }),
    };
};
