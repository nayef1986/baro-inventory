-- Functions invoked by pg_cron (see 0009_cron_schedule.sql). They run with the
-- privileges of the function owner (security definer) since these are trusted
-- system jobs that must see across every branch/company, bypassing RLS by design.

-- Section 4: auto-close assignments whose deadline + grace has passed with no submission.
create or replace function close_overdue_assignments()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_count int := 0;
  v_grace_hours int;
begin
  for v_rec in
    select ta.*, t.grace_hours as task_grace_hours
    from task_assignments ta
    join tasks t on t.id = ta.task_id
    where ta.status in ('not_started', 'needs_revision')
      and ta.is_voided = false
      and ta.due_at + make_interval(hours => t.grace_hours) < now()
  loop
    update task_assignments
       set status = 'closed_missed', closed_at = now(), score = 0
     where id = v_rec.id;

    perform write_audit_log(null, 'auto_close_missed', 'task_assignment', v_rec.id,
      jsonb_build_object('status', v_rec.status),
      jsonb_build_object('status', 'closed_missed'));

    insert into activity_feed (branch_id, actor_id, event_type, assignment_id)
    values (v_rec.branch_id, null, 'closed_missed', v_rec.id);

    if v_rec.merchandiser_id is not null then
      perform notify_once(v_rec.merchandiser_id, 'assignment_closed_missed',
        'Assignment closed as missed', null, 'task_assignment', v_rec.id,
        'closed_missed:' || v_rec.id::text, true);
    end if;
    if v_rec.supervisor_id is not null then
      perform notify_once(v_rec.supervisor_id, 'assignment_closed_missed',
        'A branch assignment was closed as missed', null, 'task_assignment', v_rec.id,
        'closed_missed:' || v_rec.id::text, true);
    end if;
    perform notify_once(admins.id, 'assignment_closed_missed',
      'A branch assignment was closed as missed', null, 'task_assignment', v_rec.id,
      'closed_missed:' || v_rec.id::text, true)
    from profiles admins where admins.role = 'admin' and admins.is_active;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Section 4.2: 24h / 48h supervisor review SLA escalation.
create or replace function escalate_review_sla()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_settings settings%rowtype;
  v_count int := 0;
begin
  for v_settings in select * from settings loop
    for v_rec in
      select ta.*
      from task_assignments ta
      where ta.status = 'under_review'
        and ta.first_submitted_at is not null
        and exists (select 1 from branches b where b.id = ta.branch_id and b.company_id = v_settings.company_id)
    loop
      if now() > v_rec.first_submitted_at + make_interval(hours => v_settings.review_sla_critical_hours) then
        if v_rec.supervisor_id is not null then
          perform notify_once(v_rec.supervisor_id, 'review_sla_critical',
            'Review overdue past 48h', null, 'task_assignment', v_rec.id,
            'review_sla_critical:' || v_rec.id::text, true);
        end if;
        perform notify_once(admins.id, 'review_sla_critical',
          'A supervisor review is overdue past 48h', null, 'task_assignment', v_rec.id,
          'review_sla_critical:' || v_rec.id::text, true)
        from profiles admins where admins.company_id = v_settings.company_id and admins.role = 'admin' and admins.is_active;
        v_count := v_count + 1;
      elsif now() > v_rec.first_submitted_at + make_interval(hours => v_settings.review_sla_watch_hours) then
        if v_rec.supervisor_id is not null then
          perform notify_once(v_rec.supervisor_id, 'review_sla_watch',
            'Review pending past 24h', null, 'task_assignment', v_rec.id,
            'review_sla_watch:' || v_rec.id::text, false);
        end if;
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;
  return v_count;
end;
$$;

-- Section 11C.2: recompute branch_activity and evaluate the dormancy escalation ladder.
-- Runs daily at 08:00 Asia/Riyadh.
create or replace function refresh_branch_activity_and_alert()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch record;
  v_settings settings%rowtype;
  v_level dormancy_level;
  v_days int;
  v_count int := 0;
begin
  for v_branch in select * from branches where is_active loop
    select * into v_settings from settings where company_id = v_branch.company_id;

    insert into branch_activity (branch_id, last_submission_at, last_approval_at,
      open_assignment_count, oldest_open_assignment_at, dormancy_days, alert_level, updated_at)
    select
      v_branch.id,
      (select max(s.submitted_at) from submissions s
         join task_assignments ta on ta.id = s.assignment_id where ta.branch_id = v_branch.id),
      (select max(ta.approved_at) from task_assignments ta where ta.branch_id = v_branch.id),
      (select count(*) from task_assignments ta where ta.branch_id = v_branch.id
         and ta.status in ('not_started', 'under_review', 'needs_revision') and not ta.is_voided),
      (select min(ta.created_at) from task_assignments ta where ta.branch_id = v_branch.id
         and ta.status in ('not_started', 'under_review', 'needs_revision') and not ta.is_voided),
      0, 'normal', now()
    on conflict (branch_id) do update
      set last_submission_at = excluded.last_submission_at,
          last_approval_at = excluded.last_approval_at,
          open_assignment_count = excluded.open_assignment_count,
          oldest_open_assignment_at = excluded.oldest_open_assignment_at,
          updated_at = now();

    select coalesce(
      extract(day from now() - greatest(coalesce(last_submission_at, oldest_open_assignment_at), oldest_open_assignment_at))::int,
      0
    ) into v_days
    from branch_activity where branch_id = v_branch.id;

    if v_days is null or v_days < 0 then
      v_days := 0;
    end if;

    v_level := 'normal';
    if (select open_assignment_count from branch_activity where branch_id = v_branch.id) > 0 then
      if v_days >= coalesce(v_settings.dormancy_dead_days, 14) then
        v_level := 'dead';
      elsif v_days >= coalesce(v_settings.dormancy_critical_days, 7) then
        v_level := 'critical';
      elsif v_days >= coalesce(v_settings.dormancy_watch_days, 3) then
        v_level := 'watch';
      end if;
    end if;

    update branch_activity set dormancy_days = v_days, alert_level = v_level where branch_id = v_branch.id;

    if v_level = 'watch' then
      perform notify_once(ub.user_id, 'branch_dormant_watch',
        'Branch has had no submissions for ' || v_days || ' days',
        v_branch.name_en, 'branch', v_branch.id, 'dormant_watch:' || v_branch.id::text, false)
      from user_branches ub join profiles p on p.id = ub.user_id
      where ub.branch_id = v_branch.id and p.role = 'supervisor' and p.is_active;
      v_count := v_count + 1;
    elsif v_level = 'critical' then
      perform notify_once(ub.user_id, 'branch_dormant_critical',
        'Branch silent for ' || v_days || ' days — critical',
        v_branch.name_en, 'branch', v_branch.id, 'dormant_critical:' || v_branch.id::text, true)
      from user_branches ub join profiles p on p.id = ub.user_id
      where ub.branch_id = v_branch.id and p.role = 'supervisor' and p.is_active;
      perform notify_once(a.id, 'branch_dormant_critical',
        'Branch silent for ' || v_days || ' days — critical',
        v_branch.name_en, 'branch', v_branch.id, 'dormant_critical:' || v_branch.id::text, true)
      from profiles a where a.company_id = v_branch.company_id and a.role = 'admin' and a.is_active;
      v_count := v_count + 1;
    elsif v_level = 'dead' then
      perform notify_once(a.id, 'branch_dormant_dead',
        'Branch dead: no submissions for ' || v_days || ' days',
        v_branch.name_en, 'branch', v_branch.id, 'dormant_dead:' || v_branch.id::text, true)
      from profiles a where a.company_id = v_branch.company_id and a.role = 'admin' and a.is_active;
      v_count := v_count + 1;
    end if;

    if (select open_assignment_count from branch_activity where branch_id = v_branch.id) > 0
       and not exists (select 1 from user_branches ub join profiles p on p.id = ub.user_id
                        where ub.branch_id = v_branch.id and p.role = 'merchandiser' and p.is_active) then
      perform notify_once(a.id, 'branch_unassigned',
        'Branch has open work but no merchandiser assigned', v_branch.name_en, 'branch', v_branch.id,
        'unassigned:' || v_branch.id::text, true)
      from profiles a where a.company_id = v_branch.company_id and a.role = 'admin' and a.is_active;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Section 11C.3: daily 18:00 admin digest — one message, not per-event noise.
create or replace function generate_daily_admin_digest()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company record;
  v_submitted int;
  v_branches int;
  v_approved int;
  v_pending int;
  v_silent int;
  v_count int := 0;
begin
  for v_company in select * from companies loop
    select count(*), count(distinct ta.branch_id)
      into v_submitted, v_branches
    from submissions s
    join task_assignments ta on ta.id = s.assignment_id
    join branches b on b.id = ta.branch_id
    where b.company_id = v_company.id and s.submitted_at >= current_date;

    select count(*) into v_approved
    from submissions s
    join task_assignments ta on ta.id = s.assignment_id
    join branches b on b.id = ta.branch_id
    where b.company_id = v_company.id and s.reviewed_at >= current_date and s.review_status = 'approved';

    select count(*) into v_pending
    from task_assignments ta
    join branches b on b.id = ta.branch_id
    where b.company_id = v_company.id and ta.status = 'under_review';

    select count(*) into v_silent
    from branch_activity ba
    join branches b on b.id = ba.branch_id
    where b.company_id = v_company.id and ba.alert_level in ('watch', 'critical', 'dead');

    insert into notifications (user_id, type, title, body, entity_type, entity_id)
    select a.id, 'admin_digest',
      'Daily summary',
      format('Today: %s submissions across %s branches · %s approved · %s pending review · %s branches silent.',
        v_submitted, v_branches, v_approved, v_pending, v_silent),
      'company', v_company.id
    from profiles a where a.company_id = v_company.id and a.role = 'admin' and a.is_active;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Section 11C.3: weekly digest, Sunday 08:00 Asia/Riyadh.
create or replace function generate_weekly_admin_digest()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company record;
  v_completion_pct numeric;
  v_recovered int;
  v_entered int;
  v_count int := 0;
begin
  for v_company in select * from companies loop
    select round(
      100.0 * count(*) filter (where ta.status = 'approved') / nullif(count(*), 0), 1
    ) into v_completion_pct
    from task_assignments ta
    join branches b on b.id = ta.branch_id
    where b.company_id = v_company.id and ta.created_at >= now() - interval '7 days';

    select count(*) into v_recovered
    from branch_activity ba join branches b on b.id = ba.branch_id
    where b.company_id = v_company.id and ba.alert_level = 'normal' and ba.updated_at >= now() - interval '7 days';

    select count(*) into v_entered
    from branch_activity ba join branches b on b.id = ba.branch_id
    where b.company_id = v_company.id and ba.alert_level in ('watch', 'critical', 'dead');

    insert into notifications (user_id, type, title, body, entity_type, entity_id)
    select a.id, 'admin_digest', 'Weekly summary',
      format('This week: %s%% completion · %s branches recovered from dormancy · %s branches currently silent.',
        coalesce(v_completion_pct, 0), v_recovered, v_entered),
      'company', v_company.id
    from profiles a where a.company_id = v_company.id and a.role = 'admin' and a.is_active;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Section 7.8: retention clock starts at approval. Returns candidates for a Next.js
-- job to actually delete from Storage (pure SQL cannot delete storage bytes), which
-- then calls mark_photos_retention_deleted() below.
create or replace function photos_pending_retention_deletion()
returns table (photo_id uuid, storage_path text, file_size int)
language sql
stable
security definer
set search_path = public
as $$
  select sp.id, sp.storage_path, sp.file_size
  from submission_photos sp
  join submissions s on s.id = sp.submission_id
  join task_assignments ta on ta.id = s.assignment_id
  join branches b on b.id = ta.branch_id
  join settings st on st.company_id = b.company_id
  where sp.full_res_deleted_at is null
    and ta.status = 'approved'
    and ta.approved_at is not null
    and ta.approved_at <= now() - make_interval(days => st.photo_retention_days)
    and sp.capture_mode <> 'gallery';
$$;

create or replace function mark_photos_retention_deleted(p_photo_ids uuid[], p_bytes_reclaimed bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update submission_photos set full_res_deleted_at = now() where id = any(p_photo_ids);
  perform write_audit_log(null, 'retention_delete', 'submission_photo_batch', null,
    null, jsonb_build_object('count', array_length(p_photo_ids, 1), 'bytes_reclaimed', p_bytes_reclaimed));
end;
$$;

-- Cleanup for photos uploaded via a capture token but never attached to a submission
-- (token expired, user abandoned the flow). Keeps storage from accumulating orphans.
create or replace function orphaned_unfinalized_photos(p_older_than_hours int default 24)
returns table (photo_id uuid, storage_path text, thumbnail_path text)
language sql
stable
security definer
set search_path = public
as $$
  select id, storage_path, thumbnail_path
  from submission_photos
  where submission_id is null
    and created_at < now() - make_interval(hours => p_older_than_hours);
$$;

create or replace function delete_orphaned_photos(p_photo_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  delete from submission_photos where id = any(p_photo_ids) and submission_id is null;
$$;
