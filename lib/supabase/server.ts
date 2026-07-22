import { createServerClient } from "@supabase/ssr";
import { parseCookie, stringifySetCookie } from "cookie";
import type { IncomingMessage, ServerResponse } from "http";
import { getSupabaseEnv } from "./env";

/**
 * Server-side Supabase client for use inside getServerSideProps.
 * Create a fresh client per request — never share across requests.
 */
export function createSupabaseServerClient(req: IncomingMessage, res: ServerResponse) {
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        const parsed = parseCookie(req.headers.cookie ?? "");
        return Object.entries(parsed)
          .filter((entry): entry is [string, string] => entry[1] !== undefined)
          .map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        const existing = res.getHeader("Set-Cookie");
        const existingArr = Array.isArray(existing)
          ? existing.map(String)
          : existing
            ? [String(existing)]
            : [];
        const newCookies = cookiesToSet.map(({ name, value, options }) =>
          stringifySetCookie({ name, value, ...options }),
        );
        res.setHeader("Set-Cookie", [...existingArr, ...newCookies]);
      },
    },
  });
}
