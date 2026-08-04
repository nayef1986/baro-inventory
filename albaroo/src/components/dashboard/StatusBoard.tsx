import { getTranslations } from 'next-intl/server';
import clsx from 'clsx';
import type { DormancyLevel } from '@/types/database';

export interface BranchStatusRow {
  branch_id: string;
  branch_name_ar: string;
  branch_name_en: string;
  branch_code: string;
  is_active: boolean;
  total: number;
  not_started: number;
  under_review: number;
  approved: number;
  needs_revision: number;
  closed_missed: number;
  dormancy_level: DormancyLevel;
  dormancy_days: number;
}

// Section 8.3: "all 21 branches as a colour grid for the current period. Visible to
// all users, not just Admin." A cell's colour is the dominant status among that
// branch's assignments this period; a dormancy ring overlays branches gone quiet.
function dominantColor(r: BranchStatusRow): string {
  if (r.total === 0) return 'bg-status-not-started/30';
  const entries: [string, number][] = [
    ['closed_missed', r.closed_missed],
    ['needs_revision', r.needs_revision],
    ['under_review', r.under_review],
    ['approved', r.approved],
    ['not_started', r.not_started]
  ];
  const max = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const colors: Record<string, string> = {
    closed_missed: 'bg-status-closed-missed',
    needs_revision: 'bg-status-needs-revision',
    under_review: 'bg-status-under-review',
    approved: 'bg-status-approved',
    not_started: 'bg-status-not-started'
  };
  return colors[max[0]] ?? 'bg-status-not-started';
}

export async function StatusBoard({ locale, rows }: { locale: string; rows: BranchStatusRow[] }) {
  const t = await getTranslations('dashboard');
  const tc = await getTranslations('common');

  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-slate">{t('statusBoard')}</h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {rows.map((r) => {
          const name = locale === 'ar' ? r.branch_name_ar : r.branch_name_en;
          const pct = r.total > 0 ? Math.round((r.approved / r.total) * 100) : 0;
          return (
            <div
              key={r.branch_id}
              className={clsx(
                'relative overflow-hidden rounded-card p-3 text-white shadow-soft',
                dominantColor(r),
                r.dormancy_level !== 'normal' && 'ring-2 ring-offset-1 ring-status-under-review'
              )}
              title={name}
            >
              <p className="truncate text-xs font-medium">{name}</p>
              <p className="mt-1 text-lg font-semibold">{pct}%</p>
              <p className="text-[10px] opacity-90">
                {r.approved}/{r.total}
              </p>
              {r.dormancy_level !== 'normal' && (
                <p className="mt-1 text-[10px] font-medium opacity-95">{t('daysSilent', { days: r.dormancy_days })}</p>
              )}
              {!r.is_active && <p className="text-[10px] opacity-75">({tc('deactivate')})</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
