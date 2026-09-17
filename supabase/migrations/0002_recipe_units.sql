-- ============================================================
-- 0002 — تسمية الوعاء ووحدة البيع للوصفة
--
-- المستخدم يفكّر بوعاء: «صينية فيها 12 قطعة»، «زبدية تُباع حبة».
-- عمود yield_units وحده كان يقول رقماً بلا معنى.
-- ============================================================

alter table sc_recipes
  add column if not exists batch_label text not null default 'وصفة',
  add column if not exists yield_unit_label text not null default 'قطعة';

alter table sc_recipes
  drop constraint if exists sc_recipes_batch_label_len;
alter table sc_recipes
  add constraint sc_recipes_batch_label_len
  check (length(btrim(batch_label)) between 1 and 40);

alter table sc_recipes
  drop constraint if exists sc_recipes_yield_unit_label_len;
alter table sc_recipes
  add constraint sc_recipes_yield_unit_label_len
  check (length(btrim(yield_unit_label)) between 1 and 40);

comment on column sc_recipes.batch_label is
  'وعاء الإنتاج: صينية، زبدية، قالب…';
comment on column sc_recipes.yield_unit_label is
  'وحدة البيع داخل الوعاء: قطعة، حبة، كوب…';
comment on column sc_recipes.yield_units is
  'عدد وحدات البيع في الوعاء الواحد. صينية تارت = 12، زبدية تيراميسو = 1.';
