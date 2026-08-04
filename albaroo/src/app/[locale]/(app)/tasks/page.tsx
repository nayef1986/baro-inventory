import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { TaskCard, type TaskCardData } from '@/components/TaskCard';

export default async function TasksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const profile = await getCurrentProfile(locale);
  const t = await getTranslations('tasks');
  const supabase = await createClient();

  const { data: assignments } = await supabase
    .from('task_assignments')
    .select(
      `id, status, due_at, attempt_count,
       task:tasks(id, title, priority, required_photo_count),
       branch:branches(id, name_ar, name_en)`
    )
    .eq('merchandiser_id', profile.id)
    .eq('is_voided', false)
    .order('due_at', { ascending: true });

  const { data: submissionCounts } = await supabase
    .from('submissions')
    .select('assignment_id')
    .eq('merchandiser_id', profile.id);

  const items: TaskCardData[] = (assignments ?? []).map((a: any) => ({
    id: a.id,
    status: a.status,
    dueAt: a.due_at,
    title: a.task?.title ?? {},
    priority: a.task?.priority ?? 'normal',
    requiredPhotoCount: a.task?.required_photo_count ?? 1,
    branchName: locale === 'ar' ? a.branch?.name_ar : a.branch?.name_en,
    hasAttempt: (submissionCounts ?? []).some((s) => s.assignment_id === a.id)
  }));

  const sorted = [...items].sort((a, b) => {
    const rank = (s: TaskCardData) => (s.status === 'closed_missed' ? 3 : new Date(s.dueAt) < new Date() ? 0 : 1);
    return rank(a) - rank(b) || new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });

  return (
    <div className="space-y-3">
      {sorted.length === 0 && <p className="py-12 text-center text-sm text-slate">{t('empty')}</p>}
      {sorted.map((item) => (
        <TaskCard key={item.id} data={item} locale={locale} />
      ))}
    </div>
  );
}
