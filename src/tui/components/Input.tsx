import { useEffect, useState } from "react";
import { useTheme } from "@/tui/context/ThemeContext";

export interface InputProps {
    label?: string;
    placeholder?: string;
    focused?: boolean;
    onInput?: (value: string) => void;
    onSubmit?: (value: string) => void;
    value?: string;
}

export function Input({ label, placeholder, focused, onInput, onSubmit, value }: InputProps) {
    const { theme } = useTheme();
    const [localValue, setLocalValue] = useState(value || "");

    useEffect(() => {
        if (value !== undefined) {
            setLocalValue(value);
        }
    }, [value]);

    const handleInput = (newValue: string) => {
        setLocalValue(newValue);
        onInput?.(newValue);
    };

    return (
        <box
            title={label}
            style={{ border: true, height: 3, borderColor: focused ? theme.primaryColor : theme.borderColor }}
        >
            <input
                placeholder={placeholder}
                focused={focused}
                onInput={handleInput}
                onSubmit={onSubmit}
                value={localValue}
                backgroundColor="transparent"
            />
        </box>
    );
}
