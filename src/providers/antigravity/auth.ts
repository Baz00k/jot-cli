import { Effect, Schema } from "effect";
import { ANTIGRAVITY_CLIENT_ID, ANTIGRAVITY_CLIENT_SECRET } from "@/domain/constants";
import type { Config } from "@/services/config";
import { TokenResponseSchema } from "./schemas";

export const refreshTokenRequest = (refreshToken: string) =>
    Effect.tryPromise({
        try: async () => {
            const response = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    client_id: ANTIGRAVITY_CLIENT_ID,
                    client_secret: ANTIGRAVITY_CLIENT_SECRET,
                    refresh_token: refreshToken,
                    grant_type: "refresh_token",
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Failed to refresh token: ${text}`);
            }

            return await Schema.decodeUnknownPromise(TokenResponseSchema)(await response.json());
        },
        catch: (e) => new Error(String(e)),
    });

export const getValidToken = (config: Config) =>
    Effect.gen(function* () {
        const userConfig = yield* config.get;
        const auth = userConfig.googleAntigravity;

        if (!auth?.accessToken) {
            return yield* Effect.fail(new Error("Not authenticated. Run 'jot auth' first."));
        }

        if (auth.expiresAt && Date.now() < auth.expiresAt - 60000) {
            return auth.accessToken;
        }

        if (!auth.refreshToken) {
            return yield* Effect.fail(new Error("Token expired and no refresh token available. Run 'jot auth' again."));
        }

        const tokens = yield* refreshTokenRequest(auth.refreshToken);

        yield* config.update({
            googleAntigravity: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token || auth.refreshToken,
                expiresAt: Date.now() + tokens.expires_in * 1000,
            },
        });

        return tokens.access_token;
    });
