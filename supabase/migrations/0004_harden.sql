-- ============================================================
-- 0004 — تشديد أمني (من مُدقّق Supabase)
--
-- 1) العروض تُنشأ افتراضاً بـSECURITY DEFINER، فتتجاوز صلاحيات
--    القارئ وتعمل بصلاحيات مُنشئها. security_invoker يجعلها
--    تحترم سياسات الصف الخاصة بمن يقرأ.
-- 2) دوال المُشغّلات بلا search_path ثابت يمكن خداعها بجدول
--    يُوضع في مسار بحث آخر. نثبّته.
-- ============================================================

alter view sc_ingredient_latest set (security_invoker = on);
alter view sc_invoice_totals   set (security_invoker = on);

alter function sc_touch_updated_at()    set search_path = public, pg_temp;
alter function sc_price_from_purchase() set search_path = public, pg_temp;
