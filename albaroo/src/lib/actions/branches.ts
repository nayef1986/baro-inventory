'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { branchSchema } from '@/lib/validations/branch';

export async function createBranchAction(input: unknown) {
  const parsed = branchSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().formErrors.join(', ') || 'Invalid branch' };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized' };

  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
  if (!profile) return { error: 'unauthorized' };

  const { error } = await supabase.from('branches').insert({
    company_id: profile.company_id,
    name_ar: parsed.data.nameAr,
    name_en: parsed.data.nameEn,
    city: parsed.data.city,
    code: parsed.data.code,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude
  });
  if (error) return { error: error.message };

  revalidatePath('/[locale]/branches', 'page');
  return { ok: true };
}

export async function updateBranchAction(id: string, input: unknown) {
  const parsed = branchSchema.partial().safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().formErrors.join(', ') || 'Invalid branch' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('branches')
    .update({
      name_ar: parsed.data.nameAr,
      name_en: parsed.data.nameEn,
      city: parsed.data.city,
      code: parsed.data.code,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude
    })
    .eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/[locale]/branches', 'page');
  return { ok: true };
}

// Section 11: a single "Delete branch" action; the system — not the Admin — decides
// hard vs soft delete based on whether the branch has assignment history.
export async function deleteBranchAction(id: string) {
  const supabase = await createClient();

  const { count } = await supabase.from('task_assignments').select('id', { count: 'exact', head: true }).eq('branch_id', id);

  if (!count) {
    const { error } = await supabase.from('branches').delete().eq('id', id);
    if (error) return { error: error.message };
    revalidatePath('/[locale]/branches', 'page');
    return { ok: true, mode: 'hard' as const };
  }

  const { error } = await supabase.from('branches').update({ is_active: false }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/[locale]/branches', 'page');
  return { ok: true, mode: 'soft' as const };
}

export async function reactivateBranchAction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('branches').update({ is_active: true }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/[locale]/branches', 'page');
  return { ok: true };
}
