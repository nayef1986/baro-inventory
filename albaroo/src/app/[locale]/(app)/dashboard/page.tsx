import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { StatusBoard, type BranchStatusRow } from '@/components/dashboard/StatusBoard';
import { KpiRow } from '@/components/dashboard/KpiRow';
import { StalledReviewsPanel } from '@/components/dashboard/StalledReviewsPanel';
import { OverduePanel } from '@/components/dashboard/OverduePanel';
import { SilentBranchesPanel } from '@/components/dashboard/SilentBranchesPanel';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { AuditPanel } from '@/components/dashboard/AuditPanel';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const profile = await getCurrentProfile(locale);
  const supabase = await createClient();

  const { data: board } = await supabase.rpc('branch_status_board');
  const rows = (board ?? []) as BranchStatusRow[];

  if (profile.role !== 'admin') {
    const { data: feed } = await supabase
      .from('activity_feed')
      .select('id, event_type, created_at, branch:branches(name_ar, name_en)')
      .order('created_at', { ascending: false })
      .limit(30);

    return (
      <div className="space-y-6">
        <StatusBoard locale={locale} rows={rows} />
        {profile.role === 'supervisor' && <ActivityFeed locale={locale} items={(feed ?? []) as any} />}
      </div>
    );
  }

  const { data: settings } = await supabase.from('settings').select('*').single();
  const watchHours = settings?.review_sla_watch_hours ?? 24;

  const nowIso = new Date().toISOString();

  const [{ data: stalled }, { data: overdue }, { data: silent }, { data: feed }, { data: recentApprovals }] = await Promise.all([
    supabase
      .from('submissions')
      .select(
        `id, submitted_at, assignment:task_assignments!inner(id, branch:branches(name_ar, name_en), supervisor:profiles!task_assignments_supervisor_id_fkey(full_name_ar, full_name_en))`
      )
      .eq('review_status', 'pending')
      .lt('submitted_at', new Date(Date.now() - watchHours * 3600_000).toISOString())
      .order('submitted_at', { ascending: true }),
    supabase
      .from('task_assignments')
      .select(`id, due_at, branch:branches(name_ar, name_en), merchandiser:profiles!task_assignments_merchandiser_id_fkey(full_name_ar, full_name_en)`)
      .in('status', ['not_started', 'needs_revision'])
      .lt('due_at', nowIso)
      .order('due_at', { ascending: true }),
    supabase
      .from('branch_activity')
      .select(`branch_id, dormancy_days, alert_level, branch:branches(name_ar, name_en)`)
      .in('alert_level', ['watch', 'critical', 'dead'])
      .order('dormancy_days', { ascending: false }),
    supabase
      .from('activity_feed')
      .select('id, event_type, created_at, branch:branches(name_ar, name_en)')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('task_assignments')
      .select('id, approved_at, branch:branches(name_ar, name_en), task:tasks(title)')
      .eq('status', 'approved')
      .order('approved_at', { ascending: false })
      .limit(20)
  ]);

  const totals = rows.reduce(
    (acc, r) => {
      acc.total += r.total;
      acc.approved += r.approved;
      acc.under_review += r.under_review;
      acc.needs_revision += r.needs_revision;
      acc.closed_missed += r.closed_missed;
      return acc;
    },
    { total: 0, approved: 0, under_review: 0, needs_revision: 0, closed_missed: 0 }
  );

  const t = await getTranslations('tasks');
  const tc = await getTranslations('common');

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <a href="/api/export/csv" className="rounded-control border border-black/10 px-4 py-2 text-sm font-medium text-ink dark:border-white/10">
          {tc('export')}
        </a>
        <Link href={`/${locale}/tasks/new`} className="rounded-control bg-oud px-4 py-2 text-sm font-medium text-white">
          {t('createTitle')}
        </Link>
      </div>
      <KpiRow totals={totals} />
      <StatusBoard locale={locale} rows={rows} />
      <SilentBranchesPanel locale={locale} rows={(silent ?? []) as any} />
      <StalledReviewsPanel locale={locale} rows={(stalled ?? []) as any} watchHours={watchHours} />
      <OverduePanel locale={locale} rows={(overdue ?? []) as any} />
      <AuditPanel locale={locale} rows={(recentApprovals ?? []) as any} />
      <ActivityFeed locale={locale} items={(feed ?? []) as any} />
    </div>
  );
}
