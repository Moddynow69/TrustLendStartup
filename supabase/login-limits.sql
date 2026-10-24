-- Login attempt limits and login history for Loan Bandhu.
--
-- Run once in Supabase -> SQL Editor (safe to re-run). Login itself stays
-- on Firebase; this only counts failed attempts and records each attempt.
--
-- Security: the tables live in a `private` schema that Supabase's public
-- API never exposes. Only the four functions below can touch them, and
-- only the server's secret key (service_role) may call those functions.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Failed-attempt counters, one row per key ("acct:<username>" or "ip:<address>").
create table if not exists private.login_failures (
  key          text primary key,
  count        integer     not null default 0,
  window_start timestamptz not null default now()
);

-- One row per login attempt, kept 90 days.
create table if not exists private.login_events (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  identifier text        not null,
  ip         text,
  outcome    text        not null check (outcome in ('success', 'invalid', 'blocked', 'throttled', 'disabled')),
  user_id    text
);
create index if not exists login_events_at_idx on private.login_events (at desc);
create index if not exists login_events_identifier_idx on private.login_events (identifier, at desc);

alter table private.login_failures enable row level security;
alter table private.login_events enable row level security;

-- Seconds until either key may try again (0 = allowed).
create or replace function public.login_check(
  p_account text, p_ip text, p_account_limit integer, p_ip_limit integer, p_window_seconds integer
) returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce(max(greatest(1, ceil(extract(epoch from
           (f.window_start + make_interval(secs => p_window_seconds)) - now()))::integer)), 0)
  from private.login_failures f
  where f.window_start > now() - make_interval(secs => p_window_seconds)
    and ((f.key = p_account and f.count >= p_account_limit)
      or (f.key = p_ip and f.count >= p_ip_limit));
$$;

-- Counts a failure against both keys (starting a new window if the old
-- one expired) and records the attempt.
create or replace function public.login_failed(
  p_account text, p_ip text, p_window_seconds integer,
  p_identifier text, p_ip_address text, p_outcome text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.login_failures as f (key, count, window_start)
  select k, 1, now() from unnest(array[p_account, p_ip]) as k
  on conflict (key) do update set
    count = case when f.window_start <= now() - make_interval(secs => p_window_seconds)
                 then 1 else f.count + 1 end,
    window_start = case when f.window_start <= now() - make_interval(secs => p_window_seconds)
                        then now() else f.window_start end;

  insert into private.login_events (identifier, ip, outcome)
  values (left(p_identifier, 200), left(p_ip_address, 100), p_outcome);
end;
$$;

-- Clears the account's failures after a successful login and records it.
create or replace function public.login_succeeded(
  p_account text, p_identifier text, p_ip_address text, p_user_id text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from private.login_failures where key = p_account;
  insert into private.login_events (identifier, ip, outcome, user_id)
  values (left(p_identifier, 200), left(p_ip_address, 100), 'success', p_user_id);

  -- Occasional housekeeping: old history and expired counters.
  if random() < 0.05 then
    delete from private.login_events where at < now() - interval '90 days';
    delete from private.login_failures where window_start < now() - interval '1 day';
  end if;
end;
$$;

-- Records an attempt that wasn't a password failure (blocked by the limit,
-- or a disabled account).
create or replace function public.login_log(
  p_identifier text, p_ip_address text, p_outcome text, p_user_id text default null
) returns void
language sql security definer set search_path = ''
as $$
  insert into private.login_events (identifier, ip, outcome, user_id)
  values (left(p_identifier, 200), left(p_ip_address, 100), p_outcome, p_user_id);
$$;

-- Only the server (service_role) may call these.
revoke execute on function public.login_check(text, text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.login_failed(text, text, integer, text, text, text) from public, anon, authenticated;
revoke execute on function public.login_succeeded(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.login_log(text, text, text, text) from public, anon, authenticated;
grant execute on function public.login_check(text, text, integer, integer, integer) to service_role;
grant execute on function public.login_failed(text, text, integer, text, text, text) to service_role;
grant execute on function public.login_succeeded(text, text, text, text) to service_role;
grant execute on function public.login_log(text, text, text, text) to service_role;
