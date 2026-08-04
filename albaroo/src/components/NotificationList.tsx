'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Pin } from 'lucide-react';
import clsx from 'clsx';
import { markAllNotificationsReadAction, markNotificationReadAction } from '@/lib/actions/notifications';
import { formatDateTime } from '@/lib/dates';
import type { NotificationRow, UserRole } from '@/types/database';

function deepLink(locale: string, role: UserRole, n: NotificationRow): string {
  if (n.entity_type === 'task_assignment' && n.entity_id) {
    if (role === 'merchandiser') return `/${locale}/tasks/${n.entity_id}`;
    if (role === 'supervisor') return `/${locale}/review`;
  }
  return `/${locale}/dashboard`;
}

export function NotificationList({ locale, role, notifications }: { locale: string; role: UserRole; notifications: NotificationRow[] }) {
  const t = useTranslations('notifications');
  const tc = useTranslations('common');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">{t('title')}</h1>
        <button onClick={() => void markAllNotificationsReadAction()} className="text-sm font-medium text-oud">
          {t('markAllRead')}
        </button>
      </div>

      {notifications.length === 0 && <p className="py-12 text-center text-sm text-slate">{t('empty')}</p>}

      <ul className="space-y-2">
        {notifications.map((n) => (
          <li key={n.id}>
            <Link
              href={deepLink(locale, role, n)}
              onClick={() => !n.read_at && void markNotificationReadAction(n.id)}
              className={clsx('block rounded-card p-4 shadow-soft', n.read_at ? 'bg-card' : 'bg-oud-tint')}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-ink">{n.title}</p>
                {n.is_pinned && <Pin size={14} className="text-status-needs-revision" />}
              </div>
              {n.body && <p className="mt-1 text-sm text-slate">{n.body}</p>}
              <p className="mt-1 text-xs text-slate">{formatDateTime(n.created_at, locale)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
