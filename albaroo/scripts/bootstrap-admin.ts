/**
 * One-time bootstrap: creates the very first Admin account. Every account after this
 * one is created by an Admin through the app itself (Section 2) — this script exists
 * solely to break the chicken-and-egg problem of "an Admin must exist to create
 * accounts, but no accounts exist yet."
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/bootstrap-admin.ts <username> <password> "<Full Name (Arabic)>"
 */
import { createClient } from '@supabase/supabase-js';

const [username, password, fullNameAr] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

if (!username || !password || !fullNameAr) {
  console.error('Usage: npx tsx scripts/bootstrap-admin.ts <username> <password> "<Full Name (Arabic)>"');
  process.exit(1);
}
if (!url || !serviceKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}

async function main() {
  const admin = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: `${username!.toLowerCase()}@albaroo.local`,
    password,
    email_confirm: true
  });
  if (createErr || !created.user) throw createErr ?? new Error('user creation failed');

  const { error: profileErr } = await admin.from('profiles').insert({
    id: created.user.id,
    company_id: COMPANY_ID,
    full_name_ar: fullNameAr,
    role: 'admin',
    locale: 'ar'
  });
  if (profileErr) throw profileErr;

  console.log(`Admin account created. Sign in with username "${username}".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
