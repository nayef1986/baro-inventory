import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { TaskForm } from '@/components/admin/TaskForm';

export default async function NewTaskPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const profile = await getCurrentProfile(locale);
  if (profile.role !== 'admin') redirect(`/${locale}`);

  const supabase = await createClient();
  const { data: branches } = await supabase.from('branches').select('id, name_ar, name_en, code').eq('is_active', true).order('code');

  return <TaskForm locale={locale} branches={branches ?? []} />;
}
