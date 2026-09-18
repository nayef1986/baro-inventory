-- ============================================================
-- 0008 — البيع بالآجل والتسديد على دفعات
--
-- «مدفوعة» كانت حالة تُرفع بزر واحد: إما دُفعت كلها أو لا شيء.
-- البيع بالجملة لا يعمل هكذا — يُسلَّم اليوم ويُسدَّد بعد أسبوع،
-- وأحياناً على دفعتين.
--
-- الحل: سجلّ دفعات حقيقي. الحالة صارت حالة المستند (مسودة /
-- صادرة / ملغاة)، وحالة السداد تُشتق من المدفوع مقابل الإجمالي.
--
-- ⚠️ الإيراد لا يتأثر بالسداد. الفاتورة تدخل المبيعات يوم
--    إصدارها لا يوم قبض ثمنها — وإلا اختلّ ربط الربح بالتكلفة.
--    الدفعات تجيب عن سؤال «كم لي عند الناس»، لا «كم بعت».
-- ============================================================

create table if not exists sc_invoice_payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references sc_sales_invoices (id) on delete cascade,
  paid_on     date not null default current_date,
  amount      numeric(14, 4) not null check (amount > 0),
  method      text not null default 'cash'
                check (method in ('cash', 'transfer', 'card', 'other')),
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists sc_invoice_payments_invoice_idx
  on sc_invoice_payments (invoice_id);
create index if not exists sc_invoice_payments_date_idx
  on sc_invoice_payments (paid_on desc);

-- ─── ترحيل الفواتير المعلَّمة «مدفوعة» ────────────────────────
-- تُحوَّل إلى دفعة واحدة بكامل المبلغ يوم الإصدار، فلا يضيع
-- أن ثمنها قُبض، ثم تعود حالتها إلى «صادرة».

insert into sc_invoice_payments (invoice_id, paid_on, amount, method, note)
select i.id, i.issued_on, t.total, 'other', 'مُرحَّلة من حالة «مدفوعة» السابقة'
from sc_sales_invoices i
join sc_invoice_totals t on t.id = i.id
where i.status = 'paid'
  and t.total > 0
  and not exists (select 1 from sc_invoice_payments p where p.invoice_id = i.id);

update sc_sales_invoices set status = 'issued' where status = 'paid';

alter table sc_sales_invoices drop constraint if exists sc_sales_invoices_status_check;
alter table sc_sales_invoices
  add constraint sc_sales_invoices_status_check
  check (status in ('draft', 'issued', 'cancelled'));

-- ─── العرض: المدفوع والمتبقي ─────────────────────────────────
-- الدفعات في lateral لا في join، وإلا ضُرِبت صفوف البنود في
-- صفوف الدفعات وتضخّمت المجاميع.

create or replace view sc_invoice_totals as
select
  i.id,
  coalesce(sum(it.line_total), 0)::numeric(16, 4) as subtotal,
  i.discount,
  greatest(coalesce(sum(it.line_total), 0) - i.discount, 0)::numeric(16, 4) as taxable,
  round(greatest(coalesce(sum(it.line_total), 0) - i.discount, 0) * i.vat_rate / 100, 2)::numeric(16, 4) as vat_amount,
  (greatest(coalesce(sum(it.line_total), 0) - i.discount, 0)
    + round(greatest(coalesce(sum(it.line_total), 0) - i.discount, 0) * i.vat_rate / 100, 2))::numeric(16, 4) as total,
  coalesce(sum(it.quantity * it.unit_cost), 0)::numeric(16, 4) as cost,
  count(it.id) as line_count,
  pay.paid::numeric(16, 4) as paid,
  (greatest(coalesce(sum(it.line_total), 0) - i.discount, 0)
    + round(greatest(coalesce(sum(it.line_total), 0) - i.discount, 0) * i.vat_rate / 100, 2)
    - pay.paid)::numeric(16, 4) as balance
from sc_sales_invoices i
left join sc_sales_invoice_items it on it.invoice_id = i.id
left join lateral (
  select coalesce(sum(p.amount), 0) as paid
  from sc_invoice_payments p
  where p.invoice_id = i.id
) pay on true
group by i.id, i.discount, i.vat_rate, pay.paid;

alter view sc_invoice_totals set (security_invoker = on);

-- ─── RLS ─────────────────────────────────────────────────────

alter table sc_invoice_payments enable row level security;
drop policy if exists sc_invoice_payments_all on sc_invoice_payments;
create policy sc_invoice_payments_all on sc_invoice_payments
  for all to anon, authenticated using (true) with check (true);
