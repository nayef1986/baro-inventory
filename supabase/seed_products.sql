-- ============================================================
-- بذرة اختيارية: منتجاتك الحالية
--
-- تُنشئ الوصفتين بأسعار البيع وأسماء الأوعية فقط.
-- المكونات تُضاف من داخل التطبيق، وعندها تظهر التكلفة
-- والربح والهامش تلقائياً.
--
-- شغّلها بعد 0001 و 0002. آمنة للتكرار.
-- ============================================================

insert into sc_recipes (name, batch_label, yield_units, yield_unit_label, sell_price)
select 'تارت', 'صينية', 12, 'قطعة', 4.00
where not exists (select 1 from sc_recipes where name = 'تارت');

insert into sc_recipes (name, batch_label, yield_units, yield_unit_label, sell_price)
select 'تيراميسو', 'زبدية', 1, 'حبة', 12.00
where not exists (select 1 from sc_recipes where name = 'تيراميسو');
