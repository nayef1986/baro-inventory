-- audit_log is append-only for everyone, including service-role callers that slip past RLS.
-- This is defense in depth on top of the RLS policy (which grants SELECT/INSERT only).
create or replace function reject_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only: % is not permitted', tg_op;
end;
$$;

create trigger audit_log_no_update
  before update on audit_log
  for each row execute function reject_audit_log_mutation();

create trigger audit_log_no_delete
  before delete on audit_log
  for each row execute function reject_audit_log_mutation();

create or replace function write_audit_log(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into audit_log (actor_id, action, entity_type, entity_id, before, after, reason)
  values (p_actor_id, p_action, p_entity_type, p_entity_id, p_before, p_after, p_reason)
  returning id into v_id;
  return v_id;
end;
$$;
