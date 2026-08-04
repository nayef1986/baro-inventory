'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { extendDueDateSchema, reopenAssignmentSchema, overturnApprovalSchema } from '@/lib/validations/task';

type ActionResult = { error: string } | { ok: true };

export async function reopenAssignmentAction(input: unknown): Promise<ActionResult> {
  const parsed = reopenAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    const message: string = parsed.error.flatten().formErrors.join(', ') || 'Invalid input';
    return { error: message };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_reopen_assignment', {
    p_assignment_id: parsed.data.assignmentId,
    p_reason: parsed.data.reason
  });
  if (error) return { error: error.message };
  revalidatePath('/[locale]/dashboard', 'page');
  return { ok: true };
}

export async function extendDueDateAction(input: unknown): Promise<ActionResult> {
  const parsed = extendDueDateSchema.safeParse(input);
  if (!parsed.success) {
    const message: string = parsed.error.flatten().formErrors.join(', ') || 'Invalid input';
    return { error: message };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_extend_due_date', {
    p_assignment_id: parsed.data.assignmentId,
    p_new_due_at: parsed.data.newDueAt.toISOString(),
    p_reason: parsed.data.reason
  });
  if (error) return { error: error.message };
  revalidatePath('/[locale]/dashboard', 'page');
  return { ok: true };
}

export async function overturnApprovalAction(input: unknown): Promise<ActionResult> {
  const parsed = overturnApprovalSchema.safeParse(input);
  if (!parsed.success) {
    const message: string = parsed.error.flatten().formErrors.join(', ') || 'Invalid input';
    return { error: message };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_overturn_approval', {
    p_assignment_id: parsed.data.assignmentId,
    p_reason: parsed.data.reason
  });
  if (error) return { error: error.message };
  revalidatePath('/[locale]/dashboard', 'page');
  return { ok: true };
}
