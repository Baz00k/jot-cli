import { Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { APP_NAME } from "@/domain/constants";
import { UserDirError } from "@/domain/errors";

export type DirType = "config" | "data";

const getConfigDir = Effect.gen(function* () {
    const path = yield* Path.Path;
    const configDir = process.env.XDG_CONFIG_HOME ?? process.env.APPDATA;

    if (configDir) {
        return path.join(configDir, APP_NAME);
    }

    const homeDir = process.env.HOME ?? process.env.USERPROFILE;

    if (homeDir) {
        if (process.platform === "win32") {
            return path.join(homeDir, "AppData", "Roaming", APP_NAME);
        }

        return path.join(homeDir, ".config", APP_NAME);
    }

    return yield* new UserDirError({ message: "Could not determine config directory" });
});

const getDataDir = Effect.gen(function* () {
    const path = yield* Path.Path;
    const dataDir = process.env.XDG_DATA_HOME ?? process.env.APPDATA;

    if (dataDir) {
        return path.join(dataDir, APP_NAME);
    }

    const homeDir = process.env.HOME ?? process.env.USERPROFILE;

    if (homeDir) {
        if (process.platform === "win32") {
            return path.join(homeDir, "AppData", "Roaming", APP_NAME);
        }

        return path.join(homeDir, ".local", "share", APP_NAME);
    }

    return yield* new UserDirError({ message: "Could not determine data directory" });
});

export class UserDirs extends Effect.Service<UserDirs>()("services/user-dirs", {
    effect: Effect.gen(function* () {
        const path = yield* Path.Path;
        const configDir = yield* getConfigDir;
        const dataDir = yield* getDataDir;

        const getDir = (type: DirType) => Effect.succeed(type === "config" ? configDir : dataDir);

        const getPath = (type: DirType, ...pathSegments: string[]) =>
            getDir(type).pipe(Effect.map((dir) => path.join(dir, ...pathSegments)));

        return { getDir, getPath };
    }),
    dependencies: [BunContext.layer],
    accessors: true,
}) {}

export const TestUserDirs = new UserDirs({
    getDir: (type: DirType) => Effect.succeed(`/tmp/jot-cli/${type}`),
    getPath: (type: DirType, ...pathSegments: string[]) =>
        Effect.succeed(`/tmp/jot-cli/${type}/${pathSegments.join("/")}`),
});

export const TestUserDirsLayer = Layer.succeed(UserDirs, TestUserDirs);
