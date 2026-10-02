import { randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { auth, UnauthorizedError, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { getSetting, setSetting, type Db } from "../db";
import type { Gateway, PollResult } from "../jobs/runner";
import { VidiqError } from "./errors";
export { CREDIT_COST } from "./costs";
import {
  classifyToolError,
  parseBalance,
  parsePollResult,
  readToolPayload,
  toolErrorText,
  type Balance,
} from "./parse";

export const VIDIQ_MCP_URL = new URL("https://mcp.vidiq.com/mcp");

const KEYS = {
  client: "vidiq.client",
  tokens: "vidiq.tokens",
  verifier: "vidiq.verifier",
  state: "vidiq.state",
  pendingUrl: "vidiq.pendingUrl",
} as const;

type StoredClient = { redirectUrl: string; info: OAuthClientInformationMixed };

/** OAuth client state kept in SQLite so the connection survives restarts. */
class StoredOAuthProvider implements OAuthClientProvider {
  authorizationUrl: URL | null = null;

  constructor(
    private readonly db: Db,
    private readonly callbackUrl: string,
    private readonly interactive: boolean,
  ) {}

  get redirectUrl() {
    return this.callbackUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "YouTube Video Summaries",
      redirect_uris: [this.callbackUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "api",
    };
  }

  state() {
    const value = randomBytes(16).toString("hex");
    setSetting(this.db, KEYS.state, value);
    return value;
  }

  clientInformation() {
    const stored = getSetting<StoredClient>(this.db, KEYS.client);
    return stored?.redirectUrl === this.callbackUrl ? stored.info : undefined;
  }

  saveClientInformation(info: OAuthClientInformationMixed) {
    setSetting(this.db, KEYS.client, { redirectUrl: this.callbackUrl, info } satisfies StoredClient);
  }

  tokens() {
    return getSetting<OAuthTokens>(this.db, KEYS.tokens);
  }

  saveTokens(tokens: OAuthTokens) {
    setSetting(this.db, KEYS.tokens, tokens);
  }

  redirectToAuthorization(url: URL) {
    if (!this.interactive) return;
    this.authorizationUrl = url;
    setSetting(this.db, KEYS.pendingUrl, url.toString());
  }

  saveCodeVerifier(verifier: string) {
    setSetting(this.db, KEYS.verifier, verifier);
  }

  codeVerifier() {
    const verifier = getSetting<string>(this.db, KEYS.verifier);
    if (!verifier) throw new VidiqError("auth", "The sign-in link expired. Start the vidIQ connection again.");
    return verifier;
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all" || scope === "client") setSetting(this.db, KEYS.client, undefined);
    if (scope === "all" || scope === "tokens") setSetting(this.db, KEYS.tokens, undefined);
    if (scope === "all" || scope === "verifier") setSetting(this.db, KEYS.verifier, undefined);
  }
}

export type ConnectionState =
  | { status: "connected" }
  | { status: "pending"; authorizationUrl: string }
  | { status: "disconnected" };

export function connectionState(db: Db): ConnectionState {
  if (getSetting(db, KEYS.tokens)) return { status: "connected" };
  const pendingUrl = getSetting<string>(db, KEYS.pendingUrl);
  return pendingUrl ? { status: "pending", authorizationUrl: pendingUrl } : { status: "disconnected" };
}

/** Starts a fresh sign-in and returns the vidIQ page the user should open. */
export async function startAuthorization(db: Db, callbackUrl: string): Promise<string> {
  clearSession(db);
  const provider = new StoredOAuthProvider(db, callbackUrl, true);
  const result = await auth(provider, { serverUrl: VIDIQ_MCP_URL, scope: "api" });
  if (result === "AUTHORIZED" || !provider.authorizationUrl) {
    throw new VidiqError("fatal", "vidIQ did not return a sign-in link. Try again.");
  }
  return provider.authorizationUrl.toString();
}

export async function finishAuthorization(db: Db, callbackUrl: string, code: string, state: string | null) {
  const expected = getSetting<string>(db, KEYS.state);
  if (!expected || state !== expected) {
    throw new VidiqError("auth", "This sign-in link is out of date. Start the vidIQ connection again from the app.");
  }
  const provider = new StoredOAuthProvider(db, callbackUrl, false);
  await auth(provider, { serverUrl: VIDIQ_MCP_URL, authorizationCode: code });
  setSetting(db, KEYS.state, undefined);
  setSetting(db, KEYS.pendingUrl, undefined);
  setSetting(db, KEYS.verifier, undefined);
  await resetClient();
}

/** Forgets the signed-in account (and any half-finished sign-in). */
export function clearSession(db: Db): void {
  for (const key of [KEYS.tokens, KEYS.verifier, KEYS.state, KEYS.pendingUrl]) setSetting(db, key, undefined);
  void resetClient();
}

export function cancelAuthorization(db: Db): void {
  for (const key of [KEYS.verifier, KEYS.state, KEYS.pendingUrl]) setSetting(db, key, undefined);
}

const shared = globalThis as unknown as { __vidiqClient?: Promise<Client> | null };

async function resetClient() {
  const pending = shared.__vidiqClient;
  shared.__vidiqClient = null;
  try {
    await (await pending)?.close();
  } catch {
    // The old connection is being thrown away; nothing to clean up.
  }
}

function getClient(db: Db): Promise<Client> {
  if (!getSetting(db, KEYS.tokens)) {
    return Promise.reject(new VidiqError("auth", "Connect your vidIQ account first."));
  }
  shared.__vidiqClient ??= (async () => {
    const stored = getSetting<StoredClient>(db, KEYS.client);
    const provider = new StoredOAuthProvider(db, stored?.redirectUrl ?? "http://localhost/", false);
    const client = new Client({ name: "youtube-video-summaries", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(VIDIQ_MCP_URL, { authProvider: provider }));
    return client;
  })().catch((error) => {
    shared.__vidiqClient = null;
    throw error;
  });
  return shared.__vidiqClient;
}

/** Calls a vidIQ tool and turns every failure into a VidiqError the runner understands. */
async function callTool(db: Db, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  let result: Awaited<ReturnType<Client["callTool"]>>;
  try {
    const client = await getClient(db);
    result = await client.callTool({ name, arguments: args });
  } catch (error) {
    if (error instanceof VidiqError) throw error;
    await resetClient();
    if (error instanceof UnauthorizedError || /\b401\b|unauthori[sz]ed|invalid_grant/i.test(String(error))) {
      setSetting(db, KEYS.tokens, undefined);
      throw new VidiqError("auth", "Your vidIQ sign-in expired. Connect vidIQ again to continue.");
    }
    throw new VidiqError("transient", `Could not reach vidIQ: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (result.isError) {
    const message = toolErrorText(result);
    throw new VidiqError(classifyToolError(message), message);
  }
  return readToolPayload(result);
}

export async function getBalance(db: Db): Promise<Balance> {
  return parseBalance((await callTool(db, "vidiq_balance")) as Record<string, unknown>);
}

export function createGateway(db: Db): Gateway {
  const submitWith = async (isShort: boolean, videoId: string, prompt: string) => {
    const payload = isShort
      ? await callTool(db, "vidiq_watch_shortform_content", { url: `https://www.youtube.com/shorts/${videoId}`, prompt })
      : await callTool(db, "vidiq_video_watch", { video: videoId, prompt });
    const jobId = (payload as { mcpJobId?: unknown })?.mcpJobId;
    if (typeof jobId !== "string") throw new VidiqError("fatal", "vidIQ did not start a summary job.");
    return jobId;
  };

  return {
    async submit(row, prompt) {
      try {
        return await submitWith(row.isShort, row.videoId, prompt);
      } catch (error) {
        // A link may not say whether it is a Short; vidIQ tells us, so switch tools once.
        const wrongFormat = error instanceof VidiqError && error.kind === "fatal" && /short-?form|long-?form|shorts/i.test(error.message);
        if (!wrongFormat) throw error;
        return submitWith(!row.isShort, row.videoId, prompt);
      }
    },
    async poll(vidiqJobId): Promise<PollResult> {
      return parsePollResult((await callTool(db, "vidiq_job_poll", { mcpJobId: vidiqJobId })) as Parameters<typeof parsePollResult>[0]);
    },
  };
}
