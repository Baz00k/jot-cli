import { FileSystem } from "@effect/platform/FileSystem";
import { BunFileSystem } from "@effect/platform-bun";
import { Effect } from "effect";
import { PromptReadError } from "@/domain/errors";
import { promptPaths } from "@/prompts";

export type PromptType = keyof typeof promptPaths;

export class Prompts extends Effect.Service<Prompts>()("services/prompts", {
    effect: Effect.gen(function* () {
        const fs = yield* FileSystem;

        return {
            get: (promptType: PromptType) =>
                Effect.gen(function* () {
                    const promptPath = promptPaths[promptType];
                    return yield* fs.readFileString(promptPath);
                }).pipe(
                    Effect.catchAllCause((cause) =>
                        Effect.fail(
                            new PromptReadError({
                                cause,
                                message: `Failed to read ${promptType} prompt`,
                            }),
                        ),
                    ),
                ),
        };
    }),
    dependencies: [BunFileSystem.layer],
    accessors: true,
}) {}
