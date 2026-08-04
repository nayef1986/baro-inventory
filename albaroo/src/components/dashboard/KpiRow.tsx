import { getTranslations } from 'next-intl/server';

export async function KpiRow({
  totals
}: {
  totals: { total: number; approved: number; under_review: number; needs_revision: number; closed_missed: number };
}) {
  const t = await getTranslations('dashboard.kpi');
  const completionPct = totals.total > 0 ? Math.round((totals.approved / totals.total) * 100) : 0;

  const cells = [
    { label: t('completion'), value: `${completionPct}%`, color: 'text-status-approved' },
    { label: t('underReview'), value: totals.under_review, color: 'text-status-under-review' },
    { label: t('needsRevision'), value: totals.needs_revision, color: 'text-status-needs-revision' },
    { label: t('missed'), value: totals.closed_missed, color: 'text-status-closed-missed' }
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="rounded-card bg-card p-3 text-center shadow-soft">
          <p className={`text-2xl font-semibold ${c.color}`}>{c.value}</p>
          <p className="text-xs text-slate">{c.label}</p>
        </div>
      ))}
    </div>
  );
}
