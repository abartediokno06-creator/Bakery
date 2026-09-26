import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.",
  );
}

export type TypedSupabaseClient = SupabaseClient<Database>;

export const supabase: TypedSupabaseClient = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true, // keeps the cashier signed in through internet drops
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "bakery-pos-auth",
  },
  realtime: { params: { eventsPerSecond: 10 } },
  global: { headers: { "x-client-info": "bakery-pos-web" } },
});

/** Normalizes Supabase/PostgREST errors into a readable message. */
export function toErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return "Something went wrong. Check your connection and try again.";
}

/**
 * True when an RPC failure is caused by connectivity (retry later),
 * false when the server rejected the request (needs a person to fix).
 */
export function isNetworkError(err: unknown): boolean {
  if (!navigator.onLine) return true;
  if (err instanceof TypeError) return true; // fetch failed
  const msg = toErrorMessage(err).toLowerCase();
  return msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout");
}
