import { createTwoFilesPatch } from "diff";
import { Chunk, Data, Effect, HashMap, Layer, Option, Ref } from "effect";
import { VFSError } from "@/domain/errors";
import { DiffHunk, FilePatch, ReviewComment, VFSSummary, VirtualFile } from "@/domain/vfs";
import { ProjectFiles } from "@/services/project-files";
import { replace } from "@/tools/edit-file";

export class VFSState extends Data.Class<{
    readonly files: HashMap.HashMap<string, VirtualFile>;
    readonly comments: Chunk.Chunk<ReviewComment>;
    readonly decision: Option.Option<"approved" | "rejected">;
}> {
    static readonly empty = new VFSState({
        files: HashMap.empty(),
        comments: Chunk.empty(),
        decision: Option.none(),
    });
}

export class VFS extends Effect.Service<VFS>()("services/vfs", {
    effect: Effect.gen(function* () {
        const stateRef = yield* Ref.make(VFSState.empty);
        const projectFiles = yield* ProjectFiles;

        const readFile = (path: string) =>
            Effect.gen(function* () {
                const state = yield* Ref.get(stateRef);
                const staged = HashMap.get(state.files, path);
                if (Option.isSome(staged)) {
                    return staged.value.content;
                }
                return yield* projectFiles
                    .readFile(path, { disableExcerpts: true })
                    .pipe(Effect.catchTag("FileReadError", () => Effect.succeed("")));
            });

        const generateUnifiedDiff = (path: string, oldContent: string, newContent: string) =>
            Effect.sync(() => {
                const patch = createTwoFilesPatch(`a/${path}`, `b/${path}`, oldContent, newContent, "", "");

                return new FilePatch({
                    path,
                    hunks: Chunk.make(
                        new DiffHunk({
                            oldStart: 0,
                            oldLines: 0,
                            newStart: 0,
                            newLines: 0,
                            content: patch,
                        }),
                    ),
                    isNew: !oldContent && !!newContent,
                    isDeleted: !!oldContent && !newContent,
                });
            });

        return {
            writeFile: (path: string, content: string) =>
                Effect.gen(function* () {
                    const original = yield* projectFiles.readFile(path, { disableExcerpts: true }).pipe(
                        Effect.map(Option.some),
                        Effect.catchTag("FileReadError", () => Effect.succeed(Option.none())),
                    );

                    yield* Ref.update(
                        stateRef,
                        (state) =>
                            new VFSState({
                                ...state,
                                files: HashMap.set(
                                    state.files,
                                    path,
                                    new VirtualFile({
                                        path,
                                        content,
                                        originalContent: original,
                                        timestamp: Date.now(),
                                    }),
                                ),
                            }),
                    );
                    return `[VFS] Staged write to ${path}`;
                }),

            editFile: (path: string, oldString: string, newString: string, replaceAll = false) =>
                Effect.gen(function* () {
                    const currentContent = yield* readFile(path);
                    const newContent = yield* replace(currentContent, oldString, newString, replaceAll).pipe(
                        Effect.mapError((e) => new VFSError({ message: e.message })),
                    );

                    const state = yield* Ref.get(stateRef);
                    let original: Option.Option<string> = Option.none();

                    const existing = HashMap.get(state.files, path);
                    if (Option.isSome(existing)) {
                        original = existing.value.originalContent;
                    } else {
                        original = yield* projectFiles.readFile(path, { disableExcerpts: true }).pipe(
                            Effect.map(Option.some),
                            Effect.catchTag("FileReadError", () => Effect.succeed(Option.none())),
                        );
                    }

                    yield* Ref.update(
                        stateRef,
                        (state) =>
                            new VFSState({
                                ...state,
                                files: HashMap.set(
                                    state.files,
                                    path,
                                    new VirtualFile({
                                        path,
                                        content: newContent,
                                        originalContent: original,
                                        timestamp: Date.now(),
                                    }),
                                ),
                            }),
                    );
                    return `[VFS] Staged edit to ${path}`;
                }),

            readFile,

            getDiffs: () =>
                Effect.gen(function* () {
                    const state = yield* Ref.get(stateRef);
                    const patches: FilePatch[] = [];
                    for (const [path, file] of HashMap.entries(state.files)) {
                        const patch = yield* generateUnifiedDiff(
                            path,
                            Option.getOrElse(file.originalContent, () => ""),
                            file.content,
                        );
                        patches.push(patch);
                    }
                    return Chunk.fromIterable(patches);
                }),

            getFileDiff: (path: string) =>
                Effect.gen(function* () {
                    const state = yield* Ref.get(stateRef);
                    const file = HashMap.get(state.files, path);
                    if (Option.isNone(file)) {
                        return yield* new VFSError({ message: `${path} not staged` });
                    }
                    return yield* generateUnifiedDiff(
                        path,
                        Option.getOrElse(file.value.originalContent, () => ""),
                        file.value.content,
                    );
                }),

            addComment: (path: string, line: number | null, content: string) =>
                Ref.update(
                    stateRef,
                    (state) =>
                        new VFSState({
                            ...state,
                            comments: Chunk.append(
                                state.comments,
                                new ReviewComment({
                                    id: crypto.randomUUID(),
                                    path,
                                    line: line ? Option.some(line) : Option.none(),
                                    content,
                                    timestamp: Date.now(),
                                }),
                            ),
                        }),
                ),

            getComments: () => Ref.get(stateRef).pipe(Effect.map((s) => s.comments)),

            approve: () => Ref.update(stateRef, (s) => new VFSState({ ...s, decision: Option.some("approved") })),

            reject: () => Ref.update(stateRef, (s) => new VFSState({ ...s, decision: Option.some("rejected") })),

            getDecision: () => Ref.get(stateRef).pipe(Effect.map((s) => s.decision)),

            flush: () =>
                Effect.gen(function* () {
                    const state = yield* Ref.get(stateRef);
                    const results: string[] = [];
                    for (const [path, file] of HashMap.entries(state.files)) {
                        yield* projectFiles.writeFile(path, file.content, true);
                        results.push(path);
                    }
                    yield* Ref.set(stateRef, VFSState.empty);
                    return results;
                }),

            reset: () => Ref.set(stateRef, VFSState.empty),

            getSummary: () =>
                Effect.gen(function* () {
                    const state = yield* Ref.get(stateRef);
                    return new VFSSummary({
                        fileCount: HashMap.size(state.files),
                        files: Array.from(HashMap.keys(state.files)),
                        commentCount: Chunk.size(state.comments),
                    });
                }),
        };
    }),
    dependencies: [ProjectFiles.Default],
    accessors: true,
}) {}

export const TestVFS = new VFS({
    reset: () => Effect.void,
    getSummary: () => Effect.succeed({ fileCount: 0, files: [], commentCount: 0 }),
    getDiffs: () => Effect.succeed(Chunk.empty()),
    getDecision: () => Effect.succeed(Option.none()),
    getComments: () => Effect.succeed(Chunk.empty()),
    flush: () => Effect.succeed([]),
    writeFile: () => Effect.succeed(""),
    readFile: () => Effect.succeed(""),
    editFile: () => Effect.succeed(""),
    getFileDiff: () => Effect.succeed({ path: "", hunks: Chunk.empty(), isDeleted: false, isNew: false }),
    addComment: () => Effect.void,
    approve: () => Effect.void,
    reject: () => Effect.void,
});

export const TestVFSLayer = Layer.succeed(VFS, TestVFS);
