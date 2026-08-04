'use client';

import { createClient } from '@/lib/supabase/client';
import { listPendingCaptures, removeCapture, updateCapture, type QueuedCapture } from './db';

const QUEUE_CHANGED_EVENT = 'albaroo:queue-changed';
const MAX_ATTEMPTS = 8;

export function onQueueChanged(cb: () => void) {
  window.addEventListener(QUEUE_CHANGED_EVENT, cb);
  return () => window.removeEventListener(QUEUE_CHANGED_EVENT, cb);
}

function notifyQueueChanged() {
  window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
}

let syncing = false;

/**
 * Section 7.3 / 8.1: uploads everything queued locally, requesting a server capture
 * token first if the item doesn't have one yet (true offline capture — the device
 * never reached the server at capture time). queued_at is preserved from the moment
 * of local capture, distinct from the server's uploaded_at, so a dispute can always
 * be traced to "captured at X, reached the server at Y".
 */
export async function syncOfflineQueue() {
  if (syncing || typeof navigator !== 'undefined' && !navigator.onLine) return;
  syncing = true;
  try {
    const items = await listPendingCaptures();
    for (const item of items) {
      await syncOne(item);
    }
  } finally {
    syncing = false;
    notifyQueueChanged();
  }
}

async function syncOne(item: QueuedCapture) {
  const supabase = createClient();
  await updateCapture(item.localId, { status: 'uploading' });
  notifyQueueChanged();

  try {
    let tokenId = item.tokenId;
    if (!tokenId) {
      const { data, error } = await supabase.rpc('issue_capture_token', {
        p_assignment_id: item.assignmentId,
        p_offline: true
      });
      if (error) throw error;
      tokenId = data?.[0]?.token_id;
      if (!tokenId) throw new Error('no token returned');
      await updateCapture(item.localId, { tokenId });
    }

    const form = new FormData();
    form.append('file', item.blob, `capture.${item.mimeType.split('/')[1] ?? 'webp'}`);
    form.append('tokenId', tokenId);
    form.append('captureMode', 'offline_queued');
    form.append('capturedAt', item.capturedAt);
    form.append('queuedAt', item.queuedAt);
    if (item.gpsLat !== undefined) form.append('gpsLat', String(item.gpsLat));
    if (item.gpsLng !== undefined) form.append('gpsLng', String(item.gpsLng));

    const res = await fetch('/api/photos/upload', { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `upload failed: ${res.status}`);
    }
    const { photoId } = await res.json();

    await updateCapture(item.localId, { status: 'uploaded', serverPhotoId: photoId });
  } catch (err) {
    const attempts = item.attempts + 1;
    await updateCapture(item.localId, {
      status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
      attempts,
      lastError: err instanceof Error ? err.message : String(err)
    });
  }
}

export async function retryCapture(localId: string) {
  await updateCapture(localId, { status: 'pending', attempts: 0, lastError: undefined });
  await syncOfflineQueue();
}

export async function discardCapture(localId: string) {
  await removeCapture(localId);
  notifyQueueChanged();
}

let listenersAttached = false;
export function attachAutoSyncListeners() {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;
  window.addEventListener('online', () => void syncOfflineQueue());
  // Weak mall connectivity: poll periodically too, not just on the 'online' event,
  // since flaky connections don't always fire a clean transition.
  setInterval(() => void syncOfflineQueue(), 30_000);
  void syncOfflineQueue();
}
