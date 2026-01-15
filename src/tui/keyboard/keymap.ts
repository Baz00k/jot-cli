export interface KeyBinding {
    /** The name of the key */
    name: string;
    /** Control modifier */
    ctrl?: boolean;
    /** Shift modifier */
    shift?: boolean;
    /** Meta modifier */
    meta?: boolean;
    /** Super modifier */
    super?: boolean;
    /** Display label */
    label: string;
    /** Optional description */
    description?: string;
}

export type KeyMap = Record<string, Record<string, KeyBinding>>;

export const Keymap = {
    Global: {
        Exit: { name: "c", ctrl: true, label: "Ctrl+C" },
        Help: { name: "?", label: "?" },
        Settings: { name: "f2", label: "F2" },
        Retry: { name: "r", label: "R" },
        Submit: { name: "return", label: "Enter" },
        Cancel: { name: "escape", label: "Esc" },
    },
    DiffView: {
        ToggleView: { name: "v", label: "V" },
        ToggleLineNumbers: { name: "l", label: "L" },
        ToggleWrap: { name: "w", label: "W" },
        CycleTheme: { name: "t", label: "T" },
        CloseHelp: { name: "escape", label: "Esc" },
    },
    Feedback: {
        Approve: { name: "y", label: "y" },
        Reject: { name: "n", label: "n" },
        SubmitReject: { name: "return", label: "Enter" },
        CancelReject: { name: "escape", label: "Esc" },
    },
    Navigation: {
        FocusNext: { name: "tab", label: "Tab" },
    },
    TaskInput: {
        Submit: { name: "return", label: "Enter" },
        NewLine: { name: "return", ctrl: true, label: "Ctrl+Enter" },
        Paste: { name: "v", ctrl: true, label: "Ctrl+V" },
    },
} as const satisfies KeyMap;
