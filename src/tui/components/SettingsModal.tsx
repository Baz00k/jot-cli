import { useConfigContext } from "@/tui/context/ConfigContext";
import { useTextBuffer } from "@/tui/hooks/useTextBuffer";
import { type DialogId, useDialogKeyboard } from "@opentui-ui/dialog/react";
import { useEffect, useState } from "react";

export const SettingsModal = ({ onClose, dialogId }: { onClose: () => void; dialogId: DialogId }) => {
    const { config, updateConfig } = useConfigContext();
    const [focusedField, setFocusedField] = useState<"writer" | "reviewer">("writer");
    const [status, setStatus] = useState<"idle" | "saving">("idle");

    const writerBuffer = useTextBuffer(config?.writerModel ?? "");
    const reviewerBuffer = useTextBuffer(config?.reviewerModel ?? "");

    // biome-ignore lint/correctness/useExhaustiveDependencies: sync only on config load
    useEffect(() => {
        if (config?.writerModel && writerBuffer.text === "") {
            writerBuffer.setText(config.writerModel);
        }
        if (config?.reviewerModel && reviewerBuffer.text === "") {
            reviewerBuffer.setText(config.reviewerModel);
        }
    }, [config]);

    useDialogKeyboard((key) => {
        if (status === "saving") return;

        if (key.name === "escape") {
            onClose();
            return;
        }

        if (key.name === "tab" || key.name === "down" || key.name === "up") {
            setFocusedField((prev) => (prev === "writer" ? "reviewer" : "writer"));
            return;
        }

        if (key.name === "return") {
            setStatus("saving");
            updateConfig({
                writerModel: writerBuffer.text,
                reviewerModel: reviewerBuffer.text,
            }).then(() => {
                setStatus("idle");
                onClose();
            });
            return;
        }

        const activeBuffer = focusedField === "writer" ? writerBuffer : reviewerBuffer;

        if (key.name === "backspace") {
            activeBuffer.deleteBack();
        } else if (key.name === "left") {
            activeBuffer.moveLeft();
        } else if (key.name === "right") {
            activeBuffer.moveRight();
        } else if (key.name === "space") {
            activeBuffer.insert(" ");
        } else if (key.name?.length === 1 && !key.ctrl && !key.meta) {
            const char = key.sequence && key.sequence.length === 1 ? key.sequence : key.name;
            if (char && char.length === 1) {
                activeBuffer.insert(char);
            }
        }
    }, dialogId);

    return (
        <box style={{ flexDirection: "column", gap: 3 }}>
            <text style={{ alignSelf: "center" }}>Settings</text>

            <box style={{ flexDirection: "column", gap: 1 }}>
                <Input label="Writer Model" buffer={writerBuffer} isFocused={focusedField === "writer"} />
                <Input label="Reviewer Model" buffer={reviewerBuffer} isFocused={focusedField === "reviewer"} />
            </box>

            <box style={{ justifyContent: "center" }}>
                <text fg="gray">{status === "saving" ? "Saving..." : "Enter: Save | Tab: Switch | Esc: Cancel"}</text>
            </box>
        </box>
    );
};

const Input = ({
    label,
    buffer,
    isFocused,
}: {
    label: string;
    buffer: ReturnType<typeof useTextBuffer>;
    isFocused: boolean;
}) => {
    const text = buffer.text;
    const cursor = buffer.cursor;
    const before = text.slice(0, cursor);
    const cursorChar = text[cursor] || " ";
    const after = text.slice(cursor + 1);

    return (
        <box style={{ flexDirection: "column" }}>
            <text fg={isFocused ? "cyan" : "white"}>{label}</text>
            <box
                style={{
                    border: true,
                    borderColor: isFocused ? "cyan" : "gray",
                    paddingLeft: 1,
                    paddingRight: 1,
                }}
            >
                <text>
                    {before}
                    {isFocused ? (
                        <span bg="white" fg="black">
                            {cursorChar}
                        </span>
                    ) : (
                        cursorChar
                    )}
                    {after}
                </text>
            </box>
        </box>
    );
};
