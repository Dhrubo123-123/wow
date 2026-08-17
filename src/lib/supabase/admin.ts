import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Privileged Supabase client using the secret/service-role key. Bypasses
 * RLS entirely — use only in trusted server code (API routes, server
 * actions) for operations users must never perform directly: awarding
 * XP, writing AI evaluations, generating quests, etc.
 *
 * The `server-only` import makes any accidental client-bundle import of
 * this file a build error instead of a leaked secret.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
