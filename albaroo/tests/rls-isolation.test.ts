/**
 * RLS cross-branch isolation test suite (Section 5 explicit requirement, Deliverable 6).
 *
 * Requires a real Supabase project (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * SUPABASE_ANON_KEY in the environment — see ../.env.example) with the migrations in
 * supabase/migrations already applied. This suite creates two throwaway branches and
 * two throwaway merchandiser accounts via the Admin API, signs in as each with the
 * ANON key (i.e. exactly what the browser does), and asserts that one cannot read the
 * other's data through the same REST/PostgREST path the app uses — no service role
 * involved on the read side.
 *
 * Run with: npm run test:rls   (after `npm install`)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_ANON_KEY!;

if (!url || !serviceKey || !anonKey) {
  throw new Error(
    'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY must be set to run the RLS test suite.'
  );
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const rand = () => Math.random().toString(36).slice(2, 10);

let branchA: string;
let branchB: string;
let userA: { id: string; email: string; password: string };
let userB: { id: string; email: string; password: string };
let taskId: string;
let assignmentA: string;
let assignmentB: string;
let submissionB: string;

async function createMerchandiser(branchId: string) {
  const email = `rls-test-${rand()}@example.com`;
  const password = `Test-${rand()}-${rand()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (error || !data.user) throw error ?? new Error('user creation failed');

  const { error: profileErr } = await admin.from('profiles').insert({
    id: data.user.id,
    company_id: COMPANY_ID,
    full_name_ar: 'مستخدم اختبار',
    full_name_en: 'Test User',
    role: 'merchandiser',
    is_active: true
  });
  if (profileErr) throw profileErr;

  const { error: ubErr } = await admin.from('user_branches').insert({ user_id: data.user.id, branch_id: branchId });
  if (ubErr) throw ubErr;

  return { id: data.user.id, email, password };
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

beforeAll(async () => {
  const branchInsert = await admin
    .from('branches')
    .insert([
      { company_id: COMPANY_ID, name_ar: 'فرع اختبار A', name_en: 'Test Branch A', code: `RLS-A-${rand()}` },
      { company_id: COMPANY_ID, name_ar: 'فرع اختبار B', name_en: 'Test Branch B', code: `RLS-B-${rand()}` }
    ])
    .select('id');
  if (branchInsert.error || !branchInsert.data) throw branchInsert.error;
  [branchA, branchB] = branchInsert.data.map((b) => b.id);

  userA = await createMerchandiser(branchA);
  userB = await createMerchandiser(branchB);

  const { data: adminUser } = await admin.from('profiles').select('id').eq('role', 'admin').limit(1).single();

  const { data: task, error: taskErr } = await admin
    .from('tasks')
    .insert({
      company_id: COMPANY_ID,
      title: { ar: 'مهمة اختبار', en: 'Test task' },
      source_locale: 'ar',
      required_photo_count: 1,
      due_at: new Date(Date.now() + 86400000).toISOString(),
      created_by: adminUser!.id
    })
    .select('id')
    .single();
  if (taskErr || !task) throw taskErr;
  taskId = task.id;

  const { data: assignments, error: assignErr } = await admin
    .from('task_assignments')
    .insert([
      { task_id: taskId, branch_id: branchA, merchandiser_id: userA.id, due_at: new Date(Date.now() + 86400000).toISOString() },
      { task_id: taskId, branch_id: branchB, merchandiser_id: userB.id, due_at: new Date(Date.now() + 86400000).toISOString() }
    ])
    .select('id, branch_id');
  if (assignErr || !assignments) throw assignErr;
  assignmentA = assignments.find((a) => a.branch_id === branchA)!.id;
  assignmentB = assignments.find((a) => a.branch_id === branchB)!.id;

  const { data: submission, error: subErr } = await admin
    .from('submissions')
    .insert({ assignment_id: assignmentB, attempt_number: 1, merchandiser_id: userB.id, notes: 'branch B secret notes' })
    .select('id')
    .single();
  if (subErr || !submission) throw subErr;
  submissionB = submission.id;
  await admin.from('submission_photos').insert({
    submission_id: submissionB,
    uploaded_by: userB.id,
    storage_path: `${COMPANY_ID}/${branchB}/${assignmentB}/${submissionB}/secret.webp`,
    file_hash: 'deadbeef',
    file_size: 1234,
    width: 1200,
    height: 1200
  });
});

afterAll(async () => {
  await admin.from('tasks').delete().eq('id', taskId); // cascades assignments/submissions/photos
  await admin.from('branches').delete().in('id', [branchA, branchB]);
  await admin.auth.admin.deleteUser(userA.id);
  await admin.auth.admin.deleteUser(userB.id);
});

describe('cross-branch RLS isolation', () => {
  it('merchandiser A cannot read merchandiser B submissions via the anon-key REST API', async () => {
    const clientA = await signIn(userA.email, userA.password);
    const { data, error } = await clientA.from('submissions').select('*').eq('id', submissionB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('merchandiser A cannot read branch B submission photos', async () => {
    const clientA = await signIn(userA.email, userA.password);
    const { data, error } = await clientA.from('submission_photos').select('*').eq('submission_id', submissionB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('merchandiser A cannot read branch B task_assignments row', async () => {
    const clientA = await signIn(userA.email, userA.password);
    const { data, error } = await clientA.from('task_assignments').select('*').eq('id', assignmentB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('merchandiser A cannot list branch B in user_branches beyond their own row', async () => {
    const clientA = await signIn(userA.email, userA.password);
    const { data, error } = await clientA.from('user_branches').select('*').eq('branch_id', branchB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('merchandiser A can still read their own submission after submit_assignment()', async () => {
    const clientA = await signIn(userA.email, userA.password);
    const { data: tokenRows, error: tokenErr } = await clientA.rpc('issue_capture_token', {
      p_assignment_id: assignmentA
    });
    expect(tokenErr).toBeNull();
    expect(tokenRows?.[0]?.token_id).toBeTruthy();
  });

  it('merchandiser A cannot approve their own submission (self-approval block)', async () => {
    const clientA = await signIn(userA.email, userA.password);
    const { error } = await clientA.rpc('review_submission', {
      p_submission_id: submissionB,
      p_decision: 'approved',
      p_comment: null
    });
    expect(error).not.toBeNull();
  });

  it('merchandiser cannot read audit_log at all', async () => {
    const clientA = await signIn(userA.email, userA.password);
    const { data, error } = await clientA.from('audit_log').select('*').limit(1);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
