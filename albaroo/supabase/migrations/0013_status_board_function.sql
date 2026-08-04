-- Section 8.3: the branch status board is deliberately visible to every role, not
-- just Admin ("peer visibility is a deliberate design choice"). Raw task_assignments
-- rows stay branch-scoped per the RLS in 0007, so this function returns only
-- aggregated per-branch counts for the current Riyadh-calendar-month period —
-- nothing that identifies a specific task, photo, or submission content.
create or replace function branch_status_board()
returns table (
  branch_id uuid,
  branch_name_ar text,
  branch_name_en text,
  branch_code text,
  is_active boolean,
  total int,
  not_started int,
  under_review int,
  approved int,
  needs_revision int,
  closed_missed int,
  dormancy_level dormancy_level,
  dormancy_days int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_active_user() then
    raise exception 'not permitted';
  end if;

  return query
  select
    b.id,
    b.name_ar,
    b.name_en,
    b.code,
    b.is_active,
    count(ta.id)::int,
    count(*) filter (where ta.status = 'not_started')::int,
    count(*) filter (where ta.status = 'under_review')::int,
    count(*) filter (where ta.status = 'approved')::int,
    count(*) filter (where ta.status = 'needs_revision')::int,
    count(*) filter (where ta.status = 'closed_missed')::int,
    coalesce(ba.alert_level, 'normal'),
    coalesce(ba.dormancy_days, 0)
  from branches b
  left join task_assignments ta on ta.branch_id = b.id and not ta.is_voided
    and ta.created_at >= date_trunc('month', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh'
  left join branch_activity ba on ba.branch_id = b.id
  where b.company_id = current_profile_company()
  group by b.id, b.name_ar, b.name_en, b.code, b.is_active, ba.alert_level, ba.dormancy_days
  order by b.code;
end;
$$;
