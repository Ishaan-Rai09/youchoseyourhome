-- Purl.link schema — run this in the Supabase Dashboard → SQL Editor → Run.
create extension if not exists pgcrypto;

create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  slug text primary key,
  target_url text not null,
  title text,
  description text,
  clicks integer not null default 0,
  created_at timestamptz not null default now()
);

-- Slugs must be lowercase letters/numbers/hyphens, 1-50 chars, no leading/trailing hyphen.
alter table public.links
  add constraint links_slug_format
  check (slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$');

create index if not exists links_target_idx on public.links (target_url);

-- RLS on: the anon key can do nothing. All reads/writes happen through the
-- service-role key inside our API routes, never from the browser.
alter table public.links enable row level security;

-- Atomic increment used by the redirect route.
create or replace function public.increment_clicks(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.links set clicks = clicks + 1 where slug = p_slug;
$$;
