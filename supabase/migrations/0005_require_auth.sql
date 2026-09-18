-- ============================================================
-- 0005 — قصر الوصول على المستخدمين المسجّلين
--
-- ⚠️ لا تشغّل هذا الملف قبل إنشاء حساب الدخول، وإلا أُغلق
--    النظام في وجهك. الترتيب الصحيح:
--
--    1) أنشئ المستخدم: لوحة Supabase ← Authentication ← Users
--       ← Add user (بريد وكلمة مرور، وفعّل Auto Confirm).
--    2) VITE_SWEETCOST_REQUIRE_AUTH=true في .env.local
--       وفي متغيّرات البيئة عند النشر.
--    3) شغّل هذا الملف.
--
-- للتراجع: بدّل `to authenticated` إلى `to anon, authenticated`.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'sc_suppliers', 'sc_ingredients', 'sc_purchases', 'sc_purchase_items',
    'sc_ingredient_prices', 'sc_recipes', 'sc_recipe_items',
    'sc_productions', 'sc_production_items', 'sc_waste', 'sc_settings',
    'sc_customers', 'sc_sales_invoices', 'sc_sales_invoice_items'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_all', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (true) with check (true)',
      t || '_all', t
    );
  end loop;
end $$;
