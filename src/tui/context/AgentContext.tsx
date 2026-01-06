import { createContext, type ReactNode, useContext } from "react";
import { useEffectRuntime } from "@/tui/context/EffectContext";
import { type UseAgentReturn, useAgent } from "@/tui/hooks/useAgent";

const AgentContext = createContext<UseAgentReturn | null>(null);

export const AgentProvider = ({ children }: { children: ReactNode }) => {
    const runtime = useEffectRuntime();
    const agent = useAgent(runtime);

    return <AgentContext.Provider value={agent}>{children}</AgentContext.Provider>;
};

export const useAgentContext = () => {
    const context = useContext(AgentContext);
    if (!context) {
        throw new Error("useAgentContext must be used within an AgentProvider");
    }
    return context;
};
