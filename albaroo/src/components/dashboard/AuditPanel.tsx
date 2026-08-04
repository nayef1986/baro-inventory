'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { overturnApprovalAction } from '@/lib/actions/admin';
import { formatDateTime } from '@/lib/dates';

interface Row {
  id: string;
  approved_at: string;
  branch: { name_ar: string; name_en: string } | null;
  task: { title: Record<string, string> } | null;
}

// Section 8.3: "Audit tool: sample any approved assignment and mark it 'approval
// overturned' with a reason." Feeds Section 6.2's supervisor review-integrity penalty
// in Phase 2 and Section 11B.3's exceptions log in the monthly report.
export function AuditPanel({ locale, rows }: { locale: string; rows: Row[] }) {
  const t = useTranslations('dashboard');
  const [editing, setEditing] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  const visible = rows.filter((r) => !done.has(r.id));
  if (visible.length === 0) return null;

  return (
    <section className="rounded-card bg-card p-4 shadow-soft">
      <h2 className="mb-3 text-sm font-medium text-slate">{t('overturnApproval')}</h2>
      <ul className="divide-y divide-black/5 dark:divide-white/5">
        {visible.slice(0, 10).map((r) => (
          <li key={r.id} className="py-2 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-ink">{r.task?.title?.[locale] ?? Object.values(r.task?.title ?? {})[0]}</p>
                <p className="text-xs text-slate">
                  {locale === 'ar' ? r.branch?.name_ar : r.branch?.name_en} · {formatDateTime(r.approved_at, locale)}
                </p>
              </div>
              <button onClick={() => setEditing(editing === r.id ? null : r.id)} className="text-xs font-medium text-status-needs-revision">
                {t('overturnApproval')}
              </button>
            </div>
            {editing === r.id && (
              <OverturnForm
                assignmentId={r.id}
                onDone={() => {
                  setDone((prev) => new Set(prev).add(r.id));
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function OverturnForm({ assignmentId, onDone, onCancel }: { assignmentId: string; onDone: () => void; onCancel: () => void }) {
  const tc = useTranslations('common');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await overturnApprovalAction({ assignmentId, reason });
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
        placeholder={tc('reason')}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="min-h-[44px] w-full rounded-control border border-black/10 bg-card px-3 text-sm dark:border-white/10"
      />
      {error && <p className="text-xs text-status-needs-revision">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={pending || reason.trim().length < 5} className="min-h-[36px] flex-1 rounded-control bg-status-needs-revision text-xs font-medium text-white disabled:opacity-50">
          {tc('confirm')}
        </button>
        <button onClick={onCancel} className="min-h-[36px] flex-1 rounded-control border border-black/10 text-xs dark:border-white/10">
          {tc('cancel')}
        </button>
      </div>
    </div>
  );
}
