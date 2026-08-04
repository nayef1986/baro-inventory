-- ALBAROO Phase 1 — extensions and enums
create extension if not exists pgcrypto;
create extension if not exists pg_cron;

create type user_role as enum ('admin', 'supervisor', 'merchandiser');

create type task_priority as enum ('low', 'normal', 'high', 'critical');

create type assignment_status as enum (
  'not_started',
  'under_review',
  'approved',
  'needs_revision',
  'closed_missed'
);

create type review_status as enum ('pending', 'approved', 'rejected');

create type capture_mode as enum ('in_app', 'offline_queued', 'gallery');

create type notification_type as enum (
  'task_assigned',
  'submission_received',
  'approved',
  'rejected',
  'review_sla_watch',
  'review_sla_critical',
  'branch_dormant_watch',
  'branch_dormant_critical',
  'branch_dormant_dead',
  'assignment_closed_missed',
  'branch_unassigned',
  'admin_digest'
);

create type dormancy_level as enum ('normal', 'watch', 'critical', 'dead');
