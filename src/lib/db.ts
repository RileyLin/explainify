import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/**
 * Public Supabase client (uses anon key, respects RLS).
 * Safe to use in both client and server components.
 * Returns null if Supabase is not configured.
 */
let _supabase: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
    );
  }
  if (!_supabase) {
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

/** @deprecated Use getSupabase() instead — this will throw if env vars are missing */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as any)[prop];
  },
});

/**
 * Server-side Supabase client with service role key (bypasses RLS).
 * Only use in API routes and server components, never expose to client.
 */
let _serviceClient: SupabaseClient | null = null;
export function getServiceClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "Supabase service role is not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }
  if (!_serviceClient) {
    _serviceClient = createClient(supabaseUrl, supabaseServiceKey);
  }
  return _serviceClient;
}

export interface ExplainerRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  template: string;
  data: Record<string, unknown>;
  source_content: string | null;
  created_at: string;
  updated_at: string;
  views: number;
  is_public: boolean;
  user_id: string | null;
  parent_slug: string | null;
  source_node_id: string | null;
}
