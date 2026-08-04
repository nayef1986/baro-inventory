'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Camera, ImagePlus, Loader2, RefreshCw, Check, WifiOff } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { SignedImage } from '@/components/SignedImage';
import { CameraCapture, type CapturedPhotoResult } from '@/components/CameraCapture';
import { submitAssignmentAction } from '@/lib/actions/submissions';
import { attachAutoSyncListeners, onQueueChanged } from '@/lib/offline-queue/sync';
import { listCapturesForAssignment } from '@/lib/offline-queue/db';
import { extractExif, compressToWebP } from '@/lib/offline-queue/image-processing';
import { formatDateTime } from '@/lib/dates';
import type { AssignmentStatus, Locale, LocalizedText } from '@/types/database';

interface AssignmentDetail {
  id: string;
  status: AssignmentStatus;
  due_at: string;
  attempt_count: number;
  task: {
    id: string;
    title: LocalizedText;
    description: LocalizedText | null;
    instructions: LocalizedText | null;
    source_locale: Locale;
    required_photo_count: number;
    reference_image_path: string | null;
  };
  branch: { id: string; name_ar: string; name_en: string };
}

interface LatestSubmission {
  id: string;
  review_comment: string | null;
  review_status: string;
  attempt_number: number;
}

export function SubmissionScreen({
  locale,
  profileLocale,
  galleryUploadEnabled,
  assignment,
  latestSubmission
}: {
  locale: string;
  profileLocale: Locale;
  galleryUploadEnabled: boolean;
  assignment: AssignmentDetail;
  latestSubmission: LatestSubmission | null;
}) {
  const t = useTranslations('tasks');
  const tc = useTranslations('common');
  const router = useRouter();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photos, setPhotos] = useState<CapturedPhotoResult[]>([]);
  const [notes, setNotes] = useState('');
  const [online, setOnline] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    attachAutoSyncListeners();
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    async function refreshFromQueue() {
      const queued = await listCapturesForAssignment(assignment.id);
      setPhotos((prev) => {
        const next = [...prev];
        for (const q of queued) {
          const idx = next.findIndex((p) => p.localId === q.localId);
          const status = q.status === 'uploaded' ? 'uploaded' : q.status === 'failed' ? 'failed' : q.status === 'uploading' ? 'uploading' : 'queued';
          const entry = { localId: q.localId, previewUrl: URL.createObjectURL(q.blob), status, photoId: q.serverPhotoId } as CapturedPhotoResult;
          if (idx >= 0) next[idx] = { ...next[idx]!, status, photoId: q.serverPhotoId };
          else next.push(entry);
        }
        return next;
      });
    }
    refreshFromQueue();
    return onQueueChanged(refreshFromQueue);
  }, [assignment.id]);

  const uploadedPhotoIds = useMemo(() => photos.filter((p) => p.status === 'uploaded' && p.photoId).map((p) => p.photoId!), [photos]);
  const requiredCount = assignment.task.required_photo_count;
  const canSubmit = uploadedPhotoIds.length >= requiredCount && !submitting && ['not_started', 'needs_revision'].includes(assignment.status);

  const title = assignment.task.title[locale as Locale] ?? assignment.task.title[assignment.task.source_locale];
  const missingTitleTranslation = !assignment.task.title[locale as Locale];
  const instructions = assignment.task.instructions?.[locale as Locale] ?? assignment.task.instructions?.[assignment.task.source_locale];
  const missingInstructionsTranslation = assignment.task.instructions && !assignment.task.instructions[locale as Locale];

  async function handleGalleryFile(file: File) {
    const localId = crypto.randomUUID();
    const exif = await extractExif(file);
    const { blob, width, height } = await compressToWebP(file);
    const previewUrl = URL.createObjectURL(blob);
    setPhotos((prev) => [...prev, { localId, previewUrl, status: 'uploading' }]);

    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: tokenRows, error: tokenErr } = await supabase.rpc('issue_capture_token', {
        p_assignment_id: assignment.id,
        p_offline: false
      });
      if (tokenErr) throw tokenErr;
      const tokenId = tokenRows?.[0]?.token_id as string;

      const form = new FormData();
      form.append('file', blob, 'gallery.webp');
      form.append('tokenId', tokenId);
      form.append('captureMode', 'gallery');
      if (exif.dateTimeOriginal) form.append('capturedAt', exif.dateTimeOriginal.toISOString());

      const res = await fetch('/api/photos/upload', { method: 'POST', body: form });
      if (!res.ok) throw new Error('upload failed');
      const { photoId } = await res.json();
      setPhotos((prev) => prev.map((p) => (p.localId === localId ? { ...p, status: 'uploaded', photoId } : p)));
    } catch {
      setPhotos((prev) => prev.map((p) => (p.localId === localId ? { ...p, status: 'failed' } : p)));
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    const result = await submitAssignmentAction({ assignmentId: assignment.id, notes: notes || undefined, photoIds: uploadedPhotoIds });
    setSubmitting(false);
    if ('error' in result) {
      setSubmitError(result.error.includes('conflict') ? t('conflict') : result.error);
      return;
    }
    router.push(`/${locale}/tasks`);
    router.refresh();
  }

  return (
    <div className="space-y-4 pb-24">
      {!online && (
        <div className="flex items-center gap-2 rounded-control bg-status-under-review/10 px-3 py-2 text-sm text-status-under-review">
          <WifiOff size={16} /> {t('offlineBanner')}
        </div>
      )}

      <div>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          <StatusBadge status={assignment.status} />
        </div>
        <p className="text-sm text-slate">{locale === 'ar' ? assignment.branch.name_ar : assignment.branch.name_en}</p>
        <p className="text-xs text-slate">
          {tc('deadline')}: {formatDateTime(assignment.due_at, locale)}
        </p>
        {missingTitleTranslation && <p className="mt-1 text-xs text-status-needs-revision">{tc('notAvailableInYourLanguage')}</p>}
      </div>

      {instructions && (
        <div className="rounded-card bg-card p-4 shadow-soft">
          <h2 className="mb-1 text-sm font-medium text-slate">{t('instructions')}</h2>
          <p className="whitespace-pre-wrap text-sm text-ink">{instructions}</p>
          {missingInstructionsTranslation && <p className="mt-1 text-xs text-status-needs-revision">{tc('notAvailableInYourLanguage')}</p>}
        </div>
      )}

      {assignment.task.reference_image_path && (
        <div>
          <h2 className="mb-1 text-sm font-medium text-slate">{t('referenceImage')}</h2>
          <SignedImage path={assignment.task.reference_image_path} alt="" className="h-40 w-full rounded-card object-cover" />
        </div>
      )}

      {latestSubmission?.review_status === 'rejected' && latestSubmission.review_comment && (
        <div className="rounded-card border border-status-needs-revision/30 bg-status-needs-revision/5 p-4">
          <p className="text-sm font-medium text-status-needs-revision">{t('attempt', { n: latestSubmission.attempt_number })}</p>
          <p className="mt-1 text-sm text-ink">{latestSubmission.review_comment}</p>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate">
          {tc('photos')} — {t('photoProgress', { done: uploadedPhotoIds.length, required: requiredCount })}
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.localId} className="relative aspect-square overflow-hidden rounded-control bg-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/50 py-1 text-[10px] text-white">
                {p.status === 'uploading' && <Loader2 size={12} className="animate-spin" />}
                {p.status === 'uploaded' && <Check size={12} />}
                {p.status === 'queued' && <RefreshCw size={12} />}
                {p.status === 'failed' && <RefreshCw size={12} className="text-status-needs-revision" />}
                <span>{t(p.status === 'uploading' ? 'uploading' : p.status === 'uploaded' ? 'uploaded' : p.status === 'queued' ? 'queued' : 'uploadFailed')}</span>
              </div>
            </div>
          ))}
          {assignment.status !== 'approved' && (
            <button
              onClick={() => setCameraOpen(true)}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-control border-2 border-dashed border-oud/40 text-oud"
            >
              <Camera size={24} strokeWidth={1.5} />
              <span className="text-xs">{t('openCamera')}</span>
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate">{t('cameraOnlyNotice')}</p>

        {galleryUploadEnabled && (
          <div className="mt-2">
            <p className="text-xs text-status-under-review">{t('galleryEnabledNotice')}</p>
            <button
              onClick={() => galleryInputRef.current?.click()}
              className="mt-1 flex min-h-[44px] items-center gap-2 rounded-control border border-black/10 px-3 text-sm text-ink dark:border-white/10"
            >
              <ImagePlus size={18} /> {t('attachPhoto')}
            </button>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleGalleryFile(file);
                e.target.value = '';
              }}
            />
          </div>
        )}
      </div>

      {['not_started', 'needs_revision'].includes(assignment.status) && (
        <div>
          <label htmlFor="notes" className="mb-1 block text-sm font-medium text-slate">
            {tc('notes')}
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('notesPlaceholder')}
            rows={3}
            className="w-full rounded-control border border-black/10 bg-card p-3 text-sm text-ink outline-none focus:ring-2 focus:ring-oud dark:border-white/10"
          />
        </div>
      )}

      {cameraOpen && (
        <CameraCapture
          assignmentId={assignment.id}
          onClose={() => setCameraOpen(false)}
          onCaptured={(result) => {
            setPhotos((prev) => {
              const idx = prev.findIndex((p) => p.localId === result.localId);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = result;
                return next;
              }
              return [...prev, result];
            });
          }}
        />
      )}

      {['not_started', 'needs_revision'].includes(assignment.status) && (
        <div className="glass-chrome safe-bottom fixed inset-x-0 bottom-16 z-30 border-t p-4 md:bottom-0 md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          {submitError && <p className="mb-2 text-sm text-status-needs-revision">{submitError}</p>}
          {uploadedPhotoIds.length < requiredCount && (
            <p className="mb-2 text-xs text-slate">{t('needMorePhotos', { count: requiredCount - uploadedPhotoIds.length })}</p>
          )}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="min-h-[44px] w-full rounded-control bg-oud font-medium text-white transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            {submitting ? tc('loading') : t('submitTask')}
          </button>
        </div>
      )}
    </div>
  );
}
