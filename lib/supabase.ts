import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service role key.
 * The `links` table has RLS enabled with no public policies, so ALL reads and
 * writes go through this admin client in API routes — never from the browser.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

let admin: SupabaseClient | null = null;

export function isDbConfigured(): boolean {
  return Boolean(supabaseUrl && serviceKey);
}

export function getAdminClient(): SupabaseClient {
  if (!admin) {
    if (!isDbConfigured()) {
      throw new Error(
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      );
    }
    admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
  }
  return admin;
}

export type LinkRow = {
  slug: string;
  target_url: string;
  title: string | null;
  description: string | null;
  clicks: number;
  created_at: string;
  manage_token: string | null;
  bio_enabled: boolean;
  bio_name: string | null;
  bio_tagline: string | null;
  bio_avatar: string | null;
  bio_links: Array<{ label: string; url: string }> | null;
};
