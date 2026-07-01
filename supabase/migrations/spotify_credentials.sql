-- Spotify connection — mirrors the google_credentials setup.
-- Apply this in the Morchitask Supabase project (SQL editor or `apply_migration`)
-- BEFORE the Spotify connect flow can work. The refresh token is only ever read
-- by the service role (the spotify-auth edge function); the browser never sees it.

-- 1. A flag on the profile so the UI knows the user is connected.
alter table public.profiles
  add column if not exists spotify_connected boolean not null default false;

-- 2. The credentials table (one row per user; refresh token + granted scope).
create table if not exists public.spotify_credentials (
  owner_id uuid primary key references public.profiles (id) on delete cascade,
  refresh_token text not null,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.spotify_credentials enable row level security;

-- No SELECT/INSERT/UPDATE policy for normal users → only the service role reads the
-- refresh token. A user may DELETE their own row (the "Desconectar" button).
drop policy if exists "own delete" on public.spotify_credentials;
create policy "own delete" on public.spotify_credentials
  for delete using (auth.uid() = owner_id);

-- 3. SECURITY DEFINER RPC used right after the OAuth exchange to store the token
--    and flip the connected flag (same pattern as connect_google_calendar).
create or replace function public.connect_spotify(
  p_owner_id uuid,
  p_refresh_token text,
  p_scope text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.spotify_credentials (owner_id, refresh_token, scope)
    values (p_owner_id, p_refresh_token, p_scope)
    on conflict (owner_id) do update
      set refresh_token = excluded.refresh_token,
          scope = excluded.scope,
          updated_at = now();
  update public.profiles set spotify_connected = true where id = p_owner_id;
end;
$$;
