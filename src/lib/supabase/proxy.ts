import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

const PROTECTED_PREFIXES = ["/setup", "/rebalance", "/holdings"];

// This Supabase project may be shared with other apps. A valid session alone
// doesn't mean the account was provisioned for THIS app — that's tracked via
// the admin-only app_metadata.apps array (set manually in the SQL editor).
const APP_ID = "rainbow_icecream";

function isProtectedPath(pathname: string) {
  if (pathname === "/") return true;
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function hasAppAccess(user: User | null): boolean {
  const apps = user?.app_metadata?.apps;
  return Array.isArray(apps) && apps.includes(APP_ID);
}

/**
 * Refreshes the Supabase session cookie on every navigation and gates
 * /setup, /rebalance, /holdings, and / behind auth. Called from root proxy.ts.
 * Uses getUser() (JWT re-verified against the Auth server), not getSession().
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { url, anonKey } = getSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // A transient Supabase outage should not 500 every page — treat it as
  // "not authenticated" for gating purposes instead of throwing.
  let user: User | null = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (err) {
    console.error("Supabase getUser() failed in proxy", err);
  }

  const { pathname } = request.nextUrl;
  const authorized = hasAppAccess(user);

  if (!authorized && isProtectedPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    // Distinguish "not logged in" from "logged in, but this account isn't
    // provisioned for this app" so the login page can show the right message.
    if (user) loginUrl.searchParams.set("error", "no_access");
    return NextResponse.redirect(loginUrl);
  }

  if (authorized && pathname === "/login") {
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  return response;
}
