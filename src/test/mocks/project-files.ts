import { Effect, Layer, Ref } from "effect";
import { FileReadError } from "@/domain/errors";
import { ProjectFiles } from "@/services/project-files";

export class MockProjectFiles extends ProjectFiles {
    constructor(public readonly files: Ref.Ref<Map<string, string>>) {
        super({
            safePath: (p) => Effect.succeed(p),
            shouldIgnore: () => Effect.succeed(false),
            listFiles: () =>
                Ref.get(files).pipe(
                    Effect.map((map) =>
                        Array.from(map.keys()).map((p) => ({
                            name: p.split("/").pop() || p,
                            type: "File" as const,
                            path: p,
                        })),
                    ),
                ),
            readFile: (filePath, options) =>
                Ref.get(files).pipe(
                    Effect.flatMap((map) => {
                        const content = map.get(filePath);
                        if (content === undefined) {
                            return Effect.fail(
                                new FileReadError({
                                    cause: "File not found",
                                    message: `File not found: ${filePath}`,
                                }),
                            );
                        }
                        if (options?.lineRange) {
                            const lines = content.split("\n");
                            const { startLine, endLine } = options.lineRange;
                            return Effect.succeed(lines.slice(startLine - 1, endLine).join("\n"));
                        }
                        return Effect.succeed(content);
                    }),
                ),
            writeFile: (filePath, content, _overwrite) =>
                Ref.update(files, (map) => {
                    const newMap = new Map(map);
                    newMap.set(filePath, content);
                    return newMap;
                }).pipe(Effect.as(`Successfully wrote to ${filePath}`)),
            searchFiles: () => Effect.succeed([]),
        });
    }

    static create = Effect.gen(function* () {
        const files = yield* Ref.make(new Map<string, string>());
        return new MockProjectFiles(files);
    });
}

export const TestProjectFilesLayer = Layer.effect(ProjectFiles, MockProjectFiles.create);
