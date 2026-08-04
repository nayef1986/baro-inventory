import { z } from 'zod';

export const branchSchema = z.object({
  nameAr: z.string().trim().min(1),
  nameEn: z.string().trim().min(1),
  city: z.string().trim().optional(),
  code: z.string().trim().regex(/^[A-Z0-9-]+$/, 'Use uppercase letters, digits and dashes only'),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional()
});

export type BranchInput = z.infer<typeof branchSchema>;
