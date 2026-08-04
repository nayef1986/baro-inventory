-- Resolve merchandiser_id/supervisor_id from user_branches when a task_assignment is
-- created without them explicitly set (Section 3.2). If a branch has multiple
-- merchandisers/supervisors, the first by assigned_at wins; the review/submission
-- RPCs then check branch access generally, so multiple supervisors can still act
-- (Section 10 edge case 6) even though only one is denormalized here for notifications.
create or replace function resolve_assignment_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.merchandiser_id is null then
    select ub.user_id into new.merchandiser_id
    from user_branches ub join profiles p on p.id = ub.user_id
    where ub.branch_id = new.branch_id and p.role = 'merchandiser' and p.is_active
    order by ub.assigned_at asc limit 1;
  end if;

  if new.supervisor_id is null then
    select ub.user_id into new.supervisor_id
    from user_branches ub join profiles p on p.id = ub.user_id
    where ub.branch_id = new.branch_id and p.role = 'supervisor' and p.is_active
    order by ub.assigned_at asc limit 1;
  end if;

  return new;
end;
$$;

create trigger task_assignments_resolve_users before insert on task_assignments
  for each row execute function resolve_assignment_users();

create or replace function notify_assignment_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch branches%rowtype;
begin
  select * into v_branch from branches where id = new.branch_id;

  if new.merchandiser_id is not null then
    perform notify_once(new.merchandiser_id, 'task_assigned', 'New task assigned',
      v_branch.name_en, 'task_assignment', new.id, null, false);
  else
    perform notify_once(a.id, 'branch_unassigned',
      'New task assigned to a branch with no merchandiser', v_branch.name_en, 'task_assignment', new.id,
      'unassigned:' || new.branch_id::text, true)
    from profiles a where a.company_id = v_branch.company_id and a.role = 'admin' and a.is_active;
  end if;

  insert into activity_feed (branch_id, actor_id, event_type, assignment_id)
  values (new.branch_id, null, 'task_assigned', new.id);
  return new;
end;
$$;

create trigger task_assignments_notify_created after insert on task_assignments
  for each row execute function notify_assignment_created();

-- Atomic multi-branch task creation (Section 3.2 / Phase 1 requirement). Admin only.
create or replace function create_task_with_assignments(
  p_title jsonb,
  p_description jsonb,
  p_instructions jsonb,
  p_source_locale text,
  p_priority task_priority,
  p_required_photo_count int,
  p_due_at timestamptz,
  p_grace_hours int,
  p_branch_ids uuid[],
  p_reference_image_path text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
  v_branch_id uuid;
begin
  if not is_admin() then
    raise exception 'not permitted';
  end if;
  if p_branch_ids is null or array_length(p_branch_ids, 1) is null then
    raise exception 'at least one branch must be selected';
  end if;

  insert into tasks (company_id, title, description, instructions, source_locale, priority,
    required_photo_count, due_at, grace_hours, created_by, reference_image_path)
  values (current_profile_company(), p_title, p_description, p_instructions, p_source_locale,
    p_priority, p_required_photo_count, p_due_at, p_grace_hours, auth.uid(), p_reference_image_path)
  returning id into v_task_id;

  foreach v_branch_id in array p_branch_ids loop
    insert into task_assignments (task_id, branch_id, due_at)
    values (v_task_id, v_branch_id, p_due_at);
  end loop;

  perform write_audit_log(auth.uid(), 'create', 'task', v_task_id, null,
    jsonb_build_object('branch_count', array_length(p_branch_ids, 1)));

  return v_task_id;
end;
$$;
