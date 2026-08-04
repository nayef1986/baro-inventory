// Hand-written types mirroring supabase/migrations/*.sql. Once the project is linked
// to a real Supabase instance, replace this file with the generated one:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type UserRole = 'admin' | 'supervisor' | 'merchandiser';
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';
export type AssignmentStatus =
  | 'not_started'
  | 'under_review'
  | 'approved'
  | 'needs_revision'
  | 'closed_missed';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type CaptureMode = 'in_app' | 'offline_queued' | 'gallery';
export type DormancyLevel = 'normal' | 'watch' | 'critical' | 'dead';
export type Locale = 'ar' | 'en' | 'ur' | 'hi';

export type LocalizedText = Partial<Record<Locale, string>>;

export interface Profile {
  id: string;
  company_id: string;
  full_name_ar: string;
  full_name_en: string | null;
  role: UserRole;
  phone: string | null;
  locale: Locale;
  gallery_upload_enabled: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Branch {
  id: string;
  company_id: string;
  name_ar: string;
  name_en: string;
  city: string | null;
  code: string;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  company_id: string;
  title: LocalizedText;
  description: LocalizedText | null;
  instructions: LocalizedText | null;
  reference_image_path: string | null;
  source_locale: Locale;
  priority: TaskPriority;
  required_photo_count: number;
  due_at: string;
  grace_hours: number;
  is_deleted: boolean;
  created_by: string;
  created_at: string;
}

export interface TaskAssignment {
  id: string;
  task_id: string;
  branch_id: string;
  merchandiser_id: string | null;
  supervisor_id: string | null;
  status: AssignmentStatus;
  due_at: string;
  due_at_extended_reason: string | null;
  first_submitted_at: string | null;
  approved_at: string | null;
  closed_at: string | null;
  attempt_count: number;
  score: number | null;
  is_voided: boolean;
  voided_reason: string | null;
  created_at: string;
}

export interface Submission {
  id: string;
  assignment_id: string;
  attempt_number: number;
  merchandiser_id: string;
  notes: string | null;
  submitted_at: string;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  is_late: boolean;
  authenticity_flags: string[];
  created_at: string;
}

export interface SubmissionPhoto {
  id: string;
  submission_id: string | null;
  capture_token_id: string | null;
  uploaded_by: string;
  storage_path: string;
  thumbnail_path: string | null;
  file_hash: string;
  file_size: number;
  width: number | null;
  height: number | null;
  order_index: number;
  capture_mode: CaptureMode;
  server_captured_at: string;
  device_reported_at: string | null;
  captured_at: string | null;
  clock_skew_seconds: number | null;
  exif_stripped: boolean;
  authenticity_flags: string[];
  is_hash_duplicate: boolean;
  full_res_deleted_at: string | null;
  created_at: string;
}

export interface BranchActivity {
  branch_id: string;
  last_submission_at: string | null;
  last_approval_at: string | null;
  open_assignment_count: number;
  oldest_open_assignment_at: string | null;
  dormancy_days: number;
  alert_level: DormancyLevel;
  updated_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_pinned: boolean;
  read_at: string | null;
  created_at: string;
}
