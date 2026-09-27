-- Glowup migration 002: control room + analytics + bio pages.
-- Run this in the Supabase Dashboard → SQL Editor → Run. Safe to re-run.

-- ── 1. links: ownership token + bio page fields ────────────────────────────
alter table public.links add column if not exists manage_token uuid;
alter table public.links add column if not exists bio_enabled boolean not null default false;
alter table public.links add column if not exists bio_name text;
alter table public.links add column if not exists bio_tagline text;
alter table public.links add column if not exists bio_links jsonb not null default '[]'::jsonb;

-- Backfill: give every existing link a manage token (slug is stable, so this
-- only fills rows once).
update public.links
set manage_token = gen_random_uuid()
where manage_token is null;

-- ── 2. click events for real analytics ────────────────────────────────────
create table if not exists public.click_events (
  id bigint generated always as identity primary key,
  slug text not null,
  ts timestamptz not null default now(),
  referrer_host text,
  country text,
  device text
);

create index if not exists click_events_slug_ts_idx on public.click_events (slug, ts desc);

alter table public.click_events enable row level security;

-- ── 3. replace the old counter RPC with one that also records the event ───
create or replace function public.record_click(
  p_slug text,
  p_referrer text default null,
  p_country text default null,
  p_device text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.click_events (slug, referrer_host, country, device)
  values (p_slug, p_referrer, p_country, p_device);
  update public.links set clicks = clicks + 1 where slug = p_slug;
$$;
