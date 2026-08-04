import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { SubmissionScreen } from '@/components/SubmissionScreen';

export default async function TaskSubmissionPage({
  params
}: {
  params: Promise<{ locale: string; assignmentId: string }>;
}) {
  const { locale, assignmentId } = await params;
  const profile = await getCurrentProfile(locale);
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from('task_assignments')
    .select(
      `id, status, due_at, attempt_count,
       task:tasks(id, title, description, instructions, source_locale, required_photo_count, reference_image_path),
       branch:branches(id, name_ar, name_en)`
    )
    .eq('id', assignmentId)
    .eq('merchandiser_id', profile.id)
    .single();

  if (!assignment) notFound();

  const { data: latestSubmission } = await supabase
    .from('submissions')
    .select('id, review_comment, review_status, attempt_number')
    .eq('assignment_id', assignmentId)
    .order('attempt_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <SubmissionScreen
      locale={locale}
      profileLocale={profile.locale}
      galleryUploadEnabled={profile.gallery_upload_enabled}
      assignment={assignment as any}
      latestSubmission={latestSubmission as any}
    />
  );
}
