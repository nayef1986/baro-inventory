'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createTaskSchema } from '@/lib/validations/task';

export async function createTaskAction(input: unknown): Promise<{ error: string } | { ok: true; taskId: string }> {
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) {
    const message: string = parsed.error.issues.map((i) => i.message).join(', ') || 'Invalid task';
    return { error: message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_task_with_assignments', {
    p_title: parsed.data.title,
    p_description: parsed.data.description ?? null,
    p_instructions: parsed.data.instructions ?? null,
    p_source_locale: parsed.data.sourceLocale,
    p_priority: parsed.data.priority,
    p_required_photo_count: parsed.data.requiredPhotoCount,
    p_due_at: parsed.data.dueAt.toISOString(),
    p_grace_hours: parsed.data.graceHours,
    p_branch_ids: parsed.data.branchIds,
    p_reference_image_path: parsed.data.referenceImagePath ?? null
  });

  if (error) return { error: error.message };

  revalidatePath('/[locale]/dashboard', 'page');
  return { ok: true, taskId: data as string };
}
