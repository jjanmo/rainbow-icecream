export const TOSS_BASE_URL = "https://openapi.tossinvest.com";

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

// Best-effort in-memory cache — not guaranteed to survive across serverless
// invocations. Worst case on a miss is one extra token request, never a
// correctness issue.
let cachedToken: CachedToken | null = null;

export async function getTossAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 5_000) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.TOSS_CLIENT_ID;
  const clientSecret = process.env.TOSS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "TOSS_CLIENT_ID / TOSS_CLIENT_SECRET is not configured. Add them to .env.local.",
    );
  }

  const res = await fetch(`${TOSS_BASE_URL}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`Toss OAuth token request failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

/**
 * Toss doesn't publish exact rate limits — only "check the response headers."
 * Defensively probes a few common header name spellings; returns undefined
 * if none are present, in which case callers fall back to a fixed interval.
 */
export function readRateLimitRemaining(headers: Headers): number | undefined {
  const candidates = ["x-ratelimit-remaining", "ratelimit-remaining", "x-rate-limit-remaining"];
  for (const name of candidates) {
    const value = headers.get(name);
    if (value !== null) {
      const n = Number(value);
      if (!Number.isNaN(n)) return n;
    }
  }
  return undefined;
}
