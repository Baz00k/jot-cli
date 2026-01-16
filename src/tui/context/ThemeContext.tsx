import { type Theme, themes } from "@/tui/theme";
import { createContext, type ReactNode, useContext, useState } from "react";

interface ThemeContextType {
    theme: Theme;
    nextTheme: () => void;
    setTheme: (index: number) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themeIndex, setThemeIndex] = useState(0);

    const theme = themes[themeIndex % themes.length] ?? themes[0];

    const nextTheme = () => setThemeIndex((prev) => (prev + 1) % themes.length);
    const setTheme = (index: number) => setThemeIndex(index);

    return <ThemeContext.Provider value={{ theme, nextTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}
