import { Stream } from "effect";
import type { Replacer } from ".";

export const EscapeNormalizedReplacer: Replacer = (content, find) =>
    Stream.fromIterable(
        (function* () {
            const unescapeString = (str: string): string => {
                return str.replace(/\\(n|t|r|'|"|`|\\|\n|\$)/g, (match, capturedChar) => {
                    switch (capturedChar) {
                        case "n":
                            return "\n";
                        case "t":
                            return "\t";
                        case "r":
                            return "\r";
                        case "'":
                            return "'";
                        case '"':
                            return '"';
                        case "`":
                            return "`";
                        case "\\":
                            return "\\";
                        case "\n":
                            return "\n";
                        case "$":
                            return "$";
                        default:
                            return match;
                    }
                });
            };

            const unescapedFind = unescapeString(find);

            // Try direct match with unescaped find string
            if (content.includes(unescapedFind)) {
                yield unescapedFind;
            }

            // Also try finding escaped versions in content that match unescaped find
            const lines = content.split("\n");
            const findLines = unescapedFind.split("\n");

            for (let i = 0; i <= lines.length - findLines.length; i++) {
                const block = lines.slice(i, i + findLines.length).join("\n");
                const unescapedBlock = unescapeString(block);

                if (unescapedBlock === unescapedFind) {
                    yield block;
                }
            }
        })(),
    );
