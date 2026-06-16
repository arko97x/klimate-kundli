-- Frozen generated-kundli screenshots.

alter table public.kundlis
  add column if not exists snapshot jsonb;

comment on column public.kundlis.snapshot is
  'Rendered kundli snapshot manifest. Old records remain null until backfilled.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kundli-snapshots',
  'kundli-snapshots',
  true,
  5242880,
  array['image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read kundli snapshots" on storage.objects;
create policy "Public read kundli snapshots"
on storage.objects
for select
using (bucket_id = 'kundli-snapshots');
