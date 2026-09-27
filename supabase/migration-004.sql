-- Glowup migration 004: avatar image for bio pages.
-- Run in Supabase Dashboard → SQL Editor → Run. Safe to re-run.

alter table public.links add column if not exists bio_avatar text;
