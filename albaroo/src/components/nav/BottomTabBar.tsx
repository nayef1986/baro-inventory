'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ClipboardCheck, ListChecks, LayoutGrid, Building2, Users } from 'lucide-react';
import clsx from 'clsx';
import type { UserRole } from '@/types/database';

interface TabItem {
  href: string;
  labelKey: string;
  icon: typeof ListChecks;
  roles: UserRole[];
}

const TABS: TabItem[] = [
  { href: 'tasks', labelKey: 'tasks', icon: ListChecks, roles: ['merchandiser'] },
  { href: 'review', labelKey: 'review', icon: ClipboardCheck, roles: ['supervisor'] },
  { href: 'dashboard', labelKey: 'dashboard', icon: LayoutGrid, roles: ['admin', 'supervisor', 'merchandiser'] },
  { href: 'branches', labelKey: 'branches', icon: Building2, roles: ['admin'] },
  { href: 'users', labelKey: 'users', icon: Users, roles: ['admin'] }
];

export function BottomTabBar({ locale, role }: { locale: string; role: UserRole }) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const items = TABS.filter((tab) => tab.roles.includes(role));

  return (
    <nav
      className="glass-chrome safe-bottom fixed inset-x-0 bottom-0 z-40 flex justify-around border-t md:hidden"
      aria-label={t('tasks')}
    >
      {items.map((tab) => {
        const href = `/${locale}/${tab.href}`;
        const active = pathname.startsWith(href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={href}
            className={clsx(
              'flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs transition-colors',
              active ? 'text-oud' : 'text-slate'
            )}
          >
            <Icon size={22} strokeWidth={1.5} aria-hidden />
            <span>{t(tab.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
