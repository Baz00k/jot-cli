import { type PromptContext, useDialogKeyboard } from "@opentui-ui/dialog/react";
import { useEffect, useState } from "react";
import { Input } from "@/tui/components/Input";
import { useConfigContext } from "@/tui/context/ConfigContext";
import { useTheme } from "@/tui/context/ThemeContext";
import { type Theme, themes } from "@/tui/theme";

type Field = "writer" | "reviewer" | "theme";

export const SettingsModal = ({ dialogId, dismiss }: PromptContext<void>) => {
    const { config, updateConfig } = useConfigContext();
    const { theme, setTheme } = useTheme();
    const [focusedField, setFocusedField] = useState<Field>("writer");
    const [status, setStatus] = useState<"idle" | "saving">("idle");
    const [writerModel, setWriterModel] = useState(config?.writerModel ?? "");
    const [reviewerModel, setReviewerModel] = useState(config?.reviewerModel ?? "");

    useEffect(() => {
        if (config?.writerModel) setWriterModel(config.writerModel);
        if (config?.reviewerModel) setReviewerModel(config.reviewerModel);
    }, [config]);

    const handleSave = () => {
        setStatus("saving");
        updateConfig({
            writerModel,
            reviewerModel,
        })
            .then(() => {
                setStatus("idle");
                dismiss();
            })
            .catch(() => {
                setStatus("idle");
            });
    };

    const cycleTheme = () => {
        const currentIndex = themes.findIndex((t: Theme) => t.name === theme.name);
        const nextIndex = (currentIndex + 1) % themes.length;
        setTheme(nextIndex);
    };

    useDialogKeyboard((key) => {
        if (status === "saving") return;

        if (key.name === "tab" || key.name === "down") {
            setFocusedField((prev) => {
                if (prev === "writer") return "reviewer";
                if (prev === "reviewer") return "theme";
                return "writer";
            });
            return;
        }

        if (key.name === "up") {
            setFocusedField((prev) => {
                if (prev === "writer") return "theme";
                if (prev === "reviewer") return "writer";
                return "reviewer";
            });
            return;
        }

        if (
            focusedField === "theme" &&
            (key.name === "right" || key.name === "left" || key.name === "return" || key.name === "space")
        ) {
            cycleTheme();
            return;
        }

        if (key.name === "return") {
            handleSave();
        }
    }, dialogId);

    return (
        <box style={{ flexDirection: "column", gap: 3 }}>
            <text style={{ alignSelf: "center" }}>Settings</text>

            <box style={{ flexDirection: "column", gap: 1 }}>
                <Input
                    label="Writer model"
                    focused={focusedField === "writer"}
                    value={writerModel}
                    onInput={setWriterModel}
                    onSubmit={handleSave}
                />

                <Input
                    label="Reviewer model"
                    focused={focusedField === "reviewer"}
                    value={reviewerModel}
                    onInput={setReviewerModel}
                    onSubmit={handleSave}
                />

                <box
                    title="Theme (Press Enter/Space to cycle)"
                    style={{
                        border: true,
                        height: 3,
                        borderColor: focusedField === "theme" ? theme.primaryColor : theme.borderColor,
                    }}
                >
                    <text>{theme.name}</text>
                </box>
            </box>

            <box style={{ justifyContent: "center" }}>
                <text fg={theme.mutedColor}>
                    {status === "saving" ? "Saving..." : "Enter: Save | Tab: Switch | Esc: Cancel"}
                </text>
            </box>
        </box>
    );
};
