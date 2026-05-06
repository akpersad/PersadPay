-- Phase 4c — Web Push subscriptions
-- Source: /docs/ROADMAP.md Phase 4c
--
-- Each opted-in device per user gets one row. Endpoint is unique
-- (browser-issued URL) so re-subscribing from the same device upserts.
-- Server-side push sender prunes any subscription that returns
-- 410 Gone or 404 Not Found.

create table public.push_subscriptions (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  endpoint      text not null unique,
  p256dh_key    text not null,
  auth_key      text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Users can read + manage their own subscriptions.
create policy "Users manage own push subscriptions"
  on public.push_subscriptions for all using (user_id = auth.uid());

-- Admins can see all subscriptions (useful for the admin dashboard).
create policy "Admins read all push subscriptions"
  on public.push_subscriptions for select using (public.is_admin());

grant select, insert, update, delete on public.push_subscriptions to authenticated;

create trigger push_subscriptions_audit
  after insert or update or delete on public.push_subscriptions
  for each row execute procedure public.audit_trigger();
