import { z } from 'zod';

// Section 3.3: merchandiser_id is NEVER accepted from the client — it is always
// derived server-side from the authenticated session (see submit_assignment() RPC,
// which reads auth.uid() directly and ignores anything the client sends).
export const submitAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  notes: z.string().max(2000).optional(),
  photoIds: z.array(z.string().uuid()).min(1)
});

export const reviewDecisionSchema = z
  .object({
    submissionId: z.string().uuid(),
    decision: z.enum(['approved', 'rejected']),
    comment: z.string().trim().optional()
  })
  .refine((data) => data.decision !== 'rejected' || (data.comment && data.comment.length >= 10), {
    message: 'A rejection requires a comment of at least 10 characters',
    path: ['comment']
  });

export const captureTokenRequestSchema = z.object({
  assignmentId: z.string().uuid(),
  offline: z.boolean().default(false)
});

// What the server-side upload route accepts alongside the multipart file. Everything
// authenticity-related (hash, EXIF, dimensions) is recomputed/verified server-side —
// the client's own claims about e.g. exifStripped are informational only until the
// route confirms them against the actual bytes.
export const attachPhotoMetaSchema = z.object({
  tokenId: z.string().uuid(),
  captureMode: z.enum(['in_app', 'offline_queued', 'gallery']),
  deviceReportedAt: z.coerce.date().optional(),
  capturedAt: z.coerce.date().optional(),
  gpsLat: z.number().min(-90).max(90).optional(),
  gpsLng: z.number().min(-180).max(180).optional(),
  queuedAt: z.coerce.date().optional()
});
