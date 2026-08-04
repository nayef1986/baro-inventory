import { getTranslations } from 'next-intl/server';
import { formatDateTime } from '@/lib/dates';

interface Item {
  id: string;
  event_type: string;
  created_at: string;
  branch: { name_ar: string; name_en: string } | null;
}

// Section 11C.3: chronological stream of submissions/approvals — satisfies wanting to
// *see* movement without generating individual alert noise.
export async function ActivityFeed({ locale, items }: { locale: string; items: Item[] }) {
  const t = await getTranslations('dashboard');

  if (items.length === 0) return null;

  return (
    <section className="rounded-card bg-card p-4 shadow-soft">
      <h2 className="mb-3 text-sm font-medium text-slate">{t('activityFeed')}</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between text-xs">
            <span className="text-ink">
              {locale === 'ar' ? item.branch?.name_ar : item.branch?.name_en} · {item.event_type.replace(/_/g, ' ')}
            </span>
            <span className="text-slate">{formatDateTime(item.created_at, locale)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
