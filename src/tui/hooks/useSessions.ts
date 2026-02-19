import { Effect } from "effect";
import { useCallback, useEffect, useState } from "react";
import type { UniversalRuntime } from "@/runtime";
import { Session, type SessionData } from "@/services/session";

export interface UseSessionsReturn {
    readonly sessions: readonly SessionData[];
    readonly loading: boolean;
    readonly refresh: () => Promise<void>;
}

export function useSessions(runtime: UniversalRuntime): UseSessionsReturn {
    const [sessions, setSessions] = useState<readonly SessionData[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setLoading(true);
        const result = await runtime.runPromise(
            Effect.gen(function* () {
                const sessionService = yield* Session;
                return yield* sessionService.list();
            }),
        );
        setSessions(result);
        setLoading(false);
    }, [runtime]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return { sessions, loading, refresh };
}
