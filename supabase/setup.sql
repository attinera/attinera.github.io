-- Attinera: tables, Row Level Security, private photo storage and account deletion.
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run. Safe to run again.

-- ---------- profiles (one per login)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own profile select" on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
drop policy if exists "own profile delete" on public.profiles;
create policy "own profile select" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "own profile delete" on public.profiles for delete to authenticated using (id = auth.uid());

-- ---------- synced tables: same shape for items, locations, outfits, settings, saved
-- data = the row as the app stores it (photos live in Storage, not here).
-- updated_at = when the user changed it (last write wins). deleted_at = soft delete (so Undo works).
-- synced_at = set by the server on every write; devices pull rows newer than their last pull.
create or replace function public.attinera_touch() returns trigger language plpgsql as $$
begin
  -- Last write wins: ignore an update that is older than what the server already has.
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.synced_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['items', 'locations', 'outfits', 'settings', 'saved'] loop
    execute format($f$
      create table if not exists public.%1$I (
        user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
        id text not null,
        data jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now(),
        deleted_at timestamptz,
        synced_at timestamptz not null default now(),
        primary key (user_id, id)
      );
      create index if not exists %1$s_synced_idx on public.%1$I (user_id, synced_at);
      alter table public.%1$I enable row level security;
      drop policy if exists "own rows select" on public.%1$I;
      drop policy if exists "own rows insert" on public.%1$I;
      drop policy if exists "own rows update" on public.%1$I;
      drop policy if exists "own rows delete" on public.%1$I;
      create policy "own rows select" on public.%1$I for select to authenticated using (user_id = auth.uid());
      create policy "own rows insert" on public.%1$I for insert to authenticated with check (user_id = auth.uid());
      create policy "own rows update" on public.%1$I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
      create policy "own rows delete" on public.%1$I for delete to authenticated using (user_id = auth.uid());
      drop trigger if exists %1$s_touch on public.%1$I;
      create trigger %1$s_touch before insert or update on public.%1$I for each row execute function public.attinera_touch();
    $f$, t);
  end loop;
end $$;

-- ---------- photos: private bucket "closet", paths <user_id>/<item_id>/{cutout,original,thumb}.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('closet', 'closet', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

drop policy if exists "closet owner select" on storage.objects;
drop policy if exists "closet owner insert" on storage.objects;
drop policy if exists "closet owner update" on storage.objects;
drop policy if exists "closet owner delete" on storage.objects;
create policy "closet owner select" on storage.objects for select to authenticated
  using (bucket_id = 'closet' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "closet owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'closet' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "closet owner update" on storage.objects for update to authenticated
  using (bucket_id = 'closet' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'closet' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "closet owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'closet' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- "Delete my account": the app removes photos and rows first, then calls this to remove the login.
-- Runs with elevated rights but can only ever delete the caller's own user.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
