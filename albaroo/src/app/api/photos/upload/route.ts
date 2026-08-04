import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { attachPhotoMetaSchema } from '@/lib/validations/submission';

const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;
const THUMBNAIL_MAX_DIMENSION = 400;

// Section 7.3: this route is the server-authoritative timestamp boundary. The file
// arrives here from either the live in-app capture flow or the offline queue's sync
// step; either way, server_captured_at is stamped by attach_capture_photo() the
// instant this route calls it — never trusted from the client.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const parsed = attachPhotoMetaSchema.safeParse({
    tokenId: form.get('tokenId'),
    captureMode: form.get('captureMode'),
    deviceReportedAt: form.get('capturedAt') || undefined,
    capturedAt: form.get('capturedAt') || undefined,
    gpsLat: form.get('gpsLat') ? Number(form.get('gpsLat')) : undefined,
    gpsLng: form.get('gpsLng') ? Number(form.get('gpsLng')) : undefined,
    queuedAt: form.get('queuedAt') || undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const meta = parsed.data;

  const { data: token, error: tokenErr } = await supabase
    .from('capture_tokens')
    .select('id, assignment_id, merchandiser_id')
    .eq('id', meta.tokenId)
    .single();
  if (tokenErr || !token) {
    return NextResponse.json({ error: 'invalid capture token' }, { status: 400 });
  }

  const { data: assignment } = await supabase
    .from('task_assignments')
    .select('id, branch_id')
    .eq('id', token.assignment_id)
    .single();
  if (!assignment) return NextResponse.json({ error: 'assignment not found' }, { status: 404 });

  const { data: branch } = await supabase.from('branches').select('id, company_id').eq('id', assignment.branch_id).single();
  if (!branch) return NextResponse.json({ error: 'branch not found' }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const image = sharp(buffer, { failOn: 'none' });
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const exifStripped = !metadata.exif;
  let exifMake: string | null = null;
  let exifModel: string | null = null;
  if (metadata.exif) {
    try {
      const exifText = metadata.exif.toString('latin1');
      exifMake = /Make\0([^\0]+)/.exec(exifText)?.[1]?.trim() ?? null;
      exifModel = /Model\0([^\0]+)/.exec(exifText)?.[1]?.trim() ?? null;
    } catch {
      // best-effort only — EXIF is corroborating evidence (Section 7.1)
    }
  }

  // Section 7.6 process integrity rule #1: reject below 800x600 before compression.
  // The client already compresses to <=1600px long edge, so this only fires for a
  // genuinely undersized source photo (e.g. an old low-res gallery upload).
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return NextResponse.json({ error: `photo resolution ${width}x${height} is below the minimum ${MIN_WIDTH}x${MIN_HEIGHT}` }, { status: 400 });
  }

  const webpBuffer = await image.webp({ quality: 82 }).toBuffer();
  const fileHash = createHash('sha256').update(webpBuffer).digest('hex');
  const thumbnailBuffer = await sharp(buffer)
    .resize({ width: THUMBNAIL_MAX_DIMENSION, height: THUMBNAIL_MAX_DIMENSION, fit: 'inside' })
    .webp({ quality: 70 })
    .toBuffer();

  const photoUuid = randomUUID();
  const basePath = `${branch.company_id}/${branch.id}/${assignment.id}/pending`;
  const storagePath = `${basePath}/${photoUuid}.webp`;
  const thumbnailPath = `${basePath}/${photoUuid}-thumb.webp`;

  const { error: uploadErr } = await supabase.storage.from('submission-photos').upload(storagePath, webpBuffer, {
    contentType: 'image/webp',
    upsert: false
  });
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  // Section 7.8: thumbnail is generated at upload time, before any retention job runs,
  // and is kept forever even after the original is deleted.
  const { error: thumbErr } = await supabase.storage
    .from('submission-photos')
    .upload(thumbnailPath, thumbnailBuffer, { contentType: 'image/webp', upsert: false });
  if (thumbErr) return NextResponse.json({ error: thumbErr.message }, { status: 500 });

  const { data: photoId, error: attachErr } = await supabase.rpc('attach_capture_photo', {
    p_token_id: meta.tokenId,
    p_storage_path: storagePath,
    p_thumbnail_path: thumbnailPath,
    p_file_hash: fileHash,
    p_file_size: webpBuffer.byteLength,
    p_width: width,
    p_height: height,
    p_capture_mode: meta.captureMode,
    p_device_reported_at: meta.deviceReportedAt?.toISOString() ?? null,
    p_captured_at: meta.capturedAt?.toISOString() ?? null,
    p_exif_stripped: exifStripped,
    p_exif_make: exifMake,
    p_exif_model: exifModel,
    p_gps_lat: meta.gpsLat ?? null,
    p_gps_lng: meta.gpsLng ?? null,
    p_queued_at: meta.queuedAt?.toISOString() ?? null
  });

  if (attachErr) {
    // roll back the orphaned storage objects — the DB row never landed
    await supabase.storage.from('submission-photos').remove([storagePath, thumbnailPath]);
    return NextResponse.json({ error: attachErr.message }, { status: 400 });
  }

  return NextResponse.json({ photoId });
}
