'use client';

import { usePathname, useRouter } from 'next/navigation';
import { updateLocaleAction } from '@/lib/actions/profile';

const LOCALES: { code: 'ar' | 'en'; label: string }[] = [
  { code: 'ar', label: 'ع' },
  { code: 'en', label: 'EN' }
];

export function LanguageSwitcher({ locale }: { locale: string }) {
  const router = useRouter();
  const pathname = usePathname();

  function switchTo(next: 'ar' | 'en') {
    if (next === locale) return;
    const rest = pathname.split('/').slice(2).join('/');
    void updateLocaleAction(next);
    router.push(`/${next}/${rest}`);
  }

  return (
    <div className="flex overflow-hidden rounded-control border border-black/10 text-xs dark:border-white/10" role="group" aria-label="Language">
      {LOCALES.map((l) => (
        <button
          key={l.code}
          onClick={() => switchTo(l.code)}
          className={`min-h-[36px] min-w-[36px] px-2 font-medium ${l.code === locale ? 'bg-oud text-white' : 'bg-transparent text-slate'}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
