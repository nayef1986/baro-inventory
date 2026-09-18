-- ============================================================
-- 0003 — العملاء وفواتير التوريد
--
-- الفاتورة تصير مصدر المبيعات في لوحة المتابعة بدل
-- sold_units في شاشة الإنتاج — وإلا حُسبت المبيعات مرتين.
-- sold_units يبقى لمعرفة ما خرج من المطبخ، لا للإيراد.
-- ============================================================

-- ─── إعدادات المتجر والضريبة ─────────────────────────────────

alter table sc_settings
  add column if not exists store_name     text not null default 'COCO CAKE',
  add column if not exists store_phone    text,
  add column if not exists store_address  text,
  add column if not exists vat_number     text,
  add column if not exists vat_enabled    boolean not null default false,
  add column if not exists vat_rate       numeric(5, 2) not null default 15,
  add column if not exists invoice_prefix text not null default 'CC';

alter table sc_settings drop constraint if exists sc_settings_vat_rate_range;
alter table sc_settings
  add constraint sc_settings_vat_rate_range check (vat_rate >= 0 and vat_rate <= 100);

comment on column sc_settings.vat_enabled is
  'إظهار ضريبة القيمة المضافة في الفاتورة. هذه فاتورة تجارية، وليست فاتورة ضريبية معتمدة من هيئة الزكاة والضريبة.';

-- ─── العملاء ─────────────────────────────────────────────────

create table if not exists sc_customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  phone       text,
  tax_number  text,
  address     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── الفواتير ────────────────────────────────────────────────

create table if not exists sc_sales_invoices (
  id           uuid primary key default gen_random_uuid(),
  invoice_no   text not null unique check (length(btrim(invoice_no)) > 0),
  customer_id  uuid references sc_customers (id) on delete restrict,
  issued_on    date not null default current_date,
  due_on       date,
  -- لقطات وقت الإصدار: تغيير الإعدادات لاحقاً لا يغيّر فاتورة صدرت
  vat_rate     numeric(5, 2) not null default 0 check (vat_rate >= 0 and vat_rate <= 100),
  discount     numeric(14, 4) not null default 0 check (discount >= 0),
  status       text not null default 'issued'
                 check (status in ('draft', 'issued', 'paid', 'cancelled')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists sc_sales_invoices_date_idx     on sc_sales_invoices (issued_on desc);
create index if not exists sc_sales_invoices_customer_idx on sc_sales_invoices (customer_id);

create table if not exists sc_sales_invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references sc_sales_invoices (id) on delete cascade,
  recipe_id   uuid references sc_recipes (id) on delete set null,
  -- لقطة الاسم والوحدة: حذف الوصفة لاحقاً لا يفرّغ الفاتورة
  description text not null check (length(btrim(description)) > 0),
  unit_label  text not null default 'قطعة',
  quantity    numeric(14, 3) not null check (quantity > 0),
  unit_price  numeric(14, 4) not null check (unit_price >= 0),
  unit_cost   numeric(14, 4) not null default 0 check (unit_cost >= 0),
  line_total  numeric(16, 4) generated always as (quantity * unit_price) stored,
  created_at  timestamptz not null default now()
);

create index if not exists sc_sales_invoice_items_invoice_idx
  on sc_sales_invoice_items (invoice_id);

-- ─── تواريخ التعديل ──────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['sc_customers', 'sc_sales_invoices'] loop
    execute format('drop trigger if exists %I on %I', t || '_touch', t);
    execute format(
      'create trigger %I before update on %I
         for each row execute function sc_touch_updated_at()',
      t || '_touch', t
    );
  end loop;
end $$;

-- ─── عرض: مجاميع كل فاتورة ───────────────────────────────────
-- حساب حسابي بحت. لا تسعير ولا تكلفة مكونات هنا — ذاك في cost.ts.

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
  count(it.id) as line_count
from sc_sales_invoices i
left join sc_sales_invoice_items it on it.invoice_id = i.id
group by i.id, i.discount, i.vat_rate;

-- ─── RLS ─────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['sc_customers', 'sc_sales_invoices', 'sc_sales_invoice_items'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_all', t);
    execute format(
      'create policy %I on %I for all to anon, authenticated
         using (true) with check (true)',
      t || '_all', t
    );
  end loop;
end $$;
