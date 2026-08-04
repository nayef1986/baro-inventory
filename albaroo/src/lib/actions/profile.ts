'use server';

import { createClient } from '@/lib/supabase/server';
import type { Locale } from '@/types/database';

// Section 8B.1: language is a per-user setting, not tied to device language — a shared
// phone must not change a user's language when someone else signs in on it.
export async function updateLocaleAction(locale: Locale) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('profiles').update({ locale }).eq('id', user.id);
}
