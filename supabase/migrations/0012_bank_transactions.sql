-- ============================================================
-- 0012_bank_transactions.sql — «حساباتي»: تحويلات كشف البنك وتصنيفها
--
-- يُرفع ملف كشف البنك (xls من الأهلي) فتُحفظ كل حركة مرة واحدة
-- (dedup = التاريخ|المبلغ|النوع|الوصف، فرفع نفس الكشف مرتين لا يكرّر).
-- ثم تُصنَّف كل حركة: كونتينر، مبيعات فروع، استرداد مصاريف (طيران، إعلان،
-- فاتورة دفعتها عن الشركة)، راتب، إيجار، أهل، أخرى.
-- والحوالة الواحدة قد تُقسَّم (category = 'split' و splits = [{cat, amount, note}])
-- مثل: 12,500 = إيجار 10,000 + استرداد مصاريف 2,500.
-- كل جزء «كونتينر» أو «مبيعات فروع» يُنشئ استلاماً في دفتره بمبلغ الجزء،
-- مربوطاً بالحوالة (bank_txn_id) — فلا يُحسب مرتين.
-- نفس القفل: كل صف لصاحبه، و anon بلا صلاحية.
-- ============================================================

create table if not exists public.pa_bank_txns (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  txn_date    date not null,
  txn_type    text not null default '',
  description text not null default '',
  account     text not null default '',
  note        text not null default '',
  amount      numeric(14,2) not null,
  category    text not null default ''
              check (category in ('', 'containers', 'branches', 'reimburse', 'salary', 'rent', 'family', 'other', 'split')),
  splits      jsonb not null default '[]'::jsonb,
  dedup       text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, dedup)
);
create index if not exists pa_bank_user_idx on public.pa_bank_txns (user_id, txn_date);

alter table public.pa_commission_receipts
  add column if not exists bank_txn_id uuid references public.pa_bank_txns(id) on delete cascade;
create index if not exists pa_crec_bank_idx on public.pa_commission_receipts (bank_txn_id);

alter table public.pa_bank_txns enable row level security;
revoke all on public.pa_bank_txns from anon;
grant select, insert, update, delete on public.pa_bank_txns to authenticated;

drop policy if exists pa_bank_owner on public.pa_bank_txns;
create policy pa_bank_owner on public.pa_bank_txns for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
