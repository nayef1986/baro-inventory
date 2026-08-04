'use server';

import { createClient } from '@/lib/supabase/server';
import { usernameToEmail } from '@/lib/auth-email';

export async function signInAction(username: string, password: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password
  });
  if (error) return { error: 'invalid_credentials' as const };

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { error: 'invalid_credentials' as const };

  const { data: profile } = await supabase.from('profiles').select('is_active, role, locale').eq('id', user.id).single();
  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return { error: 'deactivated' as const };
  }

  return { ok: true as const, role: profile.role, locale: profile.locale };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
