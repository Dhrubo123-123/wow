import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

/**
 * Server Supabase client for use in Server Components, Route Handlers,
 * and Server Actions. Reads the caller's session from cookies — still
 * subject to RLS (uses the publishable/anon key), unlike the admin
 * client below.
 *
 * Server Components can't write cookies; the try/catch below lets this
 * be called safely from one, as long as middleware is also refreshing
 * the session (see proxy.ts).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — middleware refreshes the
            // session instead. Safe to ignore.
          }
        },
      },
    },
  );
}
