import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Service-role client. NEVER import this into a Client Component or expose the key to
// the browser. Reserved for: (1) Admin creating auth accounts (Section 2 — no public
// sign-up, only the Admin API can create a user), (2) minting signed URLs for photos
// after we've already done an equivalent-to-RLS permission check in the API route,
// (3) pg_cron-adjacent jobs that touch Storage (retention deletion, thumbnailing),
// which pure SQL cannot do. Every call site must justify why RLS isn't enough.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
