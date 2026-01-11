import * as crypto from "node:crypto";
import { intro, log, note, outro, spinner } from "@clack/prompts";
import { Command } from "@effect/cli";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Effect, Schema } from "effect";
import {
    ANTIGRAVITY_CLIENT_ID,
    ANTIGRAVITY_CLIENT_SECRET,
    ANTIGRAVITY_DEFAULT_PROJECT_ID,
    ANTIGRAVITY_ENDPOINT_FALLBACKS,
    ANTIGRAVITY_HEADERS,
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

const TokenResponseSchema = Schema.Struct({
    access_token: Schema.String,
    refresh_token: Schema.optional(Schema.String),
    expires_in: Schema.Number,
});

const exchangeCodeForToken = (code: string, verifier: string) =>
    Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;

        const request = HttpClientRequest.post("https://oauth2.googleapis.com/token").pipe(
            HttpClientRequest.setHeader("Content-Type", "application/x-www-form-urlencoded"),
            HttpClientRequest.bodyUrlParams({
                client_id: ANTIGRAVITY_CLIENT_ID,
                client_secret: ANTIGRAVITY_CLIENT_SECRET,
                code,
                grant_type: "authorization_code",
                redirect_uri: ANTIGRAVITY_REDIRECT_URI,
                code_verifier: verifier,
            }),
        );

        return yield* client.execute(request).pipe(
            Effect.flatMap(HttpClientResponse.schemaBodyJson(TokenResponseSchema)),
            Effect.mapError((e) => new Error(`Token exchange failed: ${String(e)}`)),
        );
    });

const UserInfoResponseSchema = Schema.Struct({
    id: Schema.optional(Schema.String),
    email: Schema.optional(Schema.String),
    verified_email: Schema.optional(Schema.Boolean),
    name: Schema.optional(Schema.String),
    given_name: Schema.optional(Schema.String),
    family_name: Schema.optional(Schema.String),
    picture: Schema.optional(Schema.String),
});

const fetchUserInfo = (accessToken: string) =>
    Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;

        const request = HttpClientRequest.get("https://www.googleapis.com/oauth2/v1/userinfo?alt=json").pipe(
            HttpClientRequest.setHeader("Authorization", `Bearer ${accessToken}`),
        );

        return yield* client.execute(request).pipe(
            Effect.flatMap(HttpClientResponse.schemaBodyJson(UserInfoResponseSchema)),
            Effect.tap((info) =>
                Effect.logInfo(info.email ? `Authenticated as: ${info.email}` : "User info retrieved successfully"),
            ),
            Effect.catchAll((e) =>
                Effect.logWarning(`Failed to fetch user info: ${String(e)}`).pipe(Effect.map(() => undefined)),
            ),
        );
    });

const fetchProjectID = (accessToken: string) =>
    Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;

        const ProjectResponseSchema = Schema.Struct({
            cloudaicompanionProject: Schema.Union(
                Schema.String,
                Schema.Struct({ id: Schema.optional(Schema.String) }),
            ).pipe(Schema.optional),
        });

        const fetchFromEndpoint = (endpoint: string) => {
            const request = HttpClientRequest.post(`${endpoint}/v1internal:loadCodeAssist`).pipe(
                HttpClientRequest.setHeader("Authorization", `Bearer ${accessToken}`),
                HttpClientRequest.setHeader("Content-Type", "application/json"),
                HttpClientRequest.setHeaders(ANTIGRAVITY_HEADERS),
                HttpClientRequest.bodyJson({
                    metadata: {
                        ideType: "IDE_UNSPECIFIED",
                        platform: "PLATFORM_UNSPECIFIED",
                        pluginType: "GEMINI",
                    },
                }),
            );

            return Effect.flatMap(request, (req) =>
                client.execute(req).pipe(
                    Effect.flatMap(HttpClientResponse.schemaBodyJson(ProjectResponseSchema)),
                    Effect.flatMap((data) => {
                        if (typeof data.cloudaicompanionProject === "string" && data.cloudaicompanionProject) {
                            return Effect.succeed(data.cloudaicompanionProject);
                        }
                        if (typeof data.cloudaicompanionProject === "object" && data.cloudaicompanionProject?.id) {
                            return Effect.succeed(data.cloudaicompanionProject.id);
                        }
                        return Effect.fail(new Error(`Invalid response from ${endpoint}`));
                    }),
                    Effect.mapError((e) => new Error(`[${endpoint}] ${String(e)}`)),
                ),
            );
        };

        // We need to check the endpoints in reverse order to get correct api key
        const endpoints = ANTIGRAVITY_ENDPOINT_FALLBACKS.toReversed();

        return yield* Effect.firstSuccessOf(endpoints.map(fetchFromEndpoint)).pipe(
            Effect.tap((id) => Effect.logInfo(`Successfully fetched project ID: ${id}`)),
            Effect.catchAll((e) =>
                Effect.logWarning(`Failed to fetch project ID: ${String(e)}. Using default.`).pipe(
                    Effect.map(() => ANTIGRAVITY_DEFAULT_PROJECT_ID),
                ),
            ),
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

        s.message("Fetching user info...");
        yield* fetchUserInfo(tokens.access_token);

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
