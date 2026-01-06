import { createContext, type ReactNode, useContext } from "react";
import { useEffectRuntime } from "@/tui/context/EffectContext";
import { type UseConfigReturn, useConfig } from "@/tui/hooks/useConfig";

const ConfigContext = createContext<UseConfigReturn | null>(null);

export const ConfigProvider = ({ children }: { children: ReactNode }) => {
    const runtime = useEffectRuntime();
    const config = useConfig(runtime);

    return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
};

export const useConfigContext = () => {
    const context = useContext(ConfigContext);
    if (!context) {
        throw new Error("useConfigContext must be used within a ConfigProvider");
    }
    return context;
};
