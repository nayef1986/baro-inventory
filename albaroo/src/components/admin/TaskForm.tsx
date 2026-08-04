'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createTaskAction } from '@/lib/actions/tasks';
import type { Locale, TaskPriority } from '@/types/database';

interface BranchOption {
  id: string;
  name_ar: string;
  name_en: string;
  code: string;
}

export function TaskForm({ locale, branches }: { locale: string; branches: BranchOption[] }) {
  const t = useTranslations('tasks');
  const tc = useTranslations('common');
  const tp = useTranslations('priority');
  const router = useRouter();

  const [titleAr, setTitleAr] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [instructionsAr, setInstructionsAr] = useState('');
  const [instructionsEn, setInstructionsEn] = useState('');
  const [sourceLocale, setSourceLocale] = useState<Locale>('ar');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [requiredPhotoCount, setRequiredPhotoCount] = useState(1);
  const [dueAt, setDueAt] = useState('');
  const [graceHours, setGraceHours] = useState(0);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const allSelected = branchIds.length === branches.length && branches.length > 0;

  async function submit() {
    setPending(true);
    setError(null);

    const title: Record<string, string> = {};
    if (titleAr) title.ar = titleAr;
    if (titleEn) title.en = titleEn;
    const instructions: Record<string, string> = {};
    if (instructionsAr) instructions.ar = instructionsAr;
    if (instructionsEn) instructions.en = instructionsEn;

    const result = await createTaskAction({
      title,
      instructions: Object.keys(instructions).length > 0 ? instructions : undefined,
      sourceLocale,
      priority,
      requiredPhotoCount,
      dueAt: dueAt ? new Date(dueAt) : undefined,
      graceHours,
      branchIds
    });
    setPending(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    router.push(`/${locale}/dashboard`);
    router.refresh();
  }

  return (
    <div className="space-y-4 pb-24">
      <h1 className="text-xl font-semibold text-ink">{t('createTitle')}</h1>

      <div>
        <label className="mb-1 block text-xs text-slate">{t('sourceLanguage')}</label>
        <select value={sourceLocale} onChange={(e) => setSourceLocale(e.target.value as Locale)} className="min-h-[44px] w-full rounded-control border border-black/10 px-3 dark:border-white/10">
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-xs text-slate">{t('titleField')} (ar)</label>
        <input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} className="min-h-[44px] w-full rounded-control border border-black/10 px-3 dark:border-white/10" dir="rtl" />
        <label className="block text-xs text-slate">{t('titleField')} (en)</label>
        <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} className="min-h-[44px] w-full rounded-control border border-black/10 px-3 dark:border-white/10" />
      </div>

      <div className="space-y-2">
        <label className="block text-xs text-slate">{t('instructionsField')} (ar)</label>
        <textarea value={instructionsAr} onChange={(e) => setInstructionsAr(e.target.value)} rows={3} className="w-full rounded-control border border-black/10 p-3 dark:border-white/10" dir="rtl" />
        <label className="block text-xs text-slate">{t('instructionsField')} (en)</label>
        <textarea value={instructionsEn} onChange={(e) => setInstructionsEn(e.target.value)} rows={3} className="w-full rounded-control border border-black/10 p-3 dark:border-white/10" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate">{tc('priority')}</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className="min-h-[44px] w-full rounded-control border border-black/10 px-3 dark:border-white/10">
            {(['low', 'normal', 'high', 'critical'] as const).map((p) => (
              <option key={p} value={p}>
                {tp(p)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate">{t('requiredPhotoCount')}</label>
          <input
            type="number"
            min={1}
            max={20}
            value={requiredPhotoCount}
            onChange={(e) => setRequiredPhotoCount(Number(e.target.value))}
            className="min-h-[44px] w-full rounded-control border border-black/10 px-3 dark:border-white/10"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate">{tc('deadline')}</label>
          <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="min-h-[44px] w-full rounded-control border border-black/10 px-3 dark:border-white/10" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate">{t('graceHours')}</label>
          <input type="number" min={0} value={graceHours} onChange={(e) => setGraceHours(Number(e.target.value))} className="min-h-[44px] w-full rounded-control border border-black/10 px-3 dark:border-white/10" />
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs text-slate">{t('selectBranches')}</label>
          <button
            type="button"
            onClick={() => setBranchIds(allSelected ? [] : branches.map((b) => b.id))}
            className="text-xs font-medium text-oud"
          >
            {allSelected ? tc('cancel') : tc('add')}
          </button>
        </div>
        <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto rounded-control border border-black/10 p-2 dark:border-white/10">
          {branches.map((b) => (
            <label key={b.id} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={branchIds.includes(b.id)}
                onChange={(e) => setBranchIds((prev) => (e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id)))}
              />
              {locale === 'ar' ? b.name_ar : b.name_en}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-status-needs-revision">{error}</p>}

      <button
        onClick={submit}
        disabled={pending || branchIds.length === 0 || !dueAt || (sourceLocale === 'ar' ? !titleAr : !titleEn)}
        className="min-h-[44px] w-full rounded-control bg-oud font-medium text-white disabled:opacity-40"
      >
        {pending ? tc('loading') : tc('save')}
      </button>
    </div>
  );
}
