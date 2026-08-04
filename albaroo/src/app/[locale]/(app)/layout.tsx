import { getCurrentProfile } from '@/lib/current-user';
import { BottomTabBar } from '@/components/nav/BottomTabBar';
import { NotificationBell } from '@/components/nav/NotificationBell';
import { LanguageSwitcher } from '@/components/nav/LanguageSwitcher';
import { SignOutButton } from '@/components/nav/SignOutButton';

export default async function AppLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const profile = await getCurrentProfile(locale);

  return (
    <div className="min-h-dvh bg-surface pb-20 md:pb-0">
      <header className="glass-chrome safe-top sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3">
        <span className="text-lg font-semibold text-oud">ALBAROO</span>
        <div className="flex items-center gap-2">
          <LanguageSwitcher locale={locale} />
          <NotificationBell locale={locale} />
          <SignOutButton locale={locale} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>

      <BottomTabBar locale={locale} role={profile.role} />
    </div>
  );
}
