-- Glowup migration 003: fix manage_token default (new rows were getting NULL).
-- Run in Supabase Dashboard → SQL Editor → Run. Safe to re-run.

alter table public.links alter column manage_token set default gen_random_uuid();

update public.links
set manage_token = gen_random_uuid()
where manage_token is null;
