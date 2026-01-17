import { type Chunk, Data, type Option } from "effect";

// Represents a single file change
export class VirtualFile extends Data.Class<{
    readonly path: string;
    readonly content: string;
    /** None if new file */
    readonly originalContent: Option.Option<string>;
    readonly timestamp: number;
}> {}

export class DiffHunk extends Data.Class<{
    readonly oldStart: number;
    readonly oldLines: number;
    readonly newStart: number;
    readonly newLines: number;
    /** Unified diff format */
    readonly content: string;
}> {}

/** A patch/diff representation */
export class FilePatch extends Data.Class<{
    readonly path: string;
    readonly hunks: Chunk.Chunk<DiffHunk>;
    readonly isNew: boolean;
    readonly isDeleted: boolean;
}> {}

/** Reviewer comments attached to specific files/lines */
export class ReviewComment extends Data.Class<{
    readonly id: string;
    readonly path: string;
    /** None = file-level comment */
    readonly line: Option.Option<number>;
    readonly content: string;
    readonly timestamp: number;
}> {}

export class VFSSummary extends Data.Class<{
    readonly fileCount: number;
    readonly files: ReadonlyArray<string>;
    readonly commentCount: number;
}> {}
