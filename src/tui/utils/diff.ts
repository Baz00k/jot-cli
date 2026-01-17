import { Chunk } from "effect";
import type { FilePatch } from "@/domain/vfs";

export function formatFilePatch(patch: FilePatch): string {
    return Chunk.toReadonlyArray(patch.hunks)
        .map((hunk) => hunk.content)
        .join("");
}

export function formatDiffs(diffs: ReadonlyArray<FilePatch>): string {
    return diffs.map(formatFilePatch).join("\n");
}
