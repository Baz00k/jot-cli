import { useKeyboard } from "@opentui/react";
import { useCallback } from "react";

export interface UseKeyboardShortcutsProps {
    onExit?: () => void;
    onSubmit?: () => void;
    onReset?: () => void;
    isRunning?: boolean;
}

export const useKeyboardShortcuts = ({ onExit, onSubmit, onReset, isRunning = false }: UseKeyboardShortcutsProps) => {
    useKeyboard((key) => {
        if (key.name === "escape" && onExit) {
            onExit();
        }

        if (!isRunning) {
            if (key.name === "return" && onSubmit) {
                onSubmit();
            } else if (key.name === "r" && onReset) {
                onReset();
            }
        }
    });
};

export interface UseAgentSimulationProps {
    isRunning: boolean;
    setIsRunning: (running: boolean) => void;
    setEvents: (updater: (prev: string[]) => string[] | string[]) => void;
}

export const useAgentSimulation = ({ isRunning, setIsRunning, setEvents }: UseAgentSimulationProps) => {
    const startAgent = useCallback(() => {
        if (isRunning) return;

        setIsRunning(true);
        setEvents(() => []);

        const simulateEvents = [
            "Starting agent...",
            "Reading project files...",
            "Generating draft...",
            "Draft complete",
            "Reviewing content...",
            "Review approved",
            "Finalizing result...",
            "Done!",
        ];

        simulateEvents.forEach((event, index) => {
            setTimeout(
                () => {
                    setEvents((prev: string[]) => [...prev, `[${new Date().toLocaleTimeString()}] ${event}`]);
                    if (index === simulateEvents.length - 1) {
                        setIsRunning(false);
                    }
                },
                (index + 1) * 1000,
            );
        });
    }, [isRunning, setIsRunning, setEvents]);

    const reset = useCallback(() => {
        if (isRunning) return;
        setEvents(() => []);
        setIsRunning(false);
    }, [isRunning, setEvents, setIsRunning]);

    return { startAgent, reset };
};
