import { Stream } from "effect";
import type { Replacer } from ".";

export const TrimmedBoundaryReplacer: Replacer = (content, find) =>
    Stream.fromIterable(
        (function* () {
            const trimmedFind = find.trim();

            if (trimmedFind === find) {
                // Already trimmed, no point in trying
                return;
            }

            // Try to find the trimmed version
            if (content.includes(trimmedFind)) {
                yield trimmedFind;
            }

            // Also try finding blocks where trimmed content matches
            const lines = content.split("\n");
            const findLines = find.split("\n");

            for (let i = 0; i <= lines.length - findLines.length; i++) {
                const block = lines.slice(i, i + findLines.length).join("\n");

                if (block.trim() === trimmedFind) {
                    yield block;
                }
            }
        })(),
    );
