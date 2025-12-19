import { Stream } from "effect";
import type { Replacer } from ".";

export const IndentationFlexibleReplacer: Replacer = (content, find) =>
    Stream.fromIterable(
        (function* () {
            const removeIndentation = (text: string) => {
                const lines = text.split("\n");
                const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
                if (nonEmptyLines.length === 0) return text;

                const minIndent = Math.min(
                    ...nonEmptyLines.map((line) => {
                        const match = line.match(/^(\s*)/);
                        // biome-ignore lint/style/noNonNullAssertion: match always returns array for this regex
                        return match ? match[1]!.length : 0;
                    }),
                );

                return lines.map((line) => (line.trim().length === 0 ? line : line.slice(minIndent))).join("\n");
            };

            const normalizedFind = removeIndentation(find);
            const contentLines = content.split("\n");
            const findLines = find.split("\n");

            for (let i = 0; i <= contentLines.length - findLines.length; i++) {
                const block = contentLines.slice(i, i + findLines.length).join("\n");
                if (removeIndentation(block) === normalizedFind) {
                    yield block;
                }
            }
        })(),
    );
