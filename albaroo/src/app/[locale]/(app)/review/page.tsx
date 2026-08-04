import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { ReviewQueue, type ReviewItem } from '@/components/ReviewQueue';

export default async function ReviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const profile = await getCurrentProfile(locale);
  const supabase = await createClient();

  const { data: submissions } = await supabase
    .from('submissions')
    .select(
      `id, notes, submitted_at, attempt_number, is_late, authenticity_flags,
       merchandiser:profiles!submissions_merchandiser_id_fkey(id, full_name_ar, full_name_en),
       assignment:task_assignments!inner(id, branch_id, due_at,
         task:tasks(id, title, required_photo_count),
         branch:branches(id, name_ar, name_en)),
       photos:submission_photos(id, storage_path, thumbnail_path, capture_mode, order_index, authenticity_flags)`
    )
    .eq('review_status', 'pending')
    .eq('assignment.status', 'under_review')
    .order('submitted_at', { ascending: true });

  const items: ReviewItem[] = (submissions ?? [])
    .filter((s: any) => s.assignment)
    .map((s: any) => ({
      submissionId: s.id,
      notes: s.notes,
      submittedAt: s.submitted_at,
      attemptNumber: s.attempt_number,
      isLate: s.is_late,
      authenticityFlags: s.authenticity_flags ?? [],
      merchandiserName: locale === 'ar' ? s.merchandiser?.full_name_ar : s.merchandiser?.full_name_en ?? s.merchandiser?.full_name_ar,
      branchName: locale === 'ar' ? s.assignment.branch?.name_ar : s.assignment.branch?.name_en,
      taskTitle: s.assignment.task?.title ?? {},
      photos: (s.photos ?? []).sort((a: any, b: any) => a.order_index - b.order_index)
    }));

  return <ReviewQueue locale={locale} items={items} />;
}
