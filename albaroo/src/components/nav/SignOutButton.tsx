'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { signOutAction } from '@/lib/actions/auth';

export function SignOutButton({ locale }: { locale: string }) {
  const router = useRouter();

  async function handleSignOut() {
    await signOutAction();
    router.replace(`/${locale}/login`);
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="flex min-h-[44px] min-w-[44px] items-center justify-center text-slate"
      aria-label="Sign out"
    >
      <LogOut size={20} strokeWidth={1.5} aria-hidden />
    </button>
  );
}
