-- Row Level Security — enabled on every table (Section 5).
-- Design note: state-changing writes on tasks_assignments/submissions/submission_photos
-- go exclusively through the security-definer RPCs in 0005 (submit_assignment,
-- review_submission, attach_capture_photo, admin_*). Those RPCs run as the function
-- owner and therefore bypass RLS internally, but each one re-derives the actor from
-- auth.uid() and re-checks branch/role access itself, so nothing is actually looser —
-- it just means we do not also grant raw UPDATE policies to supervisor/merchandiser,
-- which would let a client bypass business rules (self-approval, comment length,
-- status-machine order) via a direct REST PATCH. Admin keeps full raw access because
-- admin actions are still funnelled through audited RPCs for anything sensitive
-- (reopen, extend due date, overturn approval) and plain CRUD for the rest (branches,
-- users, tasks) is legitimately direct.

alter table companies enable row level security;
alter table settings enable row level security;
alter table branches enable row level security;
alter table profiles enable row level security;
alter table user_branches enable row level security;
alter table tasks enable row level security;
alter table task_assignments enable row level security;
alter table submissions enable row level security;
alter table submission_photos enable row level security;
alter table capture_tokens enable row level security;
alter table audit_log enable row level security;
alter table notifications enable row level security;
alter table branch_activity enable row level security;
alter table activity_feed enable row level security;

-- companies: readable by any active member of the company.
create policy companies_select on companies for select
  using (id = current_profile_company());
create policy companies_admin_write on companies for all
  using (is_admin() and id = current_profile_company())
  with check (is_admin() and id = current_profile_company());

-- settings: admin only.
create policy settings_admin_all on settings for all
  using (is_admin() and company_id = current_profile_company())
  with check (is_admin() and company_id = current_profile_company());

-- branches: Section 8.3 makes the status board visible to every user, so branch
-- *existence/name/status* is company-wide readable, not limited to assigned branches.
-- Submission content and photos remain branch-scoped below.
create policy branches_select on branches for select
  using (is_active_user() and company_id = current_profile_company());
create policy branches_admin_write on branches for all
  using (is_admin() and company_id = current_profile_company())
  with check (is_admin() and company_id = current_profile_company());

-- profiles: self, admin, or anyone sharing a branch (so a supervisor can see a
-- merchandiser's name on a submission and vice versa).
create policy profiles_select on profiles for select
  using (
    id = auth.uid()
    or is_admin()
    or exists (
      select 1 from user_branches mine
      join user_branches theirs on theirs.branch_id = mine.branch_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );
create policy profiles_self_update_locale on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
create policy profiles_admin_write on profiles for all
  using (is_admin() and company_id = current_profile_company())
  with check (is_admin() and company_id = current_profile_company());

-- user_branches: the access-control foundation table itself.
create policy user_branches_select on user_branches for select
  using (
    user_id = auth.uid()
    or is_admin()
    or has_branch_access(branch_id)
  );
create policy user_branches_admin_write on user_branches for all
  using (is_admin())
  with check (is_admin());

-- tasks: admin full; supervisor/merchandiser can see a task only if it has an
-- assignment reaching one of their branches.
create policy tasks_select on tasks for select
  using (
    is_admin()
    or exists (
      select 1 from task_assignments ta
      where ta.task_id = tasks.id and has_branch_access(ta.branch_id)
    )
  );
create policy tasks_admin_write on tasks for all
  using (is_admin() and company_id = current_profile_company())
  with check (is_admin() and company_id = current_profile_company());

-- task_assignments: admin full; supervisor/merchandiser read-only via RPCs for writes.
create policy task_assignments_select_admin on task_assignments for select
  using (is_admin());
create policy task_assignments_select_supervisor on task_assignments for select
  using (current_profile_role() = 'supervisor' and has_branch_access(branch_id));
create policy task_assignments_select_merchandiser on task_assignments for select
  using (merchandiser_id = auth.uid());
create policy task_assignments_admin_write on task_assignments for all
  using (is_admin())
  with check (is_admin());

-- submissions: admin full; supervisor read within their branches (writes via RPC only);
-- merchandiser select + insert own (insert is exercised only through submit_assignment,
-- but the policy still requires merchandiser_id = auth.uid() as defense in depth).
create policy submissions_select_admin on submissions for select
  using (is_admin());
create policy submissions_select_supervisor on submissions for select
  using (
    current_profile_role() = 'supervisor'
    and exists (select 1 from task_assignments ta where ta.id = submissions.assignment_id and has_branch_access(ta.branch_id))
  );
create policy submissions_select_own on submissions for select
  using (merchandiser_id = auth.uid());
create policy submissions_insert_own on submissions for insert
  with check (merchandiser_id = auth.uid());
create policy submissions_admin_write on submissions for all
  using (is_admin())
  with check (is_admin());

-- submission_photos: mirrors submissions visibility; insert restricted to uploader.
create policy submission_photos_select_admin on submission_photos for select
  using (is_admin());
create policy submission_photos_select_supervisor on submission_photos for select
  using (
    current_profile_role() = 'supervisor'
    and exists (
      select 1 from submissions s join task_assignments ta on ta.id = s.assignment_id
      where s.id = submission_photos.submission_id and has_branch_access(ta.branch_id)
    )
  );
create policy submission_photos_select_own on submission_photos for select
  using (uploaded_by = auth.uid());
create policy submission_photos_insert_own on submission_photos for insert
  with check (uploaded_by = auth.uid());
create policy submission_photos_admin_write on submission_photos for all
  using (is_admin())
  with check (is_admin());

-- capture_tokens: only the issuing merchandiser (and admin) can see their own tokens.
create policy capture_tokens_select_own on capture_tokens for select
  using (merchandiser_id = auth.uid() or is_admin());
create policy capture_tokens_admin_all on capture_tokens for all
  using (is_admin())
  with check (is_admin());

-- audit_log: admin SELECT only. No insert/update/delete policy for anyone — all
-- writes happen through write_audit_log(), a security-definer function.
create policy audit_log_select_admin on audit_log for select
  using (is_admin());

-- notifications: strictly own.
create policy notifications_select_own on notifications for select
  using (user_id = auth.uid());
create policy notifications_update_own on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- branch_activity: same peer-visibility rationale as branches (status board).
create policy branch_activity_select on branch_activity for select
  using (
    is_active_user()
    and exists (select 1 from branches b where b.id = branch_activity.branch_id and b.company_id = current_profile_company())
  );

-- activity_feed: admin sees all; supervisor sees their branches (Section 11C.3 live feed).
create policy activity_feed_select_admin on activity_feed for select
  using (is_admin());
create policy activity_feed_select_supervisor on activity_feed for select
  using (current_profile_role() = 'supervisor' and has_branch_access(branch_id));
