import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { UsersManager } from '@/components/admin/UsersManager';

export default async function UsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const profile = await getCurrentProfile(locale);
  if (profile.role !== 'admin') redirect(`/${locale}`);

  const supabase = await createClient();
  const [{ data: users }, { data: branches }, { data: userBranches }] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('branches').select('id, name_ar, name_en, code').eq('is_active', true).order('code'),
    supabase.from('user_branches').select('user_id, branch_id')
  ]);

  return (
    <UsersManager
      locale={locale}
      initialUsers={users ?? []}
      branches={branches ?? []}
      userBranches={userBranches ?? []}
    />
  );
}
