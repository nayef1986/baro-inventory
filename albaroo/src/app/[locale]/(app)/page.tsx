import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/current-user';

export default async function AppIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const profile = await getCurrentProfile(locale);

  const destination = { merchandiser: 'tasks', supervisor: 'review', admin: 'dashboard' }[profile.role];
  redirect(`/${locale}/${destination}`);
}
