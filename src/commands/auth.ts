import * as crypto from "node:crypto";
import { createServer } from "node:http";
import { intro, note, outro, spinner } from "@clack/prompts";
import { Command } from "@effect/cli";
import { Effect } from "effect";
import {
    ANTIGRAVITY_CLIENT_ID,
    ANTIGRAVITY_CLIENT_SECRET,
    ANTIGRAVITY_REDIRECT_URI,
    ANTIGRAVITY_SCOPES,
} from "@/domain/constants";
import { Config } from "@/services/config";

const base64URLEncode = (buffer: Buffer) => {
    return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
};

const sha256 = (str: string) => {
    return crypto.createHash("sha256").update(str).digest();
};

const waitForCallback = () =>
    Effect.async<string, Error>((resume) => {
        const server = createServer(async (req, res) => {
            const url = new URL(req.url || "", "http://localhost:51121");

            if (url.pathname === "/oauth-callback") {
                const code = url.searchParams.get("code");
                const error = url.searchParams.get("error");

                if (code) {
                    res.writeHead(200, { "Content-Type": "text/html" });
                    res.end("<h1>Authentication successful!</h1><p>You can close this window now.</p>");
                    server.close();
                    resume(Effect.succeed(code));
                } else {
                    res.writeHead(400, { "Content-Type": "text/html" });
                    res.end(`<h1>Authentication failed</h1><p>${error || "Unknown error"}</p>`);
                    server.close();
                    resume(Effect.fail(new Error(error || "Authentication failed")));
                }
            }
        });

        server.listen(51121);

        setTimeout(
            () => {
                server.close();
                resume(Effect.fail(new Error("Authentication timed out")));
            },
            5 * 60 * 1000,
        );
    });

const exchangeCodeForToken = (code: string, verifier: string) =>
    Effect.tryPromise({
        try: async () => {
            const response = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    client_id: ANTIGRAVITY_CLIENT_ID,
                    client_secret: ANTIGRAVITY_CLIENT_SECRET,
                    code,
                    grant_type: "authorization_code",
                    redirect_uri: ANTIGRAVITY_REDIRECT_URI,
                    code_verifier: verifier,
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Token exchange failed: ${text}`);
            }

            return (await response.json()) as {
                access_token: string;
                refresh_token?: string;
                expires_in: number;
            };
        },
        catch: (error) => new Error(String(error)),
    });

export const authCommand = Command.make("auth", {}, () =>
    Effect.gen(function* () {
        const config = yield* Config;
        intro("🔑 Jot CLI - Google Antigravity Auth");

        const s = spinner();
        s.start("Generating authentication URL...");

        const verifier = base64URLEncode(crypto.randomBytes(32));
        const challenge = base64URLEncode(sha256(verifier));

        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.append("client_id", ANTIGRAVITY_CLIENT_ID);
        authUrl.searchParams.append("redirect_uri", ANTIGRAVITY_REDIRECT_URI);
        authUrl.searchParams.append("response_type", "code");
        authUrl.searchParams.append("scope", ANTIGRAVITY_SCOPES.join(" "));
        authUrl.searchParams.append("code_challenge", challenge);
        authUrl.searchParams.append("code_challenge_method", "S256");
        authUrl.searchParams.append("access_type", "offline");
        authUrl.searchParams.append("prompt", "consent");

        s.stop("URL generated");

        note(authUrl.toString(), "Please open this URL in your browser to authenticate:");

        s.start("Waiting for authentication...");

        const code = yield* waitForCallback();

        s.message("Exchanging code for token...");
        const tokens = yield* exchangeCodeForToken(code, verifier);

        yield* config.update({
            googleAntigravity: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresAt: Date.now() + tokens.expires_in * 1000,
            },
        });

        s.stop("Authentication successful");
        outro("Successfully authenticated with Google Antigravity!");
    }),
).pipe(Command.withDescription("Authenticate with Google Antigravity"));
