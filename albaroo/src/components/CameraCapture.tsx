'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, Camera } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { compressToWebP } from '@/lib/offline-queue/image-processing';
import { enqueueCapture } from '@/lib/offline-queue/db';
import { syncOfflineQueue } from '@/lib/offline-queue/sync';

export interface CapturedPhotoResult {
  localId: string;
  previewUrl: string;
  status: 'uploading' | 'uploaded' | 'queued' | 'failed';
  photoId?: string;
}

// Section 7.3 / 8.1: the submission screen opens the camera directly; gallery
// selection is disabled by default (only re-enabled per-user by an Admin — see
// SubmissionScreen). This component never accepts a File from disk.
export function CameraCapture({
  assignmentId,
  onCaptured,
  onClose
}: {
  assignmentId: string;
  onCaptured: (result: CapturedPhotoResult) => void;
  onClose: () => void;
}) {
  const t = useTranslations('tasks');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setError('camera_unavailable'));

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const capture = useCallback(async () => {
    if (!videoRef.current || busy) return;
    setBusy(true);
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0);

    const rawBlob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('capture failed'))), 'image/png')
    );
    const capturedAt = new Date().toISOString();
    const { blob, width, height } = await compressToWebP(rawBlob);
    const previewUrl = URL.createObjectURL(blob);
    const localId = crypto.randomUUID();

    onCaptured({ localId, previewUrl, status: 'uploading' });

    const supabase = createClient();
    try {
      if (!navigator.onLine) throw new Error('offline');
      const { data: tokenRows, error: tokenErr } = await supabase.rpc('issue_capture_token', {
        p_assignment_id: assignmentId,
        p_offline: false
      });
      if (tokenErr) throw tokenErr;
      const tokenId = tokenRows?.[0]?.token_id as string | undefined;
      if (!tokenId) throw new Error('no token');

      const form = new FormData();
      form.append('file', blob, 'capture.webp');
      form.append('tokenId', tokenId);
      form.append('captureMode', 'in_app');
      form.append('capturedAt', capturedAt);

      const res = await fetch('/api/photos/upload', { method: 'POST', body: form });
      if (!res.ok) throw new Error('upload failed');
      const { photoId } = await res.json();
      onCaptured({ localId, previewUrl, status: 'uploaded', photoId });
    } catch {
      // Weak mall connectivity (Section 8.1): fall back to the offline queue rather
      // than losing the photo. It uploads automatically once connectivity returns.
      await enqueueCapture({
        localId,
        assignmentId,
        blob,
        mimeType: blob.type,
        width,
        height,
        capturedAt,
        queuedAt: capturedAt,
        status: 'pending',
        attempts: 0
      });
      onCaptured({ localId, previewUrl, status: 'queued' });
      void syncOfflineQueue();
    } finally {
      setBusy(false);
    }
  }, [assignmentId, busy, onCaptured]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4">
        <button onClick={onClose} className="flex min-h-[44px] min-w-[44px] items-center justify-center text-white" aria-label={t('close' as any) || 'Close'}>
          <X size={24} />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <p className="px-8 text-center text-white">{error}</p>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        )}
      </div>

      <div className="flex items-center justify-center p-8">
        <button
          onClick={capture}
          disabled={busy || !!error}
          aria-label={t('openCamera')}
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 transition-transform active:scale-90 disabled:opacity-50"
        >
          <Camera size={28} className="text-white" />
        </button>
      </div>
    </div>
  );
}
