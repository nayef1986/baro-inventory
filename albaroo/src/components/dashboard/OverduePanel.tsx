'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { extendDueDateAction } from '@/lib/actions/admin';
import { formatDateTime } from '@/lib/dates';

interface Row {
  id: string;
  due_at: string;
  branch: { name_ar: string; name_en: string } | null;
  merchandiser: { full_name_ar: string; full_name_en: string | null } | null;
}

// Section 8.3: "Overdue panel — assignments past deadline, named by merchandiser."
export function OverduePanel({ locale, rows }: { locale: string; rows: Row[] }) {
  const t = useTranslations('dashboard');
  const [editing, setEditing] = useState<string | null>(null);

  if (rows.length === 0) return null;

  return (
    <section className="rounded-card bg-card p-4 shadow-soft">
      <h2 className="mb-3 text-sm font-medium text-slate">{t('overdue')}</h2>
      <ul className="divide-y divide-black/5 dark:divide-white/5">
        {rows.map((r) => {
          const name = r.merchandiser
            ? locale === 'ar'
              ? r.merchandiser.full_name_ar
              : r.merchandiser.full_name_en ?? r.merchandiser.full_name_ar
            : t('noMerchandiser');
          return (
            <li key={r.id} className="py-2 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ink">{locale === 'ar' ? r.branch?.name_ar : r.branch?.name_en}</p>
                  <p className="text-xs text-slate">
                    {name} · {formatDateTime(r.due_at, locale)}
                  </p>
                </div>
                <button onClick={() => setEditing(editing === r.id ? null : r.id)} className="text-xs font-medium text-oud">
                  {t('extendDeadline')}
                </button>
              </div>
              {editing === r.id && <ExtendForm assignmentId={r.id} onDone={() => setEditing(null)} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ExtendForm({ assignmentId, onDone }: { assignmentId: string; onDone: () => void }) {
  const tc = useTranslations('common');
  const [newDueAt, setNewDueAt] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await extendDueDateAction({ assignmentId, newDueAt: newDueAt ? new Date(newDueAt) : undefined, reason });
    setPending(false);
    if (result && 'error' in result) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <div className="mt-2 space-y-2 rounded-control bg-surface p-3">
      <input
        type="datetime-local"
        value={newDueAt}
        onChange={(e) => setNewDueAt(e.target.value)}
        className="min-h-[44px] w-full rounded-control border border-black/10 bg-card px-3 text-sm dark:border-white/10"
      />
      <input
        placeholder={tc('reason')}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="min-h-[44px] w-full rounded-control border border-black/10 bg-card px-3 text-sm dark:border-white/10"
      />
      {error && <p className="text-xs text-status-needs-revision">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={pending || !newDueAt || reason.trim().length < 5} className="min-h-[36px] flex-1 rounded-control bg-oud text-xs font-medium text-white disabled:opacity-50">
          {tc('confirm')}
        </button>
        <button onClick={onDone} className="min-h-[36px] flex-1 rounded-control border border-black/10 text-xs dark:border-white/10">
          {tc('cancel')}
        </button>
      </div>
    </div>
  );
}
