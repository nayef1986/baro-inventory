'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { signInAction } from '@/lib/actions/auth';

export default function LoginPage() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await signInAction(username, password);
    setPending(false);
    if ('error' in result) {
      setError(result.error === 'deactivated' ? t('accountDeactivated') : t('invalidCredentials'));
      return;
    }
    const next = searchParams.get('next');
    router.replace(next ?? `/${locale}`);
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-modal bg-card p-8 shadow-elevated">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-card bg-oud" aria-hidden />
          <h1 className="text-2xl font-semibold text-ink">{tc('appName')}</h1>
          <p className="mt-1 text-sm text-slate">{t('title')}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium text-ink">
              {t('username')}
            </label>
            <input
              id="username"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="min-h-[44px] w-full rounded-control border border-black/10 bg-surface px-4 py-2 text-ink outline-none focus:ring-2 focus:ring-oud dark:border-white/10"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink">
              {t('password')}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-[44px] w-full rounded-control border border-black/10 bg-surface px-4 py-2 text-ink outline-none focus:ring-2 focus:ring-oud dark:border-white/10"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-control bg-status-needs-revision/10 px-3 py-2 text-sm text-status-needs-revision">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="min-h-[44px] w-full rounded-control bg-oud font-medium text-white transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {pending ? tc('loading') : t('signIn')}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate">{t('noSignUp')}</p>
      </div>
    </main>
  );
}
