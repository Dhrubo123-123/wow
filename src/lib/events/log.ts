import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { logError } from "@/lib/observability/logger";
import type { EventName } from "./names";

/**
 * Server-side event logging — used from route handlers that already
 * have an admin (service-role) or user-scoped client in hand (the
 * evaluate route, streak updates, etc.). Best-effort by design: a
 * failed analytics write must never break the actual user-facing
 * action it's attached to, so this only logs the error and moves on.
 */
export async function logEvent(
  client: SupabaseClient<Database>,
  userId: string,
  name: EventName,
  props: Record<string, unknown> = {},
) {
  const { error } = await client.from("events").insert({
    user_id: userId,
    name,
    props: props as Json,
  });
  if (error) {
    logError("db", error, { table: "events", event: name, userId });
  }
}
