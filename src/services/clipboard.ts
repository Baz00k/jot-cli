import { Effect } from "effect";
import { ClipboardError } from "@/domain/errors";

export const copyToClipboard = (text: string) =>
    Effect.gen(function* () {
        const platform = process.platform;
        let command: string[];

        const isWsl = platform === "linux" && (!!process.env.WSL_DISTRO_NAME || !!process.env.WSL_INTEROP);

        if (platform === "darwin") {
            command = ["pbcopy"];
        } else if (platform === "win32" || isWsl) {
            command = ["clip.exe"];
        } else if (platform === "linux") {
            if (process.env.WAYLAND_DISPLAY) {
                command = ["wl-copy"];
            } else {
                command = ["xclip", "-selection", "clipboard"];
            }
        } else {
            return yield* new ClipboardError({ message: `Unsupported platform: ${platform}` });
        }

        const proc = yield* Effect.try({
            try: () =>
                Bun.spawn(command, {
                    stdin: new Blob([text], { type: "text/plain" }),
                    stdout: "ignore",
                    stderr: "pipe",
                }),
            catch: (error) => new ClipboardError({ message: "Failed to spawn clipboard command", cause: error }),
        });

        const exitCode = yield* Effect.tryPromise({
            try: () => proc.exited,
            catch: (error) =>
                new ClipboardError({ message: "Failed to wait for clipboard process exit", cause: error }),
        });

        if (exitCode !== 0) {
            const stderr = yield* Effect.tryPromise({
                try: () => new Response(proc.stderr).text(),
                catch: (error) => new ClipboardError({ message: "Failed to read stderr", cause: error }),
            });

            return yield* new ClipboardError({
                message: `Clipboard command failed with code ${exitCode}: ${stderr}`,
            });
        }
    });

export class Clipboard extends Effect.Service<Clipboard>()("services/clipboard", {
    effect: Effect.succeed({
        copy: copyToClipboard,
    }),
}) {}
