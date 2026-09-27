-- Glowup migration 005: hashed manage tokens.
-- Tokens are now stored as HMAC-SHA256 hashes (sha256+HMAC → ~43 chars),
-- so a stolen database cannot be used to take over links.
-- Run in Supabase Dashboard → SQL Editor → Run. Safe to re-run.

-- Widen for base64url HMAC output (legacy UUIDs still fit during upgrade).
alter table public.links alter column manage_token type text;

-- Fast token lookups (the app hashes the presented token, then searches).
create index if not exists links_manage_token_idx on public.links (manage_token);

-- Optional hardening: block anon/service-key table access via PostgREST from
-- the outside. The app uses the service role server-side only; RLS is already
-- enabled. No public policies exist, so this is a no-op unless someone added one.
