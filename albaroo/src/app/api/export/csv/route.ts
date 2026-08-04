import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(','))];
  return lines.join('\n');
}

// Section 9.1 / Deliverable: CSV export for Phase 1 (PDF is Phase 2). Admin only —
// this is the same data that eventually feeds the Monthly Performance Summary.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'not permitted' }, { status: 403 });

  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  let query = supabase
    .from('task_assignments')
    .select(
      `id, status, due_at, first_submitted_at, approved_at, closed_at, attempt_count, is_voided,
       task:tasks(title, priority, required_photo_count),
       branch:branches(name_en, code),
       merchandiser:profiles!task_assignments_merchandiser_id_fkey(full_name_en, full_name_ar),
       supervisor:profiles!task_assignments_supervisor_id_fkey(full_name_en, full_name_ar)`
    )
    .order('due_at', { ascending: false });

  if (from) query = query.gte('due_at', from);
  if (to) query = query.lte('due_at', to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((a: any) => ({
    assignment_id: a.id,
    task_title: a.task?.title?.en ?? a.task?.title?.ar ?? '',
    branch: a.branch?.name_en ?? '',
    branch_code: a.branch?.code ?? '',
    merchandiser: a.merchandiser?.full_name_en ?? a.merchandiser?.full_name_ar ?? '',
    supervisor: a.supervisor?.full_name_en ?? a.supervisor?.full_name_ar ?? '',
    status: a.status,
    priority: a.task?.priority ?? '',
    required_photo_count: a.task?.required_photo_count ?? '',
    attempt_count: a.attempt_count,
    due_at: a.due_at,
    first_submitted_at: a.first_submitted_at ?? '',
    approved_at: a.approved_at ?? '',
    closed_at: a.closed_at ?? '',
    voided: a.is_voided
  }));

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="albaroo-export-${new Date().toISOString().slice(0, 10)}.csv"`
    }
  });
}
