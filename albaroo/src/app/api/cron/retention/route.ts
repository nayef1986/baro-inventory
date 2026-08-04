import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Section 7.8: pg_cron (pure SQL) cannot delete Storage bytes, so the nightly
// retention job runs here instead, invoked by Vercel Cron (see vercel.json). The
// retention clock starts at approval, not upload — photos_pending_retention_deletion()
// already encodes that. Thumbnails are never touched; only the full-resolution
// original is removed once the settings.photo_retention_days window has passed.
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: candidates, error } = await supabase.rpc('photos_pending_retention_deletion');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let bytesReclaimed = 0;
  const deletedIds: string[] = [];

  for (const photo of candidates ?? []) {
    const { error: removeErr } = await supabase.storage.from('submission-photos').remove([photo.storage_path]);
    if (!removeErr) {
      bytesReclaimed += photo.file_size ?? 0;
      deletedIds.push(photo.photo_id);
    }
  }

  if (deletedIds.length > 0) {
    await supabase.rpc('mark_photos_retention_deleted', { p_photo_ids: deletedIds, p_bytes_reclaimed: bytesReclaimed });
  }

  const { data: orphans } = await supabase.rpc('orphaned_unfinalized_photos', { p_older_than_hours: 24 });
  const orphanIds: string[] = [];
  for (const photo of orphans ?? []) {
    const paths = [photo.storage_path, photo.thumbnail_path].filter(Boolean) as string[];
    const { error: removeErr } = await supabase.storage.from('submission-photos').remove(paths);
    if (!removeErr) orphanIds.push(photo.photo_id);
  }
  if (orphanIds.length > 0) {
    await supabase.rpc('delete_orphaned_photos', { p_photo_ids: orphanIds });
  }

  return NextResponse.json({ deleted: deletedIds.length, bytesReclaimed, orphansRemoved: orphanIds.length });
}
