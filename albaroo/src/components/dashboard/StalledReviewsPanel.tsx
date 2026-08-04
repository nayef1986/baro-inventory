import { getTranslations } from 'next-intl/server';
import { hoursSince } from '@/lib/dates';

interface Row {
  id: string;
  submitted_at: string;
  assignment: {
    branch: { name_ar: string; name_en: string } | null;
    supervisor: { full_name_ar: string; full_name_en: string | null } | null;
  } | null;
}

// Section 8.3: "Stalled Reviews panel — submissions past 24h, named by supervisor."
export async function StalledReviewsPanel({ locale, rows, watchHours }: { locale: string; rows: Row[]; watchHours: number }) {
  const t = await getTranslations('dashboard');

  if (rows.length === 0) return null;

  return (
    <section className="rounded-card bg-card p-4 shadow-soft">
      <h2 className="mb-3 text-sm font-medium text-slate">{t('stalledReviews')}</h2>
      <ul className="divide-y divide-black/5 dark:divide-white/5">
        {rows.map((r) => {
          const supervisorName = r.assignment?.supervisor
            ? locale === 'ar'
              ? r.assignment.supervisor.full_name_ar
              : r.assignment.supervisor.full_name_en ?? r.assignment.supervisor.full_name_ar
            : '—';
          const hours = Math.floor(hoursSince(r.submitted_at));
          return (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="text-ink">{locale === 'ar' ? r.assignment?.branch?.name_ar : r.assignment?.branch?.name_en}</p>
                <p className="text-xs text-slate">{supervisorName}</p>
              </div>
              <span className={`font-medium ${hours >= watchHours * 2 ? 'text-status-needs-revision' : 'text-status-under-review'}`}>{hours}h</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
