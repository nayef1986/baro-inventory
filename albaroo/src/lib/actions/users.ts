'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createUserSchema, updateUserBranchesSchema } from '@/lib/validations/user';
import { usernameToEmail } from '@/lib/auth-email';

// Section 2: "Accounts are created by the Admin only. There is no public sign-up."
// Creating an auth.users row requires the service-role Admin API, which is why this
// runs through createAdminClient() — but only after re-verifying the caller is an
// Admin using their own session, so a non-admin can never reach the privileged path.
export async function createUserAction(input: unknown) {
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().formErrors.join(', ') || 'Invalid user' };

  const session = await createClient();
  const {
    data: { user: caller }
  } = await session.auth.getUser();
  if (!caller) return { error: 'unauthorized' };

  const { data: callerProfile } = await session.from('profiles').select('role, company_id').eq('id', caller.id).single();
  if (callerProfile?.role !== 'admin') return { error: 'not permitted' };

  const admin = createAdminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: usernameToEmail(parsed.data.username),
    password: parsed.data.password,
    email_confirm: true
  });
  if (createErr || !created.user) return { error: createErr?.message ?? 'could not create account' };

  const { error: profileErr } = await admin.from('profiles').insert({
    id: created.user.id,
    company_id: callerProfile.company_id,
    full_name_ar: parsed.data.fullNameAr,
    full_name_en: parsed.data.fullNameEn ?? null,
    role: parsed.data.role,
    phone: parsed.data.phone ?? null,
    locale: parsed.data.locale
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: profileErr.message };
  }

  if (parsed.data.branchIds.length > 0) {
    await admin.from('user_branches').insert(parsed.data.branchIds.map((branchId) => ({ user_id: created.user!.id, branch_id: branchId })));
  }

  await session.rpc('write_audit_log', {
    p_actor_id: caller.id,
    p_action: 'create_user',
    p_entity_type: 'profile',
    p_entity_id: created.user.id,
    p_before: null,
    p_after: { role: parsed.data.role, username: parsed.data.username },
    p_reason: null
  });

  revalidatePath('/[locale]/users', 'page');
  return { ok: true };
}

export async function updateUserBranchesAction(input: unknown) {
  const parsed = updateUserBranchesSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().formErrors.join(', ') || 'Invalid input' };

  const supabase = await createClient();
  const { error: deleteErr } = await supabase.from('user_branches').delete().eq('user_id', parsed.data.userId);
  if (deleteErr) return { error: deleteErr.message };

  if (parsed.data.branchIds.length > 0) {
    const { error: insertErr } = await supabase
      .from('user_branches')
      .insert(parsed.data.branchIds.map((branchId) => ({ user_id: parsed.data.userId, branch_id: branchId })));
    if (insertErr) return { error: insertErr.message };
  }

  revalidatePath('/[locale]/users', 'page');
  return { ok: true };
}

export async function setUserActiveAction(userId: string, isActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', userId);
  if (error) return { error: error.message };
  revalidatePath('/[locale]/users', 'page');
  return { ok: true };
}

export async function setGalleryUploadAction(userId: string, enabled: boolean, reason: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_gallery_upload', {
    p_user_id: userId,
    p_enabled: enabled,
    p_reason: reason
  });
  if (error) return { error: error.message };
  revalidatePath('/[locale]/users', 'page');
  return { ok: true };
}
