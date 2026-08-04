import { z } from 'zod';

export const localeCode = z.enum(['ar', 'en', 'ur', 'hi']);

// Section 8B.3: multilingual fields keyed by locale. The source locale's key is required.
export const localizedText = z.record(localeCode, z.string().min(1)).refine((v) => Object.keys(v).length > 0, {
  message: 'At least one language is required'
});

export const taskPriority = z.enum(['low', 'normal', 'high', 'critical']);

export const createTaskSchema = z
  .object({
    title: localizedText,
    description: localizedText.optional(),
    instructions: localizedText.optional(),
    sourceLocale: localeCode,
    priority: taskPriority.default('normal'),
    requiredPhotoCount: z.number().int().min(1).max(20),
    dueAt: z.coerce.date(),
    graceHours: z.number().int().min(0).max(168).default(0),
    branchIds: z.array(z.string().uuid()).min(1, 'At least one branch must be selected'),
    referenceImagePath: z.string().optional()
  })
  .refine((data) => data.title[data.sourceLocale] !== undefined, {
    message: 'The title must be provided in the source language',
    path: ['title']
  })
  .refine((data) => data.dueAt.getTime() > Date.now(), {
    message: 'Due date must be in the future',
    path: ['dueAt']
  });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const extendDueDateSchema = z.object({
  assignmentId: z.string().uuid(),
  newDueAt: z.coerce.date(),
  reason: z.string().trim().min(5, 'A reason of at least 5 characters is required')
});

export const reopenAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  reason: z.string().trim().min(5, 'A reason of at least 5 characters is required')
});

export const overturnApprovalSchema = z.object({
  assignmentId: z.string().uuid(),
  reason: z.string().trim().min(5, 'A reason of at least 5 characters is required')
});
