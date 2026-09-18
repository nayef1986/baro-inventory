-- ============================================================
-- 0006 — فتح الوصول بلا تسجيل دخول
--
-- يتراجع عن 0005 بطلب صاحب المتجر: لا بوابة دخول ولا حساب
-- مستخدم. التطبيق يفتح مباشرة ويعمل بالدور anon.
--
-- ⚠️ ما يعنيه هذا بوضوح: مفتاح anon يظهر في حزمة المتصفح
--    بطبيعته. مع هذه السياسات، من يصل إلى الرابط يقرأ البيانات
--    ويكتبها. الرابط وحده هو ما يحمي القاعدة.
--
-- للرجوع: شغّل 0005 مرة أخرى بعد إنشاء المستخدم، واضبط
--    VITE_SWEETCOST_REQUIRE_AUTH=true.
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
      'create policy %I on %I for all to anon, authenticated
         using (true) with check (true)',
      t || '_all', t
    );
  end loop;
end $$;
