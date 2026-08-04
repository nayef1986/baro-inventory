'use client';

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type QueueItemStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

export interface QueuedCapture {
  localId: string;
  assignmentId: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  capturedAt: string; // device clock at the moment of capture — informational only
  gpsLat?: number;
  gpsLng?: number;
  queuedAt: string; // when it entered the local queue (Section 7.3 offline_queued)
  status: QueueItemStatus;
  attempts: number;
  lastError?: string;
  tokenId?: string; // filled in once we can reach the server
  serverPhotoId?: string; // filled in once upload succeeds
}

interface AlbarooDB extends DBSchema {
  captures: {
    key: string;
    value: QueuedCapture;
    indexes: { 'by-status': QueueItemStatus; 'by-assignment': string };
  };
}

let dbPromise: Promise<IDBPDatabase<AlbarooDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<AlbarooDB>('albaroo-offline-queue', 1, {
      upgrade(db) {
        const store = db.createObjectStore('captures', { keyPath: 'localId' });
        store.createIndex('by-status', 'status');
        store.createIndex('by-assignment', 'assignmentId');
      }
    });
  }
  return dbPromise;
}

export async function enqueueCapture(item: QueuedCapture) {
  const db = await getDb();
  await db.put('captures', item);
}

export async function updateCapture(localId: string, patch: Partial<QueuedCapture>) {
  const db = await getDb();
  const existing = await db.get('captures', localId);
  if (!existing) return;
  await db.put('captures', { ...existing, ...patch });
}

export async function listCapturesForAssignment(assignmentId: string) {
  const db = await getDb();
  return db.getAllFromIndex('captures', 'by-assignment', assignmentId);
}

export async function listPendingCaptures() {
  const db = await getDb();
  const pending = await db.getAllFromIndex('captures', 'by-status', 'pending');
  const failed = await db.getAllFromIndex('captures', 'by-status', 'failed');
  return [...pending, ...failed];
}

export async function removeCapture(localId: string) {
  const db = await getDb();
  await db.delete('captures', localId);
}
