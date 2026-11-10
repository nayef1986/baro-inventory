-- ============================================================
-- 0010_container_commissions.sql — «حساباتي»: نسبة فواتير الحاويات
--
-- جهة واحدة تحاسب صاحب الحساب بنسبة (افتراضياً 2.5%) من كل فاتورة
-- حاوية، وتدفع له دفعات عامة غير مربوطة بحاوية معيّنة. فالمعادلة:
--
--     الباقي لي = مجموع النسب المستحقة − مجموع الاستلامات
--
-- commission تُخزَّن صراحة (تُحسب في الواجهة من المبلغ × النسبة)
-- لأن بعض الفواتير القديمة تُعرف نسبتها ولا يُعرف مبلغها بدقة.
-- نفس قفل 0009: كل صف لصاحبه، و anon بلا صلاحية.
-- ============================================================

create table if not exists public.pa_container_invoices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  invoice_date   date not null default current_date,
  container_no   text not null default '',
  invoice_no     text not null default '',
  invoice_amount numeric(14,2) not null default 0 check (invoice_amount >= 0),
  rate           numeric(6,3)  not null default 2.5 check (rate >= 0 and rate <= 100),
  commission     numeric(14,2) not null check (commission >= 0),
  note           text not null default '',
  created_at     timestamptz not null default now()
);

create table if not exists public.pa_commission_receipts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  receipt_date date not null default current_date,
  amount       numeric(14,2) not null check (amount > 0),
  method       text not null default '',
  note         text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists pa_cinv_user_idx on public.pa_container_invoices (user_id, invoice_date);
create index if not exists pa_crec_user_idx on public.pa_commission_receipts (user_id, receipt_date);

alter table public.pa_container_invoices  enable row level security;
alter table public.pa_commission_receipts enable row level security;

revoke all on public.pa_container_invoices, public.pa_commission_receipts from anon;
grant select, insert, update, delete on public.pa_container_invoices, public.pa_commission_receipts to authenticated;

drop policy if exists pa_cinv_owner on public.pa_container_invoices;
create policy pa_cinv_owner on public.pa_container_invoices
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists pa_crec_owner on public.pa_commission_receipts;
create policy pa_crec_owner on public.pa_commission_receipts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
