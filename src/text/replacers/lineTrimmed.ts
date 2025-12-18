import { Stream } from "effect";
import type { Replacer } from ".";

export const LineTrimmedReplacer: Replacer = (content, find) =>
    Stream.fromIterable(
        (function* () {
            const originalLines = content.split("\n");
            const searchLines = find.split("\n");

            if (searchLines[searchLines.length - 1] === "") {
                searchLines.pop();
            }

            for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
                let matches = true;

                for (let j = 0; j < searchLines.length; j++) {
                    const originalTrimmed = originalLines[i + j]?.trim();
                    const searchTrimmed = searchLines[j]?.trim();

                    if (originalTrimmed !== searchTrimmed) {
                        matches = false;
                        break;
                    }
                }

                if (matches) {
                    let matchStartIndex = 0;
                    for (let k = 0; k < i; k++) {
                        // biome-ignore lint/style/noNonNullAssertion: k < i < originalLines.length
                        matchStartIndex += originalLines[k]!.length + 1;
                    }

                    let matchEndIndex = matchStartIndex;
                    for (let k = 0; k < searchLines.length; k++) {
                        // biome-ignore lint/style/noNonNullAssertion: i+k valid
                        matchEndIndex += originalLines[i + k]!.length;
                        if (k < searchLines.length - 1) {
                            matchEndIndex += 1; // Add newline character except for the last line
                        }
                    }

                    yield content.substring(matchStartIndex, matchEndIndex);
                }
            }
        })(),
    );
