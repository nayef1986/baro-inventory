-- Generic audit trigger for tables the Admin edits directly (branches, tasks, profiles,
-- user_branches). task_assignments/submissions are audited explicitly inside their
-- RPCs (0005/0006) with more specific action labels, so they are not wired here.
create or replace function audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id uuid;
begin
  if tg_op = 'DELETE' then
    v_entity_id := old.id;
    perform write_audit_log(auth.uid(), lower(tg_op), tg_table_name, v_entity_id, to_jsonb(old), null);
    return old;
  else
    v_entity_id := new.id;
    perform write_audit_log(auth.uid(), lower(tg_op), tg_table_name, v_entity_id,
      case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
      to_jsonb(new));
    return new;
  end if;
end;
$$;

create trigger branches_audit after insert or update or delete on branches
  for each row execute function audit_row_change();

create trigger tasks_audit after insert or update or delete on tasks
  for each row execute function audit_row_change();

create trigger profiles_audit after insert or update or delete on profiles
  for each row execute function audit_row_change();

create trigger user_branches_audit after insert or update or delete on user_branches
  for each row execute function audit_row_change();

-- Section 10.5: task deletion is soft-delete only. Block hard deletes at the DB level.
create or replace function reject_task_hard_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'tasks cannot be hard-deleted; set is_deleted = true instead';
end;
$$;

create trigger tasks_no_hard_delete before delete on tasks
  for each row execute function reject_task_hard_delete();

-- Section 11: branch deletion rule — hard delete only permitted when the branch has no
-- assignment history; otherwise the app must soft-delete (is_active = false).
create or replace function reject_branch_hard_delete_with_history()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from task_assignments where branch_id = old.id) then
    raise exception 'branch has assignment history and cannot be hard-deleted; set is_active = false instead';
  end if;
  return old;
end;
$$;

create trigger branches_guard_hard_delete before delete on branches
  for each row execute function reject_branch_hard_delete_with_history();

-- Section 10.3: deactivating a branch voids its open assignments and excludes them
-- from scoring.
create or replace function void_assignments_on_branch_deactivate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_active = true and new.is_active = false then
    update task_assignments
       set is_voided = true, voided_reason = 'branch_deactivated'
     where branch_id = new.id
       and status in ('not_started', 'under_review', 'needs_revision');
  end if;
  return new;
end;
$$;

create trigger branches_deactivate_voids_assignments after update on branches
  for each row execute function void_assignments_on_branch_deactivate();

-- Section 10.4: deactivated users cannot log in, but their history stays intact.
-- Enforced in the app's auth check (profiles.is_active), nothing to do at the DB level
-- beyond preserving rows, which foreign keys already guarantee (no cascade deletes here).
