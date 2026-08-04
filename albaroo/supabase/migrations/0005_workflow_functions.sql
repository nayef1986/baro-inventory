-- Section 7.3: issue a short-lived capture token before the camera opens.
-- The token, not the device clock, is what proves a photo belongs to this
-- assignment/session; server_captured_at is stamped later on upload receipt.
create or replace function issue_capture_token(p_assignment_id uuid, p_offline boolean default false)
returns table (token_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings settings%rowtype;
  v_assignment task_assignments%rowtype;
  v_validity_minutes int;
  v_token_id uuid;
  v_expires timestamptz;
begin
  select * into v_assignment from task_assignments where id = p_assignment_id;
  if not found then
    raise exception 'assignment not found';
  end if;

  if v_assignment.merchandiser_id is distinct from auth.uid() then
    raise exception 'not permitted: assignment is not yours';
  end if;

  if v_assignment.status not in ('not_started', 'needs_revision') then
    raise exception 'assignment is not open for submission (status=%)', v_assignment.status;
  end if;

  select * into v_settings from settings where company_id = current_profile_company();
  v_validity_minutes := coalesce(v_settings.capture_token_validity_minutes, 15);

  if p_offline then
    v_expires := now() + make_interval(hours => coalesce(v_settings.offline_queue_validity_hours, 12));
  else
    v_expires := now() + make_interval(mins => v_validity_minutes);
  end if;

  insert into capture_tokens (assignment_id, merchandiser_id, expires_at, is_offline_queued)
  values (p_assignment_id, auth.uid(), v_expires, p_offline)
  returning id into v_token_id;

  return query select v_token_id, v_expires;
end;
$$;

-- Called by the server-side upload route (not directly by the browser) after it has
-- received the file, computed its hash, generated a thumbnail, and stamped the
-- authoritative server_captured_at. security definer because it must write
-- submission_photos before a submissions row exists (no owning submission yet), but
-- it re-checks auth.uid() against the token's merchandiser_id itself, so it is no more
-- permissive than the caller actually being that merchandiser.
create or replace function attach_capture_photo(
  p_token_id uuid,
  p_storage_path text,
  p_thumbnail_path text,
  p_file_hash text,
  p_file_size int,
  p_width int,
  p_height int,
  p_capture_mode capture_mode,
  p_device_reported_at timestamptz,
  p_captured_at timestamptz,
  p_exif_stripped boolean,
  p_exif_make text,
  p_exif_model text,
  p_gps_lat numeric,
  p_gps_lng numeric,
  p_queued_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token capture_tokens%rowtype;
  v_photo_id uuid;
  v_skew int;
  v_hash_dupe boolean;
  v_window_days int;
  v_flags text[] := '{}';
begin
  select * into v_token from capture_tokens where id = p_token_id;
  if not found then
    raise exception 'invalid capture token';
  end if;

  if v_token.merchandiser_id is distinct from auth.uid() then
    raise exception 'not permitted: token is not yours';
  end if;

  if v_token.used_at is not null and not v_token.is_offline_queued then
    raise exception 'token already used';
  end if;

  if now() > v_token.expires_at then
    if p_capture_mode = 'offline_queued' then
      v_flags := array_append(v_flags, 'offline_window_expired');
    else
      raise exception 'capture token expired';
    end if;
  end if;

  if p_device_reported_at is not null then
    v_skew := extract(epoch from (now() - p_device_reported_at))::int;
  end if;

  select coalesce(settings.hash_reuse_window_days, 90) into v_window_days
  from settings where company_id = current_profile_company();

  select exists (
    select 1 from submission_photos sp
    join submissions s on s.id = sp.submission_id
    join task_assignments ta on ta.id = s.assignment_id
    join branches b on b.id = ta.branch_id
    where sp.file_hash = p_file_hash
      and b.company_id = current_profile_company()
      and sp.created_at > now() - make_interval(days => v_window_days)
  ) into v_hash_dupe;

  if v_hash_dupe then
    v_flags := array_append(v_flags, 'duplicate_photo_hash');
  end if;

  if p_captured_at is not null and p_captured_at < now() - interval '48 hours' then
    v_flags := array_append(v_flags, 'stale_capture_date');
  end if;

  if p_exif_stripped then
    v_flags := array_append(v_flags, 'exif_stripped');
  end if;

  if p_width is not null and p_height is not null
     and (p_width < 800 or p_height < 600) then
    raise exception 'photo resolution below minimum (800x600)';
  end if;

  insert into submission_photos (
    capture_token_id, uploaded_by, storage_path, thumbnail_path, file_hash, file_size,
    width, height, capture_mode, server_captured_at, device_reported_at, captured_at,
    clock_skew_seconds, exif_stripped, exif_make, exif_model, gps_lat, gps_lng,
    is_hash_duplicate, authenticity_flags
  ) values (
    p_token_id, auth.uid(), p_storage_path, p_thumbnail_path, p_file_hash, p_file_size,
    p_width, p_height, p_capture_mode, now(), p_device_reported_at, p_captured_at,
    v_skew, p_exif_stripped, p_exif_make, p_exif_model, p_gps_lat, p_gps_lng,
    v_hash_dupe, v_flags
  ) returning id into v_photo_id;

  update capture_tokens
     set used_at = now(),
         queued_at = coalesce(p_queued_at, queued_at)
   where id = p_token_id;

  return v_photo_id;
end;
$$;

-- Finalizes a submission: moves the given (already-uploaded, capture-token-verified)
-- photos onto a new submissions row and transitions the assignment to under_review.
create or replace function submit_assignment(
  p_assignment_id uuid,
  p_notes text,
  p_photo_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment task_assignments%rowtype;
  v_task tasks%rowtype;
  v_submission_id uuid;
  v_attempt int;
  v_photo_count int;
  v_grace_deadline timestamptz;
  v_is_late boolean;
begin
  select * into v_assignment from task_assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'assignment not found';
  end if;

  if v_assignment.merchandiser_id is distinct from auth.uid() then
    raise exception 'not permitted: assignment is not yours';
  end if;

  if v_assignment.status not in ('not_started', 'needs_revision') then
    raise exception 'conflict: assignment already has a submission under review (status=%)', v_assignment.status;
  end if;

  select * into v_task from tasks where id = v_assignment.task_id;

  select count(*) into v_photo_count
  from submission_photos
  where id = any(p_photo_ids)
    and submission_id is null
    and uploaded_by = auth.uid()
    and capture_token_id in (
      select id from capture_tokens where assignment_id = p_assignment_id and merchandiser_id = auth.uid()
    );

  if v_photo_count < v_task.required_photo_count then
    raise exception 'not enough verified photos: need %, got %', v_task.required_photo_count, v_photo_count;
  end if;

  v_attempt := v_assignment.attempt_count + 1;
  v_grace_deadline := v_assignment.due_at + make_interval(hours => v_task.grace_hours);
  v_is_late := now() > v_grace_deadline;

  insert into submissions (assignment_id, attempt_number, merchandiser_id, notes, is_late)
  values (p_assignment_id, v_attempt, auth.uid(), p_notes, v_is_late)
  returning id into v_submission_id;

  update submission_photos
     set submission_id = v_submission_id
   where id = any(p_photo_ids)
     and submission_id is null
     and uploaded_by = auth.uid();

  update task_assignments
     set status = 'under_review',
         attempt_count = v_attempt,
         first_submitted_at = coalesce(first_submitted_at, now())
   where id = p_assignment_id;

  insert into activity_feed (branch_id, actor_id, event_type, assignment_id, submission_id)
  values (v_assignment.branch_id, auth.uid(), 'submission_received', p_assignment_id, v_submission_id);

  perform write_audit_log(auth.uid(), 'submit', 'task_assignment', p_assignment_id,
    jsonb_build_object('status', v_assignment.status),
    jsonb_build_object('status', 'under_review', 'attempt', v_attempt));

  if v_assignment.supervisor_id is not null then
    insert into notifications (user_id, type, title, body, entity_type, entity_id)
    values (v_assignment.supervisor_id, 'submission_received', 'New submission awaiting review',
      null, 'task_assignment', p_assignment_id);
  end if;

  return v_submission_id;
end;
$$;

-- approve / reject. Only the assignment's supervisor(s) (anyone with branch access and
-- the supervisor role) or an admin may call this. Self-approval is impossible: the
-- submission's merchandiser_id can never equal the caller because RLS already scopes
-- supervisors away from their own merchandiser rows, and the no_self_review check
-- constraint blocks it at the data layer as a second line of defense.
create or replace function review_submission(
  p_submission_id uuid,
  p_decision review_status,
  p_comment text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission submissions%rowtype;
  v_assignment task_assignments%rowtype;
  v_role user_role;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision';
  end if;

  select * into v_submission from submissions where id = p_submission_id for update;
  if not found then
    raise exception 'submission not found';
  end if;

  select * into v_assignment from task_assignments where id = v_submission.assignment_id for update;

  if v_assignment.status <> 'under_review' or v_submission.review_status <> 'pending' then
    raise exception 'conflict: this submission is no longer pending review (a newer attempt may exist)';
  end if;

  v_role := current_profile_role();
  if v_role = 'merchandiser' or not (v_role = 'admin' or has_branch_access(v_assignment.branch_id)) then
    raise exception 'not permitted';
  end if;

  if v_submission.merchandiser_id = auth.uid() then
    raise exception 'self-approval is not permitted';
  end if;

  if p_decision = 'rejected' and (p_comment is null or length(trim(p_comment)) < 10) then
    raise exception 'rejection requires a comment of at least 10 characters';
  end if;

  update submissions
     set review_status = p_decision,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_comment = p_comment
   where id = p_submission_id;

  if p_decision = 'approved' then
    update task_assignments
       set status = 'approved', approved_at = now()
     where id = v_assignment.id;
    insert into activity_feed (branch_id, actor_id, event_type, assignment_id, submission_id)
    values (v_assignment.branch_id, auth.uid(), 'approved', v_assignment.id, p_submission_id);
    insert into notifications (user_id, type, title, body, entity_type, entity_id)
    values (v_submission.merchandiser_id, 'approved', 'Submission approved', null, 'task_assignment', v_assignment.id);
  else
    update task_assignments
       set status = 'needs_revision'
     where id = v_assignment.id;
    insert into activity_feed (branch_id, actor_id, event_type, assignment_id, submission_id)
    values (v_assignment.branch_id, auth.uid(), 'rejected', v_assignment.id, p_submission_id);
    insert into notifications (user_id, type, title, body, entity_type, entity_id)
    values (v_submission.merchandiser_id, 'rejected', 'Submission needs revision', p_comment, 'task_assignment', v_assignment.id);
  end if;

  perform write_audit_log(auth.uid(), p_decision::text, 'submission', p_submission_id,
    jsonb_build_object('review_status', 'pending'),
    jsonb_build_object('review_status', p_decision, 'comment', p_comment));
end;
$$;

-- Admin-only: reopen a closed_missed assignment. Mandatory reason, always audited.
create or replace function admin_reopen_assignment(p_assignment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment task_assignments%rowtype;
begin
  if not is_admin() then
    raise exception 'not permitted';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'a reason is required to reopen an assignment';
  end if;

  select * into v_assignment from task_assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'assignment not found';
  end if;
  if v_assignment.status <> 'closed_missed' then
    raise exception 'only closed_missed assignments can be reopened';
  end if;

  update task_assignments
     set status = 'not_started', closed_at = null, score = null
   where id = p_assignment_id;

  perform write_audit_log(auth.uid(), 'reopen', 'task_assignment', p_assignment_id,
    jsonb_build_object('status', 'closed_missed'),
    jsonb_build_object('status', 'not_started'),
    p_reason);
end;
$$;

-- Admin-only: extend an individual assignment's due date. Always audited with a reason.
create or replace function admin_extend_due_date(p_assignment_id uuid, p_new_due_at timestamptz, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment task_assignments%rowtype;
begin
  if not is_admin() then
    raise exception 'not permitted';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'a reason is required to extend a deadline';
  end if;

  select * into v_assignment from task_assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'assignment not found';
  end if;

  update task_assignments
     set due_at = p_new_due_at, due_at_extended_reason = p_reason
   where id = p_assignment_id;

  perform write_audit_log(auth.uid(), 'extend_due_date', 'task_assignment', p_assignment_id,
    jsonb_build_object('due_at', v_assignment.due_at),
    jsonb_build_object('due_at', p_new_due_at),
    p_reason);
end;
$$;

-- Admin-only: mark an approved assignment as overturned during audit sampling (Section 8.3).
create or replace function admin_overturn_approval(p_assignment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment task_assignments%rowtype;
begin
  if not is_admin() then
    raise exception 'not permitted';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'a reason is required to overturn an approval';
  end if;

  select * into v_assignment from task_assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'assignment not found';
  end if;
  if v_assignment.status <> 'approved' then
    raise exception 'only approved assignments can be overturned';
  end if;

  perform write_audit_log(auth.uid(), 'overturn_approval', 'task_assignment', p_assignment_id,
    jsonb_build_object('status', 'approved'),
    jsonb_build_object('status', 'approved', 'overturned', true),
    p_reason);
end;
$$;

-- Admin-only: enable/disable gallery upload for a user (Section 7.3 gallery exception).
create or replace function admin_set_gallery_upload(p_user_id uuid, p_enabled boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'not permitted';
  end if;

  update profiles set gallery_upload_enabled = p_enabled where id = p_user_id;

  perform write_audit_log(auth.uid(), case when p_enabled then 'enable_gallery_upload' else 'disable_gallery_upload' end,
    'profile', p_user_id, null, jsonb_build_object('gallery_upload_enabled', p_enabled), p_reason);
end;
$$;

-- Notification helper enforcing the 24h dedupe rule (Section 11C.4).
create or replace function notify_once(
  p_user_id uuid,
  p_type notification_type,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid,
  p_dedupe_key text,
  p_pinned boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (user_id, type, title, body, entity_type, entity_id, dedupe_key, is_pinned)
  values (p_user_id, p_type, p_title, p_body, p_entity_type, p_entity_id, p_dedupe_key, p_pinned)
  on conflict (user_id, dedupe_key) where dedupe_key is not null and read_at is null
  do nothing;
end;
$$;
