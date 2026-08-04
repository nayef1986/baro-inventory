import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Section 5: "Access is granted via signed URLs generated server-side after an
// RLS-equivalent permission check." Here the check IS the RLS policy itself — this
// route uses the caller's own session-bound client, so storage's submission_photos_
// storage_select policy (0008_storage.sql) still applies; an unauthorized path simply
// fails to sign.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const path = new URL(request.url).searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 });

  const { data, error } = await supabase.storage.from('submission-photos').createSignedUrl(path, 60 * 10);
  if (error || !data) return NextResponse.json({ error: 'not found or not permitted' }, { status: 404 });

  return NextResponse.json({ url: data.signedUrl });
}
