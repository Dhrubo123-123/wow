import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Browser Supabase client. Uses the publishable ("anon") key only —
 * safe to expose, RLS enforces access control. Create a fresh instance
 * per call site rather than a module-level singleton, per @supabase/ssr
 * guidance for Next.js App Router.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
