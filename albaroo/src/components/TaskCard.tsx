import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime, isOverdue } from '@/lib/dates';
import type { AssignmentStatus, LocalizedText, TaskPriority } from '@/types/database';

export interface TaskCardData {
  id: string;
  status: AssignmentStatus;
  dueAt: string;
  title: LocalizedText;
  priority: TaskPriority;
  requiredPhotoCount: number;
  branchName?: string;
  hasAttempt: boolean;
}

const PRIORITY_ACCENT: Record<TaskPriority, string> = {
  low: 'border-s-slate/40',
  normal: 'border-s-oud/40',
  high: 'border-s-status-under-review',
  critical: 'border-s-status-needs-revision'
};

export async function TaskCard({ data, locale }: { data: TaskCardData; locale: string }) {
  const t = await getTranslations('tasks');
  const tc = await getTranslations('common');
  const title = data.title[locale as 'ar' | 'en'] ?? data.title.ar ?? data.title.en ?? '';
  const overdue = data.status !== 'approved' && data.status !== 'closed_missed' && isOverdue(data.dueAt);

  return (
    <Link
      href={`/${locale}/tasks/${data.id}`}
      className={`block rounded-card border-s-4 bg-card p-4 shadow-soft transition-transform active:scale-[0.99] ${PRIORITY_ACCENT[data.priority]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-medium text-ink">{title}</h3>
        <StatusBadge status={data.status} />
      </div>
      <p className="mt-1 text-sm text-slate">{data.branchName}</p>
      <div className="mt-3 flex items-center justify-between text-xs text-slate">
        <span className={overdue ? 'font-semibold text-status-needs-revision' : ''}>
          {overdue ? t('overdue') : tc('deadline')}: {formatDateTime(data.dueAt, locale)}
        </span>
        <span>{t('photoProgress', { done: data.hasAttempt ? 1 : 0, required: data.requiredPhotoCount })}</span>
      </div>
    </Link>
  );
}
