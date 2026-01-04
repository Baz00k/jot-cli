import * as crypto from "node:crypto";
import { intro, log, note, outro, spinner } from "@clack/prompts";
import { Command } from "@effect/cli";
import { Effect } from "effect";
import {
    ANTIGRAVITY_CLIENT_ID,
    ANTIGRAVITY_CLIENT_SECRET,
    ANTIGRAVITY_DEFAULT_PROJECT_ID,
    ANTIGRAVITY_ENDPOINT_FALLBACKS,
    ANTIGRAVITY_HEADERS,
    ANTIGRAVITY_LOAD_ENDPOINTS,
    ANTIGRAVITY_REDIRECT_URI,
    ANTIGRAVITY_SCOPES,
} from "@/providers/antigravity/constants";
import { Config } from "@/services/config";
import { renderMarkdown } from "@/text/utils";

const base64URLEncode = (buffer: Buffer) => {
    return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
};

const sha256 = (str: string) => {
    return crypto.createHash("sha256").update(str).digest();
};

const openBrowser = (url: string) =>
    Effect.try({
        try: () => {
            const osPlatform = process.platform;
            let command: string[];
            if (osPlatform === "darwin") {
                command = ["open", url];
            } else if (osPlatform === "win32") {
                command = ["cmd.exe", "/c", "start", url.replace(/&/g, "^&")];
            } else {
                command = ["xdg-open", url];
            }

            Bun.spawn(command, {
                stdout: "ignore",
                stderr: "ignore",
            }).unref();
        },
        catch: (error) => new Error(`Failed to open browser: ${String(error)}`),
    });

const waitForCallback = () =>
    Effect.async<string, Error>((resume) => {
        const server = Bun.serve({
            port: 51121,
            fetch(req) {
                const url = new URL(req.url);

                if (url.pathname === "/oauth-callback") {
                    const code = url.searchParams.get("code");
                    const error = url.searchParams.get("error");

                    if (code) {
                        setTimeout(() => {
                            server.stop();
                        }, 100);
                        resume(Effect.succeed(code));
                        return new Response(
                            "<h1>Authentication successful!</h1><p>You can close this window now.</p>",
                            {
                                headers: { "Content-Type": "text/html" },
                            },
                        );
                    }

                    setTimeout(() => {
                        server.stop();
                    }, 100);
                    resume(Effect.fail(new Error(error || "Authentication failed")));
                    return new Response(`<h1>Authentication failed</h1><p>${error || "Unknown error"}</p>`, {
                        status: 400,
                        headers: { "Content-Type": "text/html" },
                    });
                }

                return new Response("Not Found", { status: 404 });
            },
        });

        setTimeout(
            () => {
                server.stop();
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

const fetchProjectID = (accessToken: string) =>
    Effect.gen(function* () {
        const endpoints = [...new Set([...ANTIGRAVITY_LOAD_ENDPOINTS, ...ANTIGRAVITY_ENDPOINT_FALLBACKS])];

        const fetchFromEndpoint = (endpoint: string) =>
            Effect.tryPromise({
                try: async () => {
                    const response = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                            ...ANTIGRAVITY_HEADERS,
                        },
                        body: JSON.stringify({
                            metadata: {
                                ideType: "IDE_UNSPECIFIED",
                                platform: "PLATFORM_UNSPECIFIED",
                                pluginType: "GEMINI",
                            },
                        }),
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to load project ID from ${endpoint}: ${response.status}`);
                    }

                    const data = (await response.json()) as {
                        cloudaicompanionProject?: string | { id?: string };
                    };
                    if (typeof data.cloudaicompanionProject === "string" && data.cloudaicompanionProject) {
                        return data.cloudaicompanionProject;
                    }
                    if (typeof data.cloudaicompanionProject === "object" && data.cloudaicompanionProject?.id) {
                        return data.cloudaicompanionProject.id;
                    }
                    throw new Error(`Invalid response from ${endpoint}`);
                },
                catch: (error) => new Error(`[${endpoint}] ${String(error)}`),
            });

        return yield* Effect.firstSuccessOf(endpoints.map(fetchFromEndpoint)).pipe(
            Effect.catchAll(() => Effect.succeed(ANTIGRAVITY_DEFAULT_PROJECT_ID)),
        );
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

        const browserOpened = yield* openBrowser(authUrl.toString()).pipe(
            Effect.map(() => true),
            Effect.catchAll(() => Effect.succeed(false)),
        );

        if (!browserOpened) {
            const linkMarkdown = `[${authUrl.toString()}](${authUrl.toString()})`;
            note(renderMarkdown(linkMarkdown), "Please open this URL in your browser to authenticate:");
        } else {
            log.info("Opening browser for authentication...");
        }

        s.start("Waiting for authentication...");

        const code = yield* waitForCallback();

        s.message("Exchanging code for token...");
        const tokens = yield* exchangeCodeForToken(code, verifier);

        s.message("Retrieving Project ID...");
        const projectId = yield* fetchProjectID(tokens.access_token);

        yield* config.update({
            googleAntigravity: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresAt: Date.now() + tokens.expires_in * 1000,
                projectId,
            },
        });

        s.stop("Authentication successful");
        outro("Successfully authenticated with Google Antigravity!");
    }),
).pipe(Command.withDescription("Authenticate with Google Antigravity"));
