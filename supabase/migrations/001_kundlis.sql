-- Run in Supabase SQL editor (or via supabase db push)

create table if not exists public.kundlis (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  birth_city_display text not null,
  birth_year integer not null check (birth_year >= 1940 and birth_year <= 2099),
  birth_city jsonb not null,
  lived_cities jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists kundlis_created_at_idx on public.kundlis (created_at desc);

alter table public.kundlis enable row level security;

-- Backend uses service role key; no public anon policies required for v1.
