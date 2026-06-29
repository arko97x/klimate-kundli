-- Supabase SQL Migration: Archiving generated kundlis before clean-slate overhaul
-- Run this in the Supabase SQL editor or apply via CLI.

-- 1. Create the archived table duplicating the schema of public.kundlis
create table if not exists public.archived_kundlis_v260629 (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  birth_city_display text not null,
  birth_year integer not null check (birth_year >= 1940 and birth_year <= 2099),
  birth_city jsonb not null,
  lived_cities jsonb not null,
  result jsonb not null,
  snapshot jsonb,
  created_at timestamptz not null default now()
);

comment on table public.archived_kundlis_v260629 is
  'Archive of all visitor kundlis generated up to June 29, 2026.';

-- Create index on created_at desc for performance
create index if not exists archived_kundlis_v260629_created_at_idx 
  on public.archived_kundlis_v260629 (created_at desc);

-- Enable RLS (RLS rules match public.kundlis: service-role/admin access only)
alter table public.archived_kundlis_v260629 enable row level security;

-- 2. Move all data from public.kundlis to public.archived_kundlis_v260629
insert into public.archived_kundlis_v260629 (
  id,
  slug,
  birth_city_display,
  birth_year,
  birth_city,
  lived_cities,
  result,
  snapshot,
  created_at
)
select 
  id,
  slug,
  birth_city_display,
  birth_year,
  birth_city,
  lived_cities,
  result,
  snapshot,
  created_at
from public.kundlis;

-- 3. Truncate the original public.kundlis table to establish a clean slate
truncate table public.kundlis;
