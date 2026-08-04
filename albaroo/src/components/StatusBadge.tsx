import { useTranslations } from 'next-intl';
import type { AssignmentStatus } from '@/types/database';
import clsx from 'clsx';

// Section 8.4 / 8.5 — status colours are fixed and never reused decoratively.
const STATUS_STYLES: Record<AssignmentStatus, string> = {
  not_started: 'bg-status-not-started/15 text-status-not-started',
  under_review: 'bg-status-under-review/15 text-status-under-review',
  approved: 'bg-status-approved/15 text-status-approved',
  needs_revision: 'bg-status-needs-revision/15 text-status-needs-revision',
  closed_missed: 'bg-status-closed-missed/15 text-status-closed-missed line-through'
};

const DOT_STYLES: Record<AssignmentStatus, string> = {
  not_started: 'bg-status-not-started',
  under_review: 'bg-status-under-review',
  approved: 'bg-status-approved',
  needs_revision: 'bg-status-needs-revision',
  closed_missed: 'bg-status-closed-missed'
};

export function StatusBadge({ status }: { status: AssignmentStatus }) {
  const t = useTranslations('status');
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-control px-2.5 py-1 text-xs font-medium', STATUS_STYLES[status])}>
      <span className={clsx('status-dot', DOT_STYLES[status])} aria-hidden />
      {t(status)}
    </span>
  );
}
