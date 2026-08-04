'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function NotificationBell({ locale }: { locale: string }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
      if (!cancelled) setUnread(count ?? 0);
    }

    load();
    const interval = setInterval(load, 30_000);

    const channel = supabase
      .channel('notifications-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Link href={`/${locale}/notifications`} className="relative flex min-h-[44px] min-w-[44px] items-center justify-center" aria-label="Notifications">
      <Bell size={22} strokeWidth={1.5} className="text-ink" aria-hidden />
      {unread > 0 && (
        <span className="absolute end-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-status-needs-revision px-1 text-[10px] font-semibold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}
