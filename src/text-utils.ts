import { STREAM_WINDOW_SIZE } from "./constants";

export const formatWindow = (content: string) => {
    // Replace all whitespace with single spaces to ensure single-line output
    const cleanContent = content.replace(/\s+/g, " ").trim();
    if (cleanContent.length > STREAM_WINDOW_SIZE) {
        return `...${cleanContent.slice(-STREAM_WINDOW_SIZE)}`;
    }
    return cleanContent;
};
