import type { UniversalRuntime } from "@/runtime";
import { Config, type UserConfig } from "@/services/config";
import { Effect } from "effect";
import { useCallback, useEffect, useState } from "react";

export interface UseConfigReturn {
    readonly config: UserConfig | null;
    readonly updateConfig: (patch: Partial<UserConfig>) => Promise<void>;
    readonly refreshConfig: () => Promise<void>;
}

export function useConfig(runtime: UniversalRuntime): UseConfigReturn {
    const [config, setConfig] = useState<UserConfig | null>(null);

    const refreshConfig = useCallback(async () => {
        const current = await runtime.runPromise(
            Effect.gen(function* () {
                const cfgService = yield* Config;
                return yield* cfgService.get;
            }),
        );
        setConfig(current);
    }, [runtime]);

    const updateConfig = useCallback(
        async (patch: Partial<UserConfig>) => {
            const current = await runtime.runPromise(
                Effect.gen(function* () {
                    const cfgService = yield* Config;
                    yield* cfgService.update(patch);
                    return yield* cfgService.get;
                }),
            );
            setConfig(current);
        },
        [runtime],
    );

    useEffect(() => {
        void refreshConfig();
    }, [refreshConfig]);

    return {
        config,
        updateConfig,
        refreshConfig,
    };
}
