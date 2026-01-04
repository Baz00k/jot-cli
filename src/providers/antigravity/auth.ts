import { Effect, Schema } from "effect";
import type { Config } from "@/services/config";
import { ANTIGRAVITY_CLIENT_ID, ANTIGRAVITY_CLIENT_SECRET } from "./constants";
import { AntigravityAuthError } from "./errors";
import { TokenResponseSchema } from "./schemas";

export const refreshTokenRequest = (refreshToken: string) =>
    Effect.gen(function* () {
        yield* Effect.logDebug("[Antigravity] Refreshing access token...");

        return yield* Effect.tryPromise({
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
                    throw new AntigravityAuthError({ message: `Failed to refresh token: ${text}` });
                }

                return await Schema.decodeUnknownPromise(TokenResponseSchema)(await response.json());
            },
            catch: (e) =>
                e instanceof AntigravityAuthError ? e : new AntigravityAuthError({ message: String(e), cause: e }),
        });
    });

export const getValidToken = (config: Config) =>
    Effect.gen(function* () {
        const userConfig = yield* config.get;
        const auth = userConfig.googleAntigravity;

        if (!auth?.accessToken) {
            return yield* new AntigravityAuthError({ message: "Not authenticated. Run 'jot auth' first." });
        }

        if (auth.expiresAt && Date.now() < auth.expiresAt - 60000) {
            return auth.accessToken;
        }

        if (!auth.refreshToken) {
            return yield* new AntigravityAuthError({
                message: "Token expired and no refresh token available. Run 'jot auth' again.",
            });
        }

        yield* Effect.logInfo("[Antigravity] Token expired, refreshing...");
        const tokens = yield* refreshTokenRequest(auth.refreshToken);

        yield* config.update({
            googleAntigravity: {
                ...auth,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token || auth.refreshToken,
                expiresAt: Date.now() + tokens.expires_in * 1000,
            },
        });

        yield* Effect.logDebug("[Antigravity] Token refreshed successfully");

        return tokens.access_token;
    });
