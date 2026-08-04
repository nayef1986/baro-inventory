-- Seed: single company + 21 branches (Section 11) + default settings.
-- Admin can add/edit branches freely afterward through the app.
insert into companies (id, name, timezone)
values ('00000000-0000-0000-0000-000000000001', 'ALBAROO', 'Asia/Riyadh')
on conflict (id) do nothing;

insert into settings (company_id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (company_id) do nothing;

insert into branches (company_id, name_ar, name_en, city, code) values
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - العرب نيو - جدة', 'ALBAROO - Al Arab New - Jeddah', 'Jeddah', 'BR-001'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - الأندلس مول - جدة', 'ALBAROO - Andalus Mall - Jeddah', 'Jeddah', 'BR-002'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - كادي مول - جازان', 'ALBAROO - Kady Mall - Jazan', 'Jazan', 'BR-003'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - المكان مول - حفر الباطن', 'ALBAROO - Al Makan Mall - Hafr Al Batin', 'Hafr Al Batin', 'BR-004'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - النور مول - المدينة', 'ALBAROO - Al Noor Mall - Madinah', 'Madinah', 'BR-005'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - العالية مول - تبوك', 'ALBAROO - Al Aliyah Mall - Tabuk', 'Tabuk', 'BR-006'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - العثيم مول - بريدة', 'ALBAROO - Othaim Mall - Buraidah', 'Buraidah', 'BR-007'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - العثيم مول - الربوة', 'ALBAROO - Othaim Mall - Al Rabwa', 'Riyadh', 'BR-008'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - العثيم مول - الدمام', 'ALBAROO - Othaim Mall - Dammam', 'Dammam', 'BR-009'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - الواحة مول - الرياض', 'ALBAROO - Al Waha Mall - Riyadh', 'Riyadh', 'BR-010'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - السلام مول - جدة', 'ALBAROO - Al Salam Mall - Jeddah', 'Jeddah', 'BR-011'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - الياسمين مول - جدة', 'ALBAROO - Al Yasmin Mall - Jeddah', 'Jeddah', 'BR-012'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - الظهران مول', 'ALBAROO - Dhahran Mall', 'Dhahran', 'BR-013'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - الراشد مول - الخبر', 'ALBAROO - Al Rashid Mall - Khobar', 'Khobar', 'BR-014'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - الراشد مول - المدينة', 'ALBAROO - Al Rashid Mall - Madinah', 'Madinah', 'BR-015'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - جوري مول - الطائف', 'ALBAROO - Jori Mall - Taif', 'Taif', 'BR-016'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - عزيز مول - جدة', 'ALBAROO - Aziz Mall - Jeddah', 'Jeddah', 'BR-017'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - عرعر مول', 'ALBAROO - Arar Mall', 'Arar', 'BR-018'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - مكة مول', 'ALBAROO - Makkah Mall', 'Makkah', 'BR-019'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - النخيل مول - الدمام', 'ALBAROO - Al Nakheel Mall - Dammam', 'Dammam', 'BR-020'),
  ('00000000-0000-0000-0000-000000000001', 'ALBAROO - النخيل مول - الرياض', 'ALBAROO - Al Nakheel Mall - Riyadh', 'Riyadh', 'BR-021')
on conflict (company_id, code) do nothing;

-- Seed a branch_activity row per branch so the status board has something to render
-- before the first nightly cron run.
insert into branch_activity (branch_id, open_assignment_count, dormancy_days, alert_level)
select id, 0, 0, 'normal' from branches
on conflict (branch_id) do nothing;
