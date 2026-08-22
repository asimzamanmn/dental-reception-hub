import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const env = import.meta.env as Record<string, string | undefined>;
const url = env["VITE_SUPABASE_URL"];
const key = env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? env["VITE_SUPABASE_ANON_KEY"];

console.log("URL:", url);
console.log("Key exists:", !!key);
console.log("Key prefix:", key?.substring(0, 20));

export const isSupabaseConfigured = Boolean(url && key);

const isBrowser = typeof window !== "undefined";

export const supabase: SupabaseClient = createClient(
  url ?? "https://placeholder.supabase.co",
  key ?? "placeholder-anon-key",
  { auth: { persistSession: isBrowser, autoRefreshToken: isBrowser } },
);
