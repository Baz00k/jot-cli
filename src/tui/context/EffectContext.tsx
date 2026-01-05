import { ManagedRuntime } from "effect";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { UniversalLayer, type UniversalRuntime } from "@/runtime";

const EffectContext = createContext<UniversalRuntime | null>(null);

export function EffectProvider({ children }: { children: ReactNode }) {
    const [runtime, setRuntime] = useState<UniversalRuntime | null>(null);

    useEffect(() => {
        const managedRuntime = ManagedRuntime.make(UniversalLayer);
        setRuntime(managedRuntime);

        return () => {
            void managedRuntime.dispose();
        };
    }, []);

    if (!runtime) return null;

    return <EffectContext.Provider value={runtime}>{children}</EffectContext.Provider>;
}

export function useEffectRuntime(): UniversalRuntime {
    const runtime = useContext(EffectContext);
    if (!runtime) throw new Error("useEffectRuntime must be within EffectProvider");
    return runtime;
}
