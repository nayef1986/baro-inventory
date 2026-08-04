'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { submitAssignmentSchema, reviewDecisionSchema } from '@/lib/validations/submission';

export async function submitAssignmentAction(input: unknown): Promise<{ error: string } | { submissionId: string }> {
  const parsed = submitAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    const message: string = parsed.error.flatten().formErrors.join(', ') || 'Invalid submission';
    return { error: message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('submit_assignment', {
    p_assignment_id: parsed.data.assignmentId,
    p_notes: parsed.data.notes ?? null,
    p_photo_ids: parsed.data.photoIds
  });

  if (error) return { error: error.message };

  revalidatePath('/[locale]/tasks', 'page');
  return { submissionId: data as string };
}

export async function reviewSubmissionAction(input: unknown): Promise<{ error: string } | { ok: true }> {
  const parsed = reviewDecisionSchema.safeParse(input);
  if (!parsed.success) {
    const message: string = parsed.error.flatten().formErrors.join(', ') || 'Invalid review decision';
    return { error: message };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('review_submission', {
    p_submission_id: parsed.data.submissionId,
    p_decision: parsed.data.decision,
    p_comment: parsed.data.comment ?? null
  });

  if (error) return { error: error.message };

  revalidatePath('/[locale]/review', 'page');
  return { ok: true };
}
