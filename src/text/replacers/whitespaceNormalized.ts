import { Stream } from "effect";
import type { Replacer } from ".";

export const WhitespaceNormalizedReplacer: Replacer = (content, find) =>
    Stream.fromIterable(
        (function* () {
            const normalizeWhitespace = (text: string) => text.replace(/\s+/g, " ").trim();
            const normalizedFind = normalizeWhitespace(find);

            // Handle single line matches
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line === undefined) continue;
                if (normalizeWhitespace(line) === normalizedFind) {
                    yield line;
                } else {
                    // Only check for substring matches if the full line doesn't match
                    const normalizedLine = normalizeWhitespace(line);
                    if (normalizedLine.includes(normalizedFind)) {
                        // Find the actual substring in the original line that matches
                        const words = find.trim().split(/\s+/);
                        if (words.length > 0) {
                            const pattern = words
                                .map((word) => word.replace(/[.*+?^${}()|[\]\\\\]/g, "\\\\$&"))
                                .join("\\s+");
                            try {
                                const regex = new RegExp(pattern);
                                const match = line.match(regex);
                                if (match) {
                                    yield match[0];
                                }
                            } catch (_e) {
                                // Invalid regex pattern, skip
                            }
                        }
                    }
                }
            }

            // Handle multi-line matches
            const findLines = find.split("\n");
            if (findLines.length > 1) {
                for (let i = 0; i <= lines.length - findLines.length; i++) {
                    const block = lines.slice(i, i + findLines.length);
                    if (normalizeWhitespace(block.join("\n")) === normalizedFind) {
                        yield block.join("\n");
                    }
                }
            }
        })(),
    );
