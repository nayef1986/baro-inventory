-- pg_cron schedules. All times below are UTC; Asia/Riyadh is UTC+3 year-round (no DST),
-- so "08:00 Riyadh" = "05:00 UTC" and "18:00 Riyadh" = "15:00 UTC".
--
-- Storage-touching jobs (photo retention deletion, orphaned-upload cleanup, thumbnail
-- backfill) are NOT scheduled here — pg_cron can only run SQL and cannot delete bytes
-- from Supabase Storage. Those run as Vercel Cron jobs hitting the Next.js API routes
-- under src/app/api/cron/*, which call the *_pending_* / candidate-finder functions
-- below over the service-role client and then call the matching mark_*() function.
-- See vercel.json for their schedule.

select cron.schedule('albaroo-close-overdue', '*/15 * * * *', $$select close_overdue_assignments();$$);

select cron.schedule('albaroo-review-sla', '0 * * * *', $$select escalate_review_sla();$$);

select cron.schedule('albaroo-dormancy', '0 5 * * *', $$select refresh_branch_activity_and_alert();$$);

select cron.schedule('albaroo-daily-digest', '0 15 * * *', $$select generate_daily_admin_digest();$$);

select cron.schedule('albaroo-weekly-digest', '0 5 * * 0', $$select generate_weekly_admin_digest();$$);
