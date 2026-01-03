import { BunContext } from "@effect/platform-bun";
import { Layer, ManagedRuntime } from "effect";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { Agent } from "@/services/agent";
import { Config } from "@/services/config";
import { LLM } from "@/services/llm";
import { AppLogger } from "@/services/logger";
import { Prompts } from "@/services/prompts";
import { Session } from "@/services/session";
import { Web } from "@/services/web";

// Compose layers with BunContext.layer last to provide FileSystem/Path to all services
const MainLayer = Layer.mergeAll(Agent.Default, Config.Default).pipe(
    Layer.provideMerge(Layer.mergeAll(Prompts.Default, Session.Default, LLM.Default, Web.Default)),
    Layer.provideMerge(AppLogger),
    Layer.provideMerge(BunContext.layer),
);

// Use unknown for errors since MainLayer can produce various error types at runtime
type AgentRuntime = ManagedRuntime.ManagedRuntime<Agent | Config, unknown>;

const EffectContext = createContext<AgentRuntime | null>(null);

export function EffectProvider({ children }: { children: ReactNode }) {
    const [runtime, setRuntime] = useState<AgentRuntime | null>(null);

    useEffect(() => {
        const managedRuntime = ManagedRuntime.make(MainLayer);
        setRuntime(managedRuntime as AgentRuntime);

        return () => {
            void managedRuntime.dispose();
        };
    }, []);

    if (!runtime) return null;

    return <EffectContext.Provider value={runtime}>{children}</EffectContext.Provider>;
}

export function useEffectRuntime(): AgentRuntime {
    const runtime = useContext(EffectContext);
    if (!runtime) throw new Error("useEffectRuntime must be within EffectProvider");
    return runtime;
}
