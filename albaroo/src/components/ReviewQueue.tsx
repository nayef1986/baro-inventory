'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { SignedImage } from '@/components/SignedImage';
import { reviewSubmissionAction } from '@/lib/actions/submissions';
import { formatDateTime, hoursSince } from '@/lib/dates';
import type { CaptureMode, LocalizedText, Locale } from '@/types/database';

export interface ReviewItem {
  submissionId: string;
  notes: string | null;
  submittedAt: string;
  attemptNumber: number;
  isLate: boolean;
  authenticityFlags: string[];
  merchandiserName: string;
  branchName: string;
  taskTitle: LocalizedText;
  photos: { id: string; storage_path: string; thumbnail_path: string | null; capture_mode: CaptureMode; authenticity_flags: string[] }[];
}

export function ReviewQueue({ locale, items }: { locale: string; items: ReviewItem[] }) {
  const t = useTranslations('review');
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [list, setList] = useState(items);

  const oldest = list[0];
  const oldestHours = oldest ? Math.floor(hoursSince(oldest.submittedAt)) : null;

  function removeFromQueue(submissionId: string) {
    setList((prev) => prev.filter((i) => i.submissionId !== submissionId));
    setOpenId(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold text-ink">{t('queueTitle')}</h1>

      {oldest && oldestHours !== null && (
        <div className="glass-chrome rounded-control border px-3 py-2 text-sm text-ink">
          {t('oldestPending', { hours: oldestHours })}
        </div>
      )}

      {list.length === 0 && <p className="py-12 text-center text-sm text-slate">{t('empty')}</p>}

      {list.map((item) => {
        const title = item.taskTitle[locale as Locale] ?? Object.values(item.taskTitle)[0] ?? '';
        const flagged = item.authenticityFlags.length > 0 || item.photos.some((p) => p.authenticity_flags.length > 0);
        return (
          <button
            key={item.submissionId}
            onClick={() => setOpenId(item.submissionId)}
            className="block w-full rounded-card bg-card p-4 text-start shadow-soft transition-transform active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-medium text-ink">{title}</h3>
                <p className="text-sm text-slate">
                  {item.branchName} · {item.merchandiserName}
                </p>
              </div>
              {flagged && (
                <span className="flex items-center gap-1 rounded-control bg-status-under-review/15 px-2 py-1 text-xs text-status-under-review">
                  <AlertTriangle size={12} /> {t('flagged')}
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-slate">
              {t('attempt', { n: item.attemptNumber })} · {formatDateTime(item.submittedAt, locale)}
              {item.isLate && <span className="text-status-needs-revision"> · {t('lateSubmission')}</span>}
            </p>
          </button>
        );
      })}

      {openId && (
        <ReviewDetail
          locale={locale}
          item={list.find((i) => i.submissionId === openId)!}
          onClose={() => setOpenId(null)}
          onDecided={() => removeFromQueue(openId)}
        />
      )}
    </div>
  );
}

function ReviewDetail({
  locale,
  item,
  onClose,
  onDecided
}: {
  locale: string;
  item: ReviewItem;
  onClose: () => void;
  onDecided: () => void;
}) {
  const t = useTranslations('review');
  const tc = useTranslations('common');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);

  const photo = item.photos[photoIndex];
  const title = item.taskTitle[locale as Locale] ?? Object.values(item.taskTitle)[0] ?? '';

  const commentTooShort = useMemo(() => comment.trim().length > 0 && comment.trim().length < 10, [comment]);

  async function decide(decision: 'approved' | 'rejected') {
    if (decision === 'rejected' && comment.trim().length < 10) {
      setError(t('rejectRequiresComment'));
      setShowRejectForm(true);
      return;
    }
    setPending(true);
    setError(null);
    const result = await reviewSubmissionAction({ submissionId: item.submissionId, decision, comment: comment || undefined });
    setPending(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    onDecided();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      <div className="glass-chrome safe-top flex items-center justify-between border-b p-4">
        <div>
          <h2 className="text-base font-medium text-ink">{title}</h2>
          <p className="text-xs text-slate">
            {item.branchName} · {item.merchandiserName}
          </p>
        </div>
        <button onClick={onClose} className="flex min-h-[44px] min-w-[44px] items-center justify-center" aria-label={tc('close')}>
          <X size={22} />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
        {photo && <SignedImage path={photo.storage_path} alt="" className="max-h-full max-w-full object-contain" />}
        {photo?.capture_mode !== 'in_app' && photo && (
          <span className="absolute top-3 rounded-control bg-black/60 px-2 py-1 text-xs text-white">
            {t(`captureMode.${photo.capture_mode}` as any)}
          </span>
        )}
        {item.photos.length > 1 && (
          <>
            <button
              onClick={() => setPhotoIndex((i) => Math.max(0, i - 1))}
              className="absolute start-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white"
              aria-label="Previous"
            >
              <ChevronLeft />
            </button>
            <button
              onClick={() => setPhotoIndex((i) => Math.min(item.photos.length - 1, i + 1))}
              className="absolute end-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white"
              aria-label="Next"
            >
              <ChevronRight />
            </button>
            <span className="absolute bottom-3 rounded-control bg-black/60 px-2 py-1 text-xs text-white">
              {photoIndex + 1}/{item.photos.length}
            </span>
          </>
        )}
      </div>

      {item.notes && <p className="border-t px-4 py-3 text-sm text-ink">{item.notes}</p>}

      <div className="glass-chrome safe-bottom border-t p-4">
        {error && <p className="mb-2 text-sm text-status-needs-revision">{error}</p>}
        {showRejectForm && (
          <textarea
            autoFocus
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={tc('comment')}
            rows={3}
            className="mb-2 w-full rounded-control border border-black/10 bg-card p-3 text-sm text-ink outline-none focus:ring-2 focus:ring-oud dark:border-white/10"
          />
        )}
        {commentTooShort && <p className="mb-2 text-xs text-status-needs-revision">{t('rejectRequiresComment')}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => (showRejectForm ? decide('rejected') : setShowRejectForm(true))}
            disabled={pending}
            className="min-h-[44px] flex-1 rounded-control border border-status-needs-revision text-status-needs-revision disabled:opacity-50"
          >
            {tc('reject')}
          </button>
          <button
            onClick={() => decide('approved')}
            disabled={pending || showRejectForm}
            className="min-h-[44px] flex-1 rounded-control bg-status-approved font-medium text-white disabled:opacity-50"
          >
            {tc('approve')}
          </button>
        </div>
      </div>
    </div>
  );
}
