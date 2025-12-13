import dedent from "dedent";

export const Messages = {
    apiKeyConfigured: (location: string) =>
        dedent`
            ✓ Openrouter API key is configured

            Config location: ${location}`,

    apiKeySetup: (location: string) =>
        dedent`
            ✗ Openrouter API key is not configured

            To set your API key, run:
                jot config set-key YOUR_API_KEY

            Get your API key from: https://openrouter.ai/

            The configuration will be stored at: ${location}`,
} as const;
