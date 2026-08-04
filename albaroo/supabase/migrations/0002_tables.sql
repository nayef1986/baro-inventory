-- ALBAROO Phase 1 — core tables
-- Note: score_periods / scores (Section 6, scoring engine) are Phase 2 and intentionally
-- not created here. Phase 3 items (multi-company, WhatsApp, AI photo check) are not
-- architected here either — the schema below assumes single-company but keeps
-- company_id everywhere so multi-company can be added later without a rewrite.

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Asia/Riyadh',
  logo_url text,
  created_at timestamptz not null default now()
);

create table settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade unique,
  review_sla_watch_hours int not null default 24 check (review_sla_watch_hours > 0),
  review_sla_critical_hours int not null default 48 check (review_sla_critical_hours > review_sla_watch_hours),
  dormancy_watch_days int not null default 3 check (dormancy_watch_days > 0),
  dormancy_critical_days int not null default 7 check (dormancy_critical_days > dormancy_watch_days),
  dormancy_dead_days int not null default 14 check (dormancy_dead_days > dormancy_critical_days),
  photo_retention_days int not null default 7 check (photo_retention_days >= 7),
  capture_token_validity_minutes int not null default 15 check (capture_token_validity_minutes > 0),
  offline_queue_validity_hours int not null default 12 check (offline_queue_validity_hours > 0),
  min_photo_resolution_width int not null default 800,
  min_photo_resolution_height int not null default 600,
  min_rejection_comment_length int not null default 10 check (min_rejection_comment_length >= 10),
  exif_stale_hours int not null default 48,
  hash_reuse_window_days int not null default 90,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  city text,
  code text not null,
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  full_name_ar text not null,
  full_name_en text,
  role user_role not null,
  phone text,
  locale text not null default 'ar' check (locale in ('ar', 'en', 'ur', 'hi')),
  gallery_upload_enabled boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table user_branches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (user_id, branch_id)
);

create index user_branches_user_idx on user_branches (user_id);
create index user_branches_branch_idx on user_branches (branch_id);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  -- multilingual per 8B.3: {"ar": "...", "en": "...", "ur": "...", "hi": "..."}
  title jsonb not null,
  description jsonb,
  instructions jsonb,
  reference_image_path text,
  source_locale text not null default 'ar' check (source_locale in ('ar', 'en', 'ur', 'hi')),
  priority task_priority not null default 'normal',
  required_photo_count int not null default 1 check (required_photo_count >= 1),
  due_at timestamptz not null,
  grace_hours int not null default 0 check (grace_hours >= 0),
  is_deleted boolean not null default false,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  constraint title_has_source_locale check (title ? source_locale)
);

create table task_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete restrict,
  merchandiser_id uuid references profiles(id),
  supervisor_id uuid references profiles(id),
  status assignment_status not null default 'not_started',
  due_at timestamptz not null,
  due_at_extended_reason text,
  first_submitted_at timestamptz,
  approved_at timestamptz,
  closed_at timestamptz,
  attempt_count int not null default 0,
  score numeric,
  is_voided boolean not null default false,
  voided_reason text,
  created_at timestamptz not null default now(),
  unique (task_id, branch_id)
);

create index task_assignments_branch_idx on task_assignments (branch_id);
create index task_assignments_merchandiser_idx on task_assignments (merchandiser_id);
create index task_assignments_supervisor_idx on task_assignments (supervisor_id);
create index task_assignments_status_idx on task_assignments (status);
create index task_assignments_due_at_idx on task_assignments (due_at);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references task_assignments(id) on delete cascade,
  attempt_number int not null,
  merchandiser_id uuid not null references profiles(id),
  notes text,
  submitted_at timestamptz not null default now(),
  review_status review_status not null default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  review_comment text,
  is_late boolean not null default false,
  authenticity_flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (assignment_id, attempt_number),
  constraint reject_requires_comment check (
    review_status <> 'rejected' or (review_comment is not null and length(review_comment) >= 10)
  ),
  constraint no_self_review check (reviewed_by is null or reviewed_by <> merchandiser_id)
);

create index submissions_assignment_idx on submissions (assignment_id);
create index submissions_merchandiser_idx on submissions (merchandiser_id);
create index submissions_review_status_idx on submissions (review_status);
create index submissions_submitted_at_idx on submissions (submitted_at);

create table submission_photos (
  id uuid primary key default gen_random_uuid(),
  -- nullable until the submission is finalized: a photo is uploaded (and stamped by the
  -- server) against a capture_token before the submission row exists (see submit_assignment()).
  submission_id uuid references submissions(id) on delete cascade,
  capture_token_id uuid references capture_tokens(id),
  uploaded_by uuid not null references profiles(id),
  storage_path text not null,
  thumbnail_path text,
  file_hash text not null,
  file_size int not null,
  width int,
  height int,
  order_index int not null default 0,
  capture_mode capture_mode not null default 'in_app',
  server_captured_at timestamptz not null default now(),
  device_reported_at timestamptz,
  captured_at timestamptz,
  clock_skew_seconds int,
  exif_stripped boolean not null default false,
  exif_make text,
  exif_model text,
  perceptual_hash text,
  gps_lat numeric(9,6),
  gps_lng numeric(9,6),
  distance_from_branch_m int,
  authenticity_flags text[] not null default '{}',
  is_hash_duplicate boolean not null default false,
  full_res_deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index submission_photos_submission_idx on submission_photos (submission_id);
create index submission_photos_hash_idx on submission_photos (file_hash);
create index submission_photos_full_res_deleted_idx on submission_photos (full_res_deleted_at) where full_res_deleted_at is null;
create index submission_photos_unfinalized_idx on submission_photos (created_at) where submission_id is null;

-- Section 7.3: server-issued capture tokens; a photo may only be uploaded against a
-- valid, unused (or offline-queued) token so the server timestamp cannot be spoofed.
create table capture_tokens (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references task_assignments(id) on delete cascade,
  merchandiser_id uuid not null references profiles(id),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  is_offline_queued boolean not null default false,
  queued_at timestamptz,
  created_at timestamptz not null default now()
);

create index capture_tokens_assignment_idx on capture_tokens (assignment_id);
create index capture_tokens_merchandiser_idx on capture_tokens (merchandiser_id);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity_type, entity_id);
create index audit_log_actor_idx on audit_log (actor_id);
create index audit_log_created_at_idx on audit_log (created_at desc);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type notification_type not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  dedupe_key text,
  is_pinned boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, read_at);
create index notifications_created_at_idx on notifications (created_at desc);
-- Section 11C.4 deduplication: same condition never re-alerts the same user within 24h
-- unless it escalates to a new dedupe_key (level baked into the key).
create unique index notifications_dedupe_idx on notifications (user_id, dedupe_key)
  where dedupe_key is not null and read_at is null;

-- Section 11C.2 — dormant branch tracking, evaluated by the daily cron job.
create table branch_activity (
  branch_id uuid primary key references branches(id) on delete cascade,
  last_submission_at timestamptz,
  last_approval_at timestamptz,
  open_assignment_count int not null default 0,
  oldest_open_assignment_at timestamptz,
  dormancy_days int not null default 0,
  alert_level dormancy_level not null default 'normal',
  updated_at timestamptz not null default now()
);

create table activity_feed (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  actor_id uuid references profiles(id),
  event_type text not null,
  assignment_id uuid references task_assignments(id) on delete set null,
  submission_id uuid references submissions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index activity_feed_branch_idx on activity_feed (branch_id, created_at desc);
create index activity_feed_created_at_idx on activity_feed (created_at desc);
