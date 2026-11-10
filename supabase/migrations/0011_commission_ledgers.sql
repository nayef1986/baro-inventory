-- ============================================================
-- 0011_commission_ledgers.sql — «حساباتي»: أكثر من نسبة عمولة
--
-- نفس جدولي 0010 يحملان الآن أكثر من دفتر، يفرّقها عمود ledger:
--   containers  فواتير الحاويات   2.5%
--   branches    مبيعات الفروع     0.5%
-- الصفوف الموجودة كلها للحاويات (القيمة الافتراضية).
-- في بند الفروع: container_no = اسم الفرع، invoice_no = الفترة.
-- ============================================================

alter table public.pa_container_invoices
  add column if not exists ledger text not null default 'containers'
  check (ledger in ('containers', 'branches'));

alter table public.pa_commission_receipts
  add column if not exists ledger text not null default 'containers'
  check (ledger in ('containers', 'branches'));

create index if not exists pa_cinv_ledger_idx on public.pa_container_invoices (user_id, ledger, invoice_date);
create index if not exists pa_crec_ledger_idx on public.pa_commission_receipts (user_id, ledger, receipt_date);
