import { Chunk } from "effect";
import type { FilePatch } from "@/domain/vfs";

export function formatFilePatch(patch: FilePatch): string {
    const oldPath = patch.isNew ? "/dev/null" : `a/${patch.path}`;
    const newPath = patch.isDeleted ? "/dev/null" : `b/${patch.path}`;
    const header = `--- ${oldPath}\n+++ ${newPath}\n`;

    const hunks = Chunk.toReadonlyArray(patch.hunks)
        .map((hunk) => hunk.content)
        .join("");

    return header + hunks;
}

export function formatDiffs(diffs: ReadonlyArray<FilePatch>): string {
    return diffs.map(formatFilePatch).join("\n");
}
