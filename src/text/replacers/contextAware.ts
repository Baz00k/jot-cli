import { Stream } from "effect";
import type { Replacer } from ".";

export const ContextAwareReplacer: Replacer = (content, find) =>
    Stream.fromIterable(
        (function* () {
            const findLines = find.split("\n");
            if (findLines.length < 3) {
                // Need at least 3 lines to have meaningful context
                return;
            }

            // Remove trailing empty line if present
            if (findLines[findLines.length - 1] === "") {
                findLines.pop();
            }

            const contentLines = content.split("\n");

            // Extract first and last lines as context anchors
            const firstLine = findLines[0]?.trim();
            const lastLine = findLines[findLines.length - 1]?.trim();

            if (firstLine === undefined || lastLine === undefined) return;

            // Find blocks that start and end with the context anchors
            for (let i = 0; i < contentLines.length; i++) {
                if (contentLines[i]?.trim() !== firstLine) continue;

                // Look for the matching last line
                for (let j = i + 2; j < contentLines.length; j++) {
                    if (contentLines[j]?.trim() === lastLine) {
                        // Found a potential context block
                        const blockLines = contentLines.slice(i, j + 1);
                        const block = blockLines.join("\n");

                        // Check if the middle content has reasonable similarity
                        // (simple heuristic: at least 50% of non-empty lines should match when trimmed)
                        if (blockLines.length === findLines.length) {
                            let matchingLines = 0;
                            let totalNonEmptyLines = 0;

                            for (let k = 1; k < blockLines.length - 1; k++) {
                                const blockLine = blockLines[k]?.trim();
                                const findLine = findLines[k]?.trim();

                                if (
                                    blockLine !== undefined &&
                                    findLine !== undefined &&
                                    (blockLine.length > 0 || findLine.length > 0)
                                ) {
                                    totalNonEmptyLines++;
                                    if (blockLine === findLine) {
                                        matchingLines++;
                                    }
                                }
                            }

                            if (totalNonEmptyLines === 0 || matchingLines / totalNonEmptyLines >= 0.5) {
                                yield block;
                                break; // Only match the first occurrence
                            }
                        }
                        break;
                    }
                }
            }
        })(),
    );
