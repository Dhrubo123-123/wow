import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";

// Routes reachable without an authenticated session.
const PUBLIC_PATHS = ["/", "/login", "/signup", "/offline"];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Next.js internals, static assets, PWA/manifest files, API auth routes.
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname === "/manifest.webmanifest") return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname === "/sw.js") return true;
  if (pathname === "/apple-touch-icon.png") return true;
  if (pathname.startsWith("/icons/")) return true;
  return false;
}

/**
 * Refreshes the Supabase auth session on every request and redirects
 * unauthenticated users away from protected routes. Must be called from
 * the root proxy.ts (Next.js 16's renamed middleware convention) — see
 * Next.js/@supabase/ssr docs for why this can't simply live in a Server
 * Component.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run any logic between createServerClient and
  // getUser() — it revalidates the token against Supabase Auth.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // API routes must never get an HTML redirect on missing auth — a
  // `fetch()` caller would follow it to the login page and choke trying
  // to parse HTML as JSON (found live in Phase 21's security audit:
  // every /api/* route was returning 307 instead of 401). Every route
  // handler already does its own `if (!user) return 401` check, so it's
  // safe to just let these through unredirected.
  if (pathname.startsWith("/api/")) {
    return response;
  }

  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
