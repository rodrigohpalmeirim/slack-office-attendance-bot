/**
 * Slack "Sign in with Slack" (OpenID Connect) + stateless signed-cookie
 * sessions. No external JWT library — we sign a compact token with HMAC-SHA256
 * via Web Crypto.
 */

const CLIENT_ID = process.env.SLACK_CLIENT_ID || "";
const CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET || "";
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const ALLOWED_TEAM_ID = process.env.SLACK_TEAM_ID || "";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const SESSION_COOKIE = "att_session";
export const STATE_COOKIE = "att_oauth_state";

export function isAuthConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET && PUBLIC_URL && SESSION_SECRET);
}

export const redirectUri = `${PUBLIC_URL}/auth/callback`;

// --- base64url helpers ---

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlEncodeStr(str: string): string {
  return b64urlEncode(new TextEncoder().encode(str));
}

function b64urlDecodeToStr(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// --- HMAC signing ---

let keyPromise: Promise<CryptoKey> | null = null;
function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
  }
  return keyPromise;
}

async function sign(data: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await getKey(), new TextEncoder().encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

export interface Session {
  uid: string; // Slack user ID
  name: string;
  exp: number; // unix seconds
}

/** Create a signed session token of the form base64url(payload).signature. */
export async function createSessionToken(uid: string, name: string): Promise<string> {
  const payload: Session = { uid, name, exp: nowSeconds() + SESSION_TTL_SECONDS };
  const body = b64urlEncodeStr(JSON.stringify(payload));
  return `${body}.${await sign(body)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if ((await sign(body)) !== sig) return null;
  try {
    const session = JSON.parse(b64urlDecodeToStr(body)) as Session;
    if (session.exp < nowSeconds()) return null;
    return session;
  } catch {
    return null;
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// --- OAuth flow ---

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    scope: "openid profile",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    state,
  });
  // Pin sign-in to our workspace so guests/external members authenticate here
  // (where the app is installed) instead of their own home workspace — which
  // otherwise fails with invalid_team_for_non_distributed_app.
  if (ALLOWED_TEAM_ID) params.set("team", ALLOWED_TEAM_ID);
  return `https://slack.com/openid/connect/authorize?${params}`;
}

interface OidcClaims {
  uid: string;
  name: string;
  teamId: string;
}

/**
 * Exchange an authorization code for tokens and extract the Slack user from the
 * returned id_token. Throws on any failure.
 */
export async function exchangeCodeForClaims(code: string): Promise<OidcClaims> {
  const res = await fetch("https://slack.com/api/openid.connect.token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const data = (await res.json()) as { ok: boolean; id_token?: string; error?: string };
  if (!data.ok || !data.id_token) {
    throw new Error(`Slack token exchange failed: ${data.error || "unknown"}`);
  }

  // id_token is a JWT; the payload (received directly from Slack over TLS)
  // carries the identity claims. We trust the transport, so we read the
  // payload without re-verifying the signature.
  const payloadSeg = data.id_token.split(".")[1];
  const claims = JSON.parse(b64urlDecodeToStr(payloadSeg)) as Record<string, string>;

  const uid = claims["https://slack.com/user_id"];
  const teamId = claims["https://slack.com/team_id"];
  const name = claims["name"] || claims["given_name"] || uid;
  if (!uid) throw new Error("id_token missing user_id claim");

  if (ALLOWED_TEAM_ID && teamId !== ALLOWED_TEAM_ID) {
    throw new Error("user is not a member of the allowed workspace");
  }

  return { uid, name, teamId };
}

// --- Cookie helpers ---

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.get("cookie") || "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

const secure = PUBLIC_URL.startsWith("https://");

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function stateCookie(state: string): string {
  return `${STATE_COOKIE}=${state}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600${secure ? "; Secure" : ""}`;
}

export function clearStateCookie(): string {
  return `${STATE_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function randomState(): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
}
