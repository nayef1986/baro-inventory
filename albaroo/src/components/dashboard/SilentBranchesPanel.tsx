import { getTranslations } from 'next-intl/server';
import type { DormancyLevel } from '@/types/database';

interface Row {
  branch_id: string;
  dormancy_days: number;
  alert_level: DormancyLevel;
  branch: { name_ar: string; name_en: string } | null;
}

const LEVEL_COLOR: Record<DormancyLevel, string> = {
  normal: 'text-slate',
  watch: 'text-status-under-review',
  critical: 'text-status-needs-revision',
  dead: 'text-status-closed-missed'
};

// Section 11C.2: "the answer to 'which branches haven't moved?' at a single glance."
export async function SilentBranchesPanel({ locale, rows }: { locale: string; rows: Row[] }) {
  const t = await getTranslations('dashboard');

  if (rows.length === 0) return null;

  return (
    <section className="rounded-card bg-card p-4 shadow-soft">
      <h2 className="mb-3 text-sm font-medium text-slate">{t('silentBranches')}</h2>
      <ul className="divide-y divide-black/5 dark:divide-white/5">
        {rows.map((r) => (
          <li key={r.branch_id} className="flex items-center justify-between py-2 text-sm">
            <span className="text-ink">{locale === 'ar' ? r.branch?.name_ar : r.branch?.name_en}</span>
            <span className={`font-medium ${LEVEL_COLOR[r.alert_level]}`}>{t('daysSilent', { days: r.dormancy_days })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
