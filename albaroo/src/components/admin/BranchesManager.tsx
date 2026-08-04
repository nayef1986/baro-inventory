'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { createBranchAction, deleteBranchAction, reactivateBranchAction, updateBranchAction } from '@/lib/actions/branches';
import type { Branch } from '@/types/database';

export function BranchesManager({ locale, initialBranches }: { locale: string; initialBranches: Branch[] }) {
  const t = useTranslations('branches');
  const tc = useTranslations('common');
  const [branches, setBranches] = useState(initialBranches);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshAfter(action: () => Promise<any>) {
    const result = await action();
    if (result?.error) {
      setMessage(result.error);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">{tc('branches')}</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex min-h-[44px] items-center gap-1 rounded-control bg-oud px-3 text-sm font-medium text-white"
        >
          <Plus size={16} /> {t('addBranch')}
        </button>
      </div>

      {message && <p className="text-sm text-status-needs-revision">{message}</p>}

      {showForm && (
        <BranchForm
          onCancel={() => setShowForm(false)}
          onSubmit={async (values) => {
            const result = await createBranchAction(values);
            if (result.error) {
              setMessage(result.error);
              return;
            }
            window.location.reload();
          }}
        />
      )}

      <ul className="space-y-2">
        {branches.map((b) => (
          <li key={b.id} className="rounded-card bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-ink">{locale === 'ar' ? b.name_ar : b.name_en}</p>
                <p className="text-xs text-slate">
                  {b.code} · {b.city}
                  {!b.is_active && ` · ${tc('deactivate')}`}
                </p>
              </div>
              {b.is_active ? (
                <button
                  onClick={() => {
                    if (confirm(t('deleteConfirmHistory'))) void refreshAfter(() => deleteBranchAction(b.id));
                  }}
                  className="text-xs font-medium text-status-needs-revision"
                >
                  {tc('delete')}
                </button>
              ) : (
                <button onClick={() => void refreshAfter(() => reactivateBranchAction(b.id))} className="text-xs font-medium text-status-approved">
                  {tc('activate')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BranchForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (values: any) => Promise<void> }) {
  const t = useTranslations('branches');
  const tc = useTranslations('common');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [city, setCity] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);

  return (
    <div className="space-y-2 rounded-card bg-card p-4 shadow-soft">
      <input placeholder={t('nameAr')} value={nameAr} onChange={(e) => setNameAr(e.target.value)} className="min-h-[44px] w-full rounded-control border border-black/10 px-3 dark:border-white/10" />
      <input placeholder={t('nameEn')} value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="min-h-[44px] w-full rounded-control border border-black/10 px-3 dark:border-white/10" />
      <input placeholder={t('city')} value={city} onChange={(e) => setCity(e.target.value)} className="min-h-[44px] w-full rounded-control border border-black/10 px-3 dark:border-white/10" />
      <input
        placeholder={t('code')}
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        className="min-h-[44px] w-full rounded-control border border-black/10 px-3 dark:border-white/10"
      />
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={async () => {
            setPending(true);
            await onSubmit({ nameAr, nameEn, city, code });
            setPending(false);
          }}
          className="min-h-[44px] flex-1 rounded-control bg-oud font-medium text-white disabled:opacity-50"
        >
          {tc('save')}
        </button>
        <button onClick={onCancel} className="min-h-[44px] flex-1 rounded-control border border-black/10 dark:border-white/10">
          {tc('cancel')}
        </button>
      </div>
    </div>
  );
}
