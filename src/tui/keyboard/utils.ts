import type { KeyBinding } from "./keymap";

/**
 * Converts a key binding to a human-readable string representation
 * @returns A string like "ctrl+shift+y" or just "escape"
 */
export const keyBindingToString = (binding: KeyBinding): string => {
    const parts: string[] = [];
    if (binding.ctrl) parts.push("ctrl");
    if (binding.shift) parts.push("shift");
    if (binding.meta) parts.push("meta");
    if (binding.super) parts.push("super");
    parts.push(binding.name);
    return parts.join("+");
};

/**
 * Check if provided key bindings refer to the same key combo
 */
export const areKeyBindingsEqual = (a: Partial<KeyBinding>, b: Partial<KeyBinding>): boolean => {
    return (
        a.name === b.name &&
        !!a.ctrl === !!b.ctrl &&
        !!a.shift === !!b.shift &&
        !!a.meta === !!b.meta &&
        !!a.super === !!b.super
    );
};
