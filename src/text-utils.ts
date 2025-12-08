export const formatWindow = (content: string) => {
    const windowSize = 40;
    // Replace all whitespace with single spaces to ensure single-line output
    const cleanContent = content.replace(/\s+/g, " ").trim();
    if (cleanContent.length > windowSize) {
        return "..." + cleanContent.slice(-windowSize);
    }
    return cleanContent;
};
