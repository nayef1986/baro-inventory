-- ============================================================
-- 0009_personal_accounts.sql — «حساباتي»: حسابات شخصية مستقلة
--
-- تطبيق منفصل عن COCO CAKE (deploy/my-accounts) يشارك نفس مشروع
-- Supabase فقط. بخلاف COCO CAKE هذه بيانات شخصية: كل صف مربوط
-- بصاحبه (auth.uid()) ولا يقرأه أو يكتبه غيره — الدور anon بلا صلاحية.
-- ============================================================

create table if not exists public.pa_accounts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  -- النسبة المخصّصة لهذا الحساب من الدخل (0–100)
  percent    numeric(5,2) not null default 0 check (percent >= 0 and percent <= 100),
  note       text,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.pa_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id  uuid not null references public.pa_accounts(id) on delete cascade,
  entry_date  date not null default current_date,
  description text not null default '',
  -- in = وارد (له)، out = صادر (عليه)
  kind        text not null check (kind in ('in', 'out')),
  amount      numeric(14,2) not null check (amount > 0),
  created_at  timestamptz not null default now()
);

create index if not exists pa_accounts_user_idx on public.pa_accounts (user_id);
create index if not exists pa_entries_account_idx on public.pa_entries (account_id, entry_date);
create index if not exists pa_entries_user_idx on public.pa_entries (user_id);

alter table public.pa_accounts enable row level security;
alter table public.pa_entries  enable row level security;

revoke all on public.pa_accounts, public.pa_entries from anon;
grant select, insert, update, delete on public.pa_accounts, public.pa_entries to authenticated;

drop policy if exists pa_accounts_owner on public.pa_accounts;
create policy pa_accounts_owner on public.pa_accounts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists pa_entries_owner on public.pa_entries;
create policy pa_entries_owner on public.pa_entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.pa_accounts a
                where a.id = account_id and a.user_id = (select auth.uid()))
  );
