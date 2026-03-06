import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Public Supabase client (uses anon key, respects RLS).
 * Safe to use in both client and server components.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Server-side Supabase client with service role key (bypasses RLS).
 * Only use in API routes and server components, never expose to client.
 */
export function getServiceClient() {
  if (!supabaseServiceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createClient(supabaseUrl, supabaseServiceKey);
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
}
