import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { BranchesManager } from '@/components/admin/BranchesManager';

export default async function BranchesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const profile = await getCurrentProfile(locale);
  if (profile.role !== 'admin') redirect(`/${locale}`);

  const supabase = await createClient();
  const { data: branches } = await supabase.from('branches').select('*').order('code');

  return <BranchesManager locale={locale} initialBranches={branches ?? []} />;
}
