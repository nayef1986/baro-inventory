'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { createUserAction, setUserActiveAction, setGalleryUploadAction, updateUserBranchesAction } from '@/lib/actions/users';
import type { Profile, UserRole } from '@/types/database';

interface BranchOption {
  id: string;
  name_ar: string;
  name_en: string;
  code: string;
}

export function UsersManager({
  locale,
  initialUsers,
  branches,
  userBranches
}: {
  locale: string;
  initialUsers: Profile[];
  branches: BranchOption[];
  userBranches: { user_id: string; branch_id: string }[];
}) {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  function branchesFor(userId: string) {
    return userBranches.filter((ub) => ub.user_id === userId).map((ub) => ub.branch_id);
  }

  async function reload(action: () => Promise<any>) {
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
        <h1 className="text-xl font-semibold text-ink">{tc('admin')}</h1>
        <button onClick={() => setShowForm((s) => !s)} className="flex min-h-[44px] items-center gap-1 rounded-control bg-oud px-3 text-sm font-medium text-white">
          <Plus size={16} /> {t('addUser')}
        </button>
      </div>

      {message && <p className="text-sm text-status-needs-revision">{message}</p>}

      {showForm && (
        <UserForm
          branches={branches}
          locale={locale}
          onCancel={() => setShowForm(false)}
          onSubmit={async (values) => {
            const result = await createUserAction(values);
            if (result.error) {
              setMessage(result.error);
              return;
            }
            window.location.reload();
          }}
        />
      )}

      <ul className="space-y-2">
        {initialUsers.map((u) => (
          <li key={u.id} className="rounded-card bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-ink">{locale === 'ar' ? u.full_name_ar : u.full_name_en ?? u.full_name_ar}</p>
                <p className="text-xs text-slate">
                  {tc(u.role as any)} {!u.is_active && `· ${tc('deactivate')}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setExpanded(expanded === u.id ? null : u.id)} className="text-xs font-medium text-oud">
                  {t('assignedBranches')}
                </button>
                <button
                  onClick={() => void reload(() => setUserActiveAction(u.id, !u.is_active))}
                  className={`text-xs font-medium ${u.is_active ? 'text-status-needs-revision' : 'text-status-approved'}`}
                >
                  {u.is_active ? tc('deactivate') : tc('activate')}
                </button>
              </div>
            </div>

            {expanded === u.id && u.role !== 'admin' && (
              <BranchAssignmentForm
                userId={u.id}
                locale={locale}
                branches={branches}
                selected={branchesFor(u.id)}
                onDone={() => window.location.reload()}
              />
            )}

            {u.role === 'merchandiser' && expanded === u.id && (
              <GalleryToggle userId={u.id} enabled={u.gallery_upload_enabled} onDone={() => window.location.reload()} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UserForm({
  branches,
  locale,
  onCancel,
  onSubmit
}: {
  branches: BranchOption[];
  locale: string;
  onCancel: () => void;
  onSubmit: (values: any) => Promise<void>;
}) {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullNameAr, setFullNameAr] = useState('');
  const [fullNameEn, setFullNameEn] = useState('');
  const [role, setRole] = useState<UserRole>('merchandiser');
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  return (
    <div className="space-y-2 rounded-card bg-card p-4 shadow-soft">
      <input placeholder={t('fullNameAr')} value={fullNameAr} onChange={(e) => setFullNameAr(e.target.value)} className="min-h-[44px] w-full rounded-control border border-black/10 px-3 dark:border-white/10" />
      <input placeholder={t('fullNameEn')} value={fullNameEn} onChange={(e) => setFullNameEn(e.target.value)} className="min-h-[44px] w-full rounded-control border border-black/10 px-3 dark:border-white/10" />
      <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="min-h-[44px] w-full rounded-control border border-black/10 px-3 dark:border-white/10">
        <option value="merchandiser">{tc('merchandiser')}</option>
        <option value="supervisor">{tc('supervisor')}</option>
        <option value="admin">{tc('admin')}</option>
      </select>
      <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} className="min-h-[44px] w-full rounded-control border border-black/10 px-3 dark:border-white/10" />
      <input type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} className="min-h-[44px] w-full rounded-control border border-black/10 px-3 dark:border-white/10" />

      {role !== 'admin' && (
        <div>
          <p className="mb-1 text-xs text-slate">{t('assignedBranches')}</p>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {branches.map((b) => (
              <label key={b.id} className="flex items-center gap-1 rounded-control border border-black/10 px-2 py-1 text-xs dark:border-white/10">
                <input
                  type="checkbox"
                  checked={branchIds.includes(b.id)}
                  onChange={(e) =>
                    setBranchIds((prev) => (e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id)))
                  }
                />
                {locale === 'ar' ? b.name_ar : b.name_en}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={async () => {
            setPending(true);
            await onSubmit({ username, password, fullNameAr, fullNameEn, role, branchIds, locale: 'ar' });
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

function BranchAssignmentForm({
  userId,
  locale,
  branches,
  selected,
  onDone
}: {
  userId: string;
  locale: string;
  branches: BranchOption[];
  selected: string[];
  onDone: () => void;
}) {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const [branchIds, setBranchIds] = useState(selected);
  const [pending, setPending] = useState(false);

  return (
    <div className="mt-3 space-y-2 rounded-control bg-surface p-3">
      <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
        {branches.map((b) => (
          <label key={b.id} className="flex items-center gap-1 rounded-control border border-black/10 px-2 py-1 text-xs dark:border-white/10">
            <input
              type="checkbox"
              checked={branchIds.includes(b.id)}
              onChange={(e) => setBranchIds((prev) => (e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id)))}
            />
            {locale === 'ar' ? b.name_ar : b.name_en}
          </label>
        ))}
      </div>
      <button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await updateUserBranchesAction({ userId, branchIds });
          onDone();
        }}
        className="min-h-[36px] w-full rounded-control bg-oud text-xs font-medium text-white disabled:opacity-50"
      >
        {tc('save')}
      </button>
    </div>
  );
}

function GalleryToggle({ userId, enabled, onDone }: { userId: string; enabled: boolean; onDone: () => void }) {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const [reason, setReason] = useState('');

  return (
    <div className="mt-2 flex items-center gap-2 rounded-control bg-surface p-3 text-xs">
      <span className="flex-1 text-ink">{t('galleryUpload')}</span>
      <input placeholder={tc('reason')} value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[36px] flex-1 rounded-control border border-black/10 px-2 dark:border-white/10" />
      <button
        disabled={reason.trim().length < 3}
        onClick={async () => {
          await setGalleryUploadAction(userId, !enabled, reason);
          onDone();
        }}
        className="min-h-[36px] rounded-control bg-oud px-3 font-medium text-white disabled:opacity-50"
      >
        {enabled ? tc('deactivate') : tc('activate')}
      </button>
    </div>
  );
}
