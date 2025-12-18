import { levenshtein } from "@/text/utils";
import { Stream } from "effect";
import type { Replacer } from ".";

const SINGLE_CANDIDATE_SIMILARITY_THRESHOLD = 0.0;
const MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD = 0.3;

export const BlockAnchorReplacer: Replacer = (content, find) =>
    Stream.fromIterable(
        (function* () {
            const originalLines = content.split("\n");
            const searchLines = find.split("\n");

            if (searchLines.length < 3) {
                return;
            }

            if (searchLines[searchLines.length - 1] === "") {
                searchLines.pop();
            }

            const firstLineSearch = searchLines[0]?.trim();
            const lastLineSearch = searchLines[searchLines.length - 1]?.trim();
            const searchBlockSize = searchLines.length;

            if (firstLineSearch === undefined || lastLineSearch === undefined) return;

            // Collect all candidate positions where both anchors match
            const candidates: Array<{ startLine: number; endLine: number }> = [];
            for (let i = 0; i < originalLines.length; i++) {
                if (originalLines[i]?.trim() !== firstLineSearch) {
                    continue;
                }

                // Look for the matching last line after this first line
                for (let j = i + 2; j < Math.min(originalLines.length, i + searchBlockSize * 2); j++) {
                    if (originalLines[j]?.trim() === lastLineSearch) {
                        candidates.push({ startLine: i, endLine: j });
                        break; // Only match the first occurrence of the last line
                    }
                }
            }

            // Return immediately if no candidates
            if (candidates.length === 0) {
                return;
            }

            // Handle single candidate scenario (using relaxed threshold)
            if (candidates.length === 1) {
                // biome-ignore lint/style/noNonNullAssertion: guaranteed by length check
                const { startLine, endLine } = candidates[0]!;
                const actualBlockSize = endLine - startLine + 1;

                let similarity = 0;
                const linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2); // Middle lines only

                if (linesToCheck > 0) {
                    for (let j = 1; j < searchBlockSize - 1 && j < actualBlockSize - 1; j++) {
                        const originalLine = originalLines[startLine + j]?.trim();
                        const searchLine = searchLines[j]?.trim();
                        if (originalLine === undefined || searchLine === undefined) continue;

                        const maxLen = Math.max(originalLine.length, searchLine.length);
                        if (maxLen === 0) {
                            continue;
                        }
                        const distance = levenshtein(originalLine, searchLine);
                        similarity += (1 - distance / maxLen) / linesToCheck;

                        // Exit early when threshold is reached
                        if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) {
                            break;
                        }
                    }
                } else {
                    // No middle lines to compare, just accept based on anchors
                    similarity = 1.0;
                }

                if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) {
                    let matchStartIndex = 0;
                    for (let k = 0; k < startLine; k++) {
                        // biome-ignore lint/style/noNonNullAssertion: bounded loop
                        matchStartIndex += originalLines[k]!.length + 1;
                    }
                    let matchEndIndex = matchStartIndex;
                    for (let k = startLine; k <= endLine; k++) {
                        // biome-ignore lint/style/noNonNullAssertion: bounded loop
                        matchEndIndex += originalLines[k]!.length;
                        if (k < endLine) {
                            matchEndIndex += 1; // Add newline character except for the last line
                        }
                    }
                    if (content[matchEndIndex] === "\n") matchEndIndex++;
                    yield content.substring(matchStartIndex, matchEndIndex);
                }
                return;
            }

            // Calculate similarity for multiple candidates
            let bestMatch: { startLine: number; endLine: number } | null = null;
            let maxSimilarity = -1;

            for (const candidate of candidates) {
                const { startLine, endLine } = candidate;
                const actualBlockSize = endLine - startLine + 1;

                let similarity = 0;
                const linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2); // Middle lines only

                if (linesToCheck > 0) {
                    for (let j = 1; j < searchBlockSize - 1 && j < actualBlockSize - 1; j++) {
                        const originalLine = originalLines[startLine + j]?.trim();
                        const searchLine = searchLines[j]?.trim();
                        if (originalLine === undefined || searchLine === undefined) continue;

                        const maxLen = Math.max(originalLine.length, searchLine.length);
                        if (maxLen === 0) {
                            continue;
                        }
                        const distance = levenshtein(originalLine, searchLine);
                        similarity += 1 - distance / maxLen;
                    }
                    similarity /= linesToCheck; // Average similarity
                } else {
                    // No middle lines to compare, just accept based on anchors
                    similarity = 1.0;
                }

                if (similarity > maxSimilarity) {
                    maxSimilarity = similarity;
                    bestMatch = candidate;
                }
            }

            // Threshold judgment
            if (maxSimilarity >= MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD && bestMatch) {
                const { startLine, endLine } = bestMatch;
                let matchStartIndex = 0;
                for (let k = 0; k < startLine; k++) {
                    // biome-ignore lint/style/noNonNullAssertion: bounded loop
                    matchStartIndex += originalLines[k]!.length + 1;
                }
                let matchEndIndex = matchStartIndex;
                for (let k = startLine; k <= endLine; k++) {
                    // biome-ignore lint/style/noNonNullAssertion: bounded loop
                    matchEndIndex += originalLines[k]!.length;
                    if (k < endLine) {
                        matchEndIndex += 1;
                    }
                }
                if (content[matchEndIndex] === "\n") matchEndIndex++;
                yield content.substring(matchStartIndex, matchEndIndex);
            }
        })(),
    );
