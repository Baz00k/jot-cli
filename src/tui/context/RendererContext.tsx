import type { CliRenderer } from "@opentui/core";
import { createContext, useContext } from "react";

const RendererContext = createContext<CliRenderer | null>(null);

export const RendererProvider = RendererContext.Provider;

export const useRenderer = () => {
    const context = useContext(RendererContext);
    if (!context) {
        throw new Error("useRenderer must be used within RendererProvider");
    }
    return context;
};
