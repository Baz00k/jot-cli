import { describe, expect, test } from "bun:test";
import { Chunk, Effect, Layer, Option } from "effect";
import { ProjectFiles } from "@/services/project-files";
import { VFS } from "@/services/vfs";
import { TestProjectFilesLayer } from "@/test/mocks/project-files";

describe("VFS Service", () => {
    const TestLayer = VFS.DefaultWithoutDependencies.pipe(Layer.provideMerge(TestProjectFilesLayer));

    test("writeFile stages content without writing to disk", async () => {
        const program = Effect.gen(function* () {
            const vfs = yield* VFS;
            const projectFiles = yield* ProjectFiles;

            yield* vfs.writeFile("test.txt", "staged content");

            const stagedContent = yield* vfs.readFile("test.txt");
            expect(stagedContent).toBe("staged content");

            const diskContent = yield* projectFiles
                .readFile("test.txt")
                .pipe(Effect.catchTag("FileReadError", () => Effect.succeed("NOT_FOUND")));
            expect(diskContent).toBe("NOT_FOUND");
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    test("readFile returns staged content if present, else disk content", async () => {
        const program = Effect.gen(function* () {
            const vfs = yield* VFS;
            const projectFiles = yield* ProjectFiles;

            yield* projectFiles.writeFile("disk.txt", "disk content");

            const content1 = yield* vfs.readFile("disk.txt");
            expect(content1).toBe("disk content");

            yield* vfs.writeFile("disk.txt", "staged content", true);

            const content2 = yield* vfs.readFile("disk.txt");
            expect(content2).toBe("staged content");
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    test("editFile modifies content correctly", async () => {
        const program = Effect.gen(function* () {
            const vfs = yield* VFS;
            const projectFiles = yield* ProjectFiles;

            yield* projectFiles.writeFile("code.ts", "const x = 1;\nconst y = 2;");

            yield* vfs.editFile("code.ts", "const x = 1;", "const x = 10;");

            const content = yield* vfs.readFile("code.ts");
            expect(content).toBe("const x = 10;\nconst y = 2;");

            const diskContent = yield* projectFiles.readFile("code.ts");
            expect(diskContent).toBe("const x = 1;\nconst y = 2;");
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    test("getDiffs generates unified diffs", async () => {
        const program = Effect.gen(function* () {
            const vfs = yield* VFS;
            const projectFiles = yield* ProjectFiles;

            yield* projectFiles.writeFile("file.txt", "line1\nline2\nline3");
            yield* vfs.editFile("file.txt", "line2", "line2_modified");

            const diffs = yield* vfs.getDiffs();
            expect(Chunk.size(diffs)).toBe(1);

            const patch = Chunk.head(diffs).pipe(Option.getOrThrow);
            expect(patch.path).toBe("file.txt");

            const hunk = Chunk.head(patch.hunks).pipe(Option.getOrThrow);
            expect(hunk.content).toContain("-line2");
            expect(hunk.content).toContain("+line2_modified");
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    test("flush applies changes to disk", async () => {
        const program = Effect.gen(function* () {
            const vfs = yield* VFS;
            const projectFiles = yield* ProjectFiles;

            yield* projectFiles.writeFile("test.txt", "original");
            yield* vfs.writeFile("test.txt", "new", true);
            yield* vfs.writeFile("new.txt", "created");

            yield* vfs.flush();

            const diskTest = yield* projectFiles.readFile("test.txt");
            const diskNew = yield* projectFiles.readFile("new.txt");

            expect(diskTest).toBe("new");
            expect(diskNew).toBe("created");

            const summary = yield* vfs.getSummary();
            expect(summary.fileCount).toBe(0);
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    test("comments and decisions management", async () => {
        const program = Effect.gen(function* () {
            const vfs = yield* VFS;

            yield* vfs.addComment("test.txt", 1, "Fix this");

            const comments = yield* vfs.getComments();
            expect(Chunk.size(comments)).toBe(1);

            const comment = Chunk.head(comments).pipe(Option.getOrThrow);
            expect(comment.content).toBe("Fix this");
            expect(Option.getOrNull(comment.line)).toBe(1);

            yield* vfs.approve();
            const decision1 = yield* vfs.getDecision();
            expect(Option.getOrNull(decision1)).toEqual({ type: "approved", message: undefined });

            yield* vfs.reject();
            const decision2 = yield* vfs.getDecision();
            expect(Option.getOrNull(decision2)).toEqual({ type: "rejected", message: undefined });
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    test("reset clears all state", async () => {
        const program = Effect.gen(function* () {
            const vfs = yield* VFS;

            yield* vfs.writeFile("test.txt", "content");
            yield* vfs.addComment("test.txt", null, "comment");
            yield* vfs.approve();

            yield* vfs.reset();

            const summary = yield* vfs.getSummary();
            expect(summary.fileCount).toBe(0);
            expect(summary.commentCount).toBe(0);

            const decision = yield* vfs.getDecision();
            expect(Option.isNone(decision)).toBe(true);
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    test("discardChanges removes staged changes for specific file", async () => {
        const program = Effect.gen(function* () {
            const vfs = yield* VFS;

            yield* vfs.writeFile("test.txt", "staged");
            yield* vfs.writeFile("other.txt", "staged2");

            yield* vfs.discardChanges("test.txt");

            const summary = yield* vfs.getSummary();
            expect(summary.fileCount).toBe(1);
            expect(summary.files).toContain("other.txt");
            expect(summary.files).not.toContain("test.txt");

            const content = yield* vfs.readFile("test.txt");
            expect(content).toBe("");
        });

        await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });
});
