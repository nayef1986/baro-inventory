-- ============================================================
-- SWEET COST — Database Schema
-- نظام حساب تكلفة تصنيع الحلى والربح وهامش الربح
--
-- كل المبالغ numeric (وليس float) — الحسابات المالية دقيقة.
-- القاعدة: الجداول تخزّن حقائق خام فقط. كل حسابات التكلفة
-- تتم في src/sweetcost/lib/cost.ts — مصدر واحد للحقيقة، بلا تكرار.
-- ============================================================

-- ─── أنواع ───────────────────────────────────────────────────

do $$ begin
  create type sc_unit as enum ('kg', 'g', 'l', 'ml', 'piece', 'pack');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sc_waste_reason as enum
    ('expired', 'damaged', 'production_error', 'over_prep', 'broken', 'other');
exception when duplicate_object then null; end $$;

-- ─── الموردين ────────────────────────────────────────────────

create table if not exists sc_suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  phone       text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── المكونات ────────────────────────────────────────────────
-- base_unit هي وحدة الحساب (جم / مل / قطعة).
-- package_size دائماً بالـ base_unit: عبوة 25 كجم ← 25000 جم.

create table if not exists sc_ingredients (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(btrim(name)) > 0),
  purchase_unit  sc_unit not null,
  base_unit      sc_unit not null check (base_unit in ('g', 'ml', 'piece')),
  package_size   numeric(14, 4) not null check (package_size > 0),
  waste_percent  numeric(5, 2) not null default 0
                   check (waste_percent >= 0 and waste_percent < 100),
  supplier_id    uuid references sc_suppliers (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists sc_ingredients_supplier_idx on sc_ingredients (supplier_id);

-- ─── المشتريات ───────────────────────────────────────────────

create table if not exists sc_purchases (
  id             uuid primary key default gen_random_uuid(),
  supplier_id    uuid references sc_suppliers (id) on delete set null,
  invoice_no     text,
  purchased_on   date not null default current_date,
  attachment_url text,                       -- صورة الفاتورة (مرجع فقط، لا تُقرأ آلياً)
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists sc_purchases_date_idx on sc_purchases (purchased_on desc);

create table if not exists sc_purchase_items (
  id             uuid primary key default gen_random_uuid(),
  purchase_id    uuid not null references sc_purchases (id) on delete cascade,
  ingredient_id  uuid not null references sc_ingredients (id) on delete restrict,
  quantity       numeric(14, 4) not null check (quantity > 0),   -- عدد العبوات
  package_size   numeric(14, 4) not null check (package_size > 0), -- لقطة وقت الشراء
  package_price  numeric(14, 4) not null check (package_price >= 0),
  total_price    numeric(16, 4) generated always as (quantity * package_price) stored,
  created_at     timestamptz not null default now()
);

create index if not exists sc_purchase_items_purchase_idx   on sc_purchase_items (purchase_id);
create index if not exists sc_purchase_items_ingredient_idx on sc_purchase_items (ingredient_id);

-- ─── تاريخ أسعار المكونات ────────────────────────────────────
-- السجلات القديمة لا تُحذف أبداً. كل شراء يضيف سجلاً جديداً.

create table if not exists sc_ingredient_prices (
  id                uuid primary key default gen_random_uuid(),
  ingredient_id     uuid not null references sc_ingredients (id) on delete cascade,
  package_size      numeric(14, 4) not null check (package_size > 0),
  package_price     numeric(14, 4) not null check (package_price >= 0),
  unit_cost         numeric(18, 8)
                      generated always as (package_price / package_size) stored,
  purchase_date     date not null default current_date,
  purchase_item_id  uuid references sc_purchase_items (id) on delete set null,
  source            text not null default 'manual'
                      check (source in ('manual', 'purchase')),
  created_at        timestamptz not null default now()
);

create index if not exists sc_ingredient_prices_lookup_idx
  on sc_ingredient_prices (ingredient_id, purchase_date desc, created_at desc);

-- ─── الوصفات ─────────────────────────────────────────────────

create table if not exists sc_recipes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(btrim(name)) > 0),
  sell_price   numeric(14, 4) not null default 0 check (sell_price >= 0),
  yield_units  numeric(12, 2) not null default 1 check (yield_units > 0),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists sc_recipe_items (
  id             uuid primary key default gen_random_uuid(),
  recipe_id      uuid not null references sc_recipes (id) on delete cascade,
  ingredient_id  uuid not null references sc_ingredients (id) on delete restrict,
  quantity       numeric(14, 4) not null check (quantity > 0),
  unit           sc_unit not null,
  created_at     timestamptz not null default now(),
  unique (recipe_id, ingredient_id)
);

create index if not exists sc_recipe_items_recipe_idx on sc_recipe_items (recipe_id);

-- ─── الإنتاج الفعلي ──────────────────────────────────────────
-- لقطات التكلفة محفوظة لأن أسعار المكونات تتغيّر: كل دفعة
-- تحتفظ بتكلفتها الحقيقية وقت إنتاجها.

create table if not exists sc_productions (
  id              uuid primary key default gen_random_uuid(),
  recipe_id       uuid not null references sc_recipes (id) on delete restrict,
  produced_on     date not null default current_date,
  batches         numeric(10, 2) not null default 1 check (batches > 0),
  produced_units  numeric(14, 2) not null check (produced_units >= 0),
  sold_units      numeric(14, 2) not null default 0 check (sold_units >= 0),
  sell_price      numeric(14, 4) not null default 0 check (sell_price >= 0),
  standard_cost   numeric(16, 4) not null default 0 check (standard_cost >= 0),
  actual_cost     numeric(16, 4) not null default 0 check (actual_cost >= 0),
  revenue         numeric(16, 4) generated always as (sold_units * sell_price) stored,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint sc_productions_sold_lte_produced check (sold_units <= produced_units)
);

create index if not exists sc_productions_date_idx   on sc_productions (produced_on desc);
create index if not exists sc_productions_recipe_idx on sc_productions (recipe_id);

create table if not exists sc_production_items (
  id             uuid primary key default gen_random_uuid(),
  production_id  uuid not null references sc_productions (id) on delete cascade,
  ingredient_id  uuid not null references sc_ingredients (id) on delete restrict,
  unit           sc_unit not null,
  standard_qty   numeric(14, 4) not null default 0 check (standard_qty >= 0),
  actual_qty     numeric(14, 4) not null default 0 check (actual_qty >= 0),
  unit_cost      numeric(18, 8) not null default 0 check (unit_cost >= 0),
  created_at     timestamptz not null default now(),
  unique (production_id, ingredient_id)
);

create index if not exists sc_production_items_production_idx
  on sc_production_items (production_id);

-- ─── الهدر ───────────────────────────────────────────────────
-- إما مكون أو منتج — واحد فقط، لا الاثنان ولا لا شيء.

create table if not exists sc_waste (
  id             uuid primary key default gen_random_uuid(),
  wasted_on      date not null default current_date,
  ingredient_id  uuid references sc_ingredients (id) on delete restrict,
  recipe_id      uuid references sc_recipes (id) on delete restrict,
  quantity       numeric(14, 4) not null check (quantity > 0),
  unit           sc_unit not null,
  unit_cost      numeric(18, 8) not null default 0 check (unit_cost >= 0),
  value          numeric(18, 6) generated always as (quantity * unit_cost) stored,
  reason         sc_waste_reason not null default 'other',
  note           text,
  created_at     timestamptz not null default now(),
  constraint sc_waste_target_exactly_one
    check (num_nonnulls(ingredient_id, recipe_id) = 1)
);

create index if not exists sc_waste_date_idx on sc_waste (wasted_on desc);

-- ─── الإعدادات (الأهداف) ─────────────────────────────────────
-- صف واحد فقط.

create table if not exists sc_settings (
  id            boolean primary key default true check (id),
  weekly_goal   numeric(14, 2) not null default 0 check (weekly_goal >= 0),
  monthly_goal  numeric(14, 2) not null default 0 check (monthly_goal >= 0),
  currency      text not null default 'SAR',
  updated_at    timestamptz not null default now()
);

insert into sc_settings (id) values (true) on conflict (id) do nothing;

-- ─── updated_at تلقائياً ─────────────────────────────────────

create or replace function sc_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'sc_suppliers', 'sc_ingredients', 'sc_purchases',
    'sc_recipes', 'sc_productions', 'sc_settings'
  ] loop
    execute format('drop trigger if exists %I on %I', t || '_touch', t);
    execute format(
      'create trigger %I before update on %I
         for each row execute function sc_touch_updated_at()',
      t || '_touch', t
    );
  end loop;
end $$;

-- ─── شراء جديد ← سجل سعر جديد ────────────────────────────────
-- يضيف سجلاً ولا يحذف أي سعر سابق.

create or replace function sc_price_from_purchase() returns trigger
language plpgsql as $$
declare p_date date;
begin
  select purchased_on into p_date from sc_purchases where id = new.purchase_id;

  insert into sc_ingredient_prices
    (ingredient_id, package_size, package_price, purchase_date, purchase_item_id, source)
  values
    (new.ingredient_id, new.package_size, new.package_price,
     coalesce(p_date, current_date), new.id, 'purchase');

  return new;
end $$;

drop trigger if exists sc_purchase_items_price on sc_purchase_items;
create trigger sc_purchase_items_price
  after insert on sc_purchase_items
  for each row execute function sc_price_from_purchase();

-- ─── عرض: آخر سعر ومتوسط السعر لكل مكون ──────────────────────
-- تجميع بحت — لا حساب تكلفة هنا (ذاك في cost.ts).

create or replace view sc_ingredient_latest as
select
  i.id,
  latest.package_price  as last_price,
  latest.package_size   as last_package_size,
  latest.unit_cost      as last_unit_cost,
  latest.purchase_date  as last_purchase_date,
  agg.avg_price,
  agg.price_count
from sc_ingredients i
left join lateral (
  select p.package_price, p.package_size, p.unit_cost, p.purchase_date
  from sc_ingredient_prices p
  where p.ingredient_id = i.id
  order by p.purchase_date desc, p.created_at desc
  limit 1
) latest on true
left join lateral (
  select avg(p.package_price)::numeric(14, 4) as avg_price, count(*) as price_count
  from sc_ingredient_prices p
  where p.ingredient_id = i.id
) agg on true;

-- ─── RLS ─────────────────────────────────────────────────────
-- النظام أحادي المستأجر بلا حسابات مستخدمين (حسب الـMVP).
-- RLS مفعّل بسياسة مفتوحة صراحةً بدل تركه معطّلاً بصمت.

do $$
declare t text;
begin
  foreach t in array array[
    'sc_suppliers', 'sc_ingredients', 'sc_purchases', 'sc_purchase_items',
    'sc_ingredient_prices', 'sc_recipes', 'sc_recipe_items',
    'sc_productions', 'sc_production_items', 'sc_waste', 'sc_settings'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_all', t);
    execute format(
      'create policy %I on %I for all to anon, authenticated
         using (true) with check (true)',
      t || '_all', t
    );
  end loop;
end $$;
