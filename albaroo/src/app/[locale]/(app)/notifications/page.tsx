import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { NotificationList } from '@/components/NotificationList';

export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const profile = await getCurrentProfile(locale);
  const supabase = await createClient();

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', profile.id)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  return <NotificationList locale={locale} role={profile.role} notifications={notifications ?? []} />;
}
