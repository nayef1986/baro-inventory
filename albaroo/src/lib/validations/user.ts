import { z } from 'zod';

// Section 9.1: Admin-issued username/password is the baseline (field staff may not
// have work email). We use a synthetic "<username>@<company-slug>.albaroo.local"
// address internally so Supabase Auth (which is email/password-based) still works,
// while the Admin-facing UI only ever shows "username" and "password".
export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,32}$/, 'Username must be 3-32 characters: letters, numbers, dots, dashes'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullNameAr: z.string().trim().min(1),
  fullNameEn: z.string().trim().optional(),
  role: z.enum(['admin', 'supervisor', 'merchandiser']),
  phone: z.string().trim().optional(),
  locale: z.enum(['ar', 'en', 'ur', 'hi']).default('ar'),
  branchIds: z.array(z.string().uuid()).default([])
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserBranchesSchema = z.object({
  userId: z.string().uuid(),
  branchIds: z.array(z.string().uuid())
});

export const deactivateUserSchema = z.object({
  userId: z.string().uuid()
});
