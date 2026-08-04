# ALBAROO — Merchandising Operations System (Phase 1)

Accountability system for retail merchandising across ALBAROO's branches in Saudi
Arabia. This is the Phase 1 MVP per the build specification: auth & role-based access,
branches/users management, task creation with multi-branch assignment, in-app camera
capture with server-authoritative timestamps, photo hash reuse detection, an offline
upload queue, supervisor review, photo retention lifecycle, a branch status board
visible to every role, overdue auto-closure, the dormant-branch/review-SLA alert
ladder, in-app notifications, CSV export, full Row Level Security, an append-only audit
log, the Liquid-Glass-inspired design system (incl. dark mode), and Arabic + English
locales with multilingual task instructions.

**Not in Phase 1** (see spec Section 12): the scoring engine & leaderboards, PDF
reports, perceptual-hash/GPS corroboration, Urdu/Hindi locales, WhatsApp/push
notifications. The schema has columns/hooks for several of these already so Phase 2
doesn't need a breaking migration.

This app lives in `/albaroo` inside the `baro-inventory` repository as an independent
Next.js project — it does not touch or depend on the existing Vite inventory app at
the repo root.

## Stack

- Next.js 14 (App Router) + TypeScript strict
- Supabase: Postgres, Auth, Storage, Row Level Security, pg_cron
- Tailwind CSS, next-intl (ar/en), Zod, Recharts, sharp (server-side image processing)
- Deployed to Vercel; Vercel Cron drives the one job pg_cron can't do (Storage
  deletion for photo retention)

## Directory structure

```
albaroo/
  supabase/
    migrations/        -- schema, RLS, functions/triggers, seed data, cron schedule
                          (numbered, apply in order)
    tests/
  tests/
    rls-isolation.test.ts   -- cross-branch RLS proof (Section 5 explicit requirement)
  scripts/
    bootstrap-admin.ts      -- creates the very first Admin account
  src/
    app/
      [locale]/
        login/
        (app)/         -- authenticated shell: tasks, review, dashboard, branches, users, notifications
      api/
        photos/upload/        -- server-authoritative capture receipt (Section 7.3)
        photos/signed-url/
        cron/retention/       -- nightly Storage deletion (Vercel Cron)
        export/csv/
    components/         -- UI, incl. admin/, dashboard/, nav/
    lib/
      actions/          -- Next.js Server Actions (all mutations, Zod-validated)
      supabase/         -- client.ts (browser), server.ts (session-bound), admin.ts (service role, server-only)
      offline-queue/    -- IndexedDB queue + sync engine + image compression/EXIF
      validations/      -- shared Zod schemas
    locales/            -- ar.json, en.json
```

## How the architecture maps to the spec's accountability requirements

- **`merchandiser_id` is never client input.** Every mutation that matters
  (`submit_assignment`, `review_submission`, `attach_capture_photo`, `issue_capture_token`)
  is a Postgres RPC that reads `auth.uid()` itself; the Next.js layer only forwards a
  validated payload. See `supabase/migrations/0005_workflow_functions.sql`.
- **Server-authoritative photo timestamp (Section 7.3).** The browser never uploads
  straight to Storage. `POST /api/photos/upload` receives the file, and
  `server_captured_at` is stamped the instant the RPC runs — not from EXIF, not from
  the device clock.
- **Append-only audit log.** `audit_log` has no UPDATE/DELETE RLS policy for anyone,
  and a trigger (`reject_audit_log_mutation`) blocks it even for a service-role caller
  that bypasses RLS.
- **RLS is the only access boundary the client sees.** The browser holds only the anon
  key. `SUPABASE_SERVICE_ROLE_KEY` is read exclusively in `src/lib/supabase/admin.ts`
  (marked `server-only`) for the three cases that legitimately need it: Admin creating
  auth accounts, the retention cron's Storage deletion, and signing photo URLs.

## Setup

### 1. Create the Supabase project

Create a project at supabase.com (or self-host). Enable the **pg_cron** extension
under Database → Extensions if it isn't already on — the migrations enable it too, but
some plans require an explicit dashboard toggle first.

### 2. Apply the migrations

```bash
cd albaroo
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

This applies `supabase/migrations/*.sql` in order: schema → RLS → functions/triggers →
seed (21 branches + default settings) → the storage bucket → pg_cron schedule.

If you'd rather not use the CLI, paste each file's contents into the Supabase SQL
Editor in filename order (`0001_...` through `0013_...`).

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in the values from Project Settings → API:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=          # any long random string
```

On Vercel, set the same variables in Project Settings → Environment Variables.
Defining `CRON_SECRET` there is what makes Vercel automatically send
`Authorization: Bearer <CRON_SECRET>` when it fires `/api/cron/retention` (see
`vercel.json`).

### 4. Install and run

```bash
npm install
npm run dev
```

### 5. Create the first Admin

Accounts are Admin-issued only (Section 2) — there's no sign-up page — which means one
account has to be created out-of-band before anyone can log in:

```bash
SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  npm run bootstrap-admin -- <username> <password> "اسم المدير"
```

Sign in at `/ar/login` (or `/en/login`) with that username/password. From here on,
**every other account is created from the Users screen inside the app** — the Admin
never touches Supabase directly again for user management.

## Admin walkthrough: first task end to end

1. **Users** → Add user → pick role (merchandiser/supervisor), set username/password,
   assign branches. A merchandiser or supervisor must be assigned to a branch (via
   `user_branches`) before they can act on it.
2. **Branches** → the 21 seeded branches are listed; add more or deactivate ones with
   no history freely — deactivating one with assignment history soft-deletes it and
   voids its open assignments (Section 10.3), a hard delete is only offered when a
   branch has no history at all (Section 11).
3. **Dashboard → New task** → fill in the title (and instructions) in at least the
   source language, set the required photo count and deadline, pick the branches. This
   creates one `task_assignments` row per branch atomically and resolves each
   branch's assigned merchandiser/supervisor automatically.
4. The merchandiser sees the task on their **Tasks** tab, opens it, and the submission
   screen opens the in-app camera directly (gallery selection is off unless you've
   explicitly enabled it for that user in Users → their row → "Allow gallery upload").
5. On submit, the assignment moves to `under_review` and the branch's supervisor is
   notified. They review from the **Review** tab — full-screen photo viewer, and
   Reject requires a comment of 10+ characters (enforced client-side, server-side RPC,
   and a database CHECK constraint — three layers, since an empty rejection is the
   spec's named failure mode for supervisors avoiding real work).
6. Everyone — not just Admin — can see the **branch status board** on their Dashboard
   tab (Section 8.3's deliberate peer-visibility choice). Admin additionally sees
   Stalled Reviews, Overdue, Silent Branches, KPIs, the audit/overturn tool, and the
   activity feed.

## Scheduled jobs

| Job | Mechanism | Schedule (UTC) | What it does |
|---|---|---|---|
| Close overdue assignments | pg_cron | every 15 min | `not_started`/`needs_revision` past `due_at + grace_hours` → `closed_missed` |
| Review SLA escalation | pg_cron | hourly | notifies supervisor at 24h, supervisor+Admin (pinned) at 48h |
| Dormancy + Silent Branches | pg_cron | 05:00 (= 08:00 Riyadh) | recomputes `branch_activity`, fires the watch/critical/dead ladder |
| Daily Admin digest | pg_cron | 15:00 (= 18:00 Riyadh) | one summary notification per Admin |
| Weekly Admin digest | pg_cron | Sun 05:00 (= 08:00 Riyadh) | completion %, recovered/newly-silent branches |
| Photo retention deletion | Vercel Cron → `/api/cron/retention` | 03:00 | deletes full-res originals 7+ days past approval; thumbnails are permanent |

`pg_cron` can't delete Storage objects (it's pure SQL), which is why retention runs as
a Vercel Cron job instead — see `supabase/migrations/0012_cron_schedule.sql` for the
rest.

## Testing

```bash
npm run typecheck
npm run lint
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... npm run test:rls
```

`test:rls` is the Section 5 explicit requirement: it authenticates as a merchandiser
in branch A via the anon key (exactly what the browser does) and asserts every
attempt to read branch B's `submissions`, `submission_photos`, and
`task_assignments` returns zero rows, plus the self-approval block and audit_log
lockdown.

## Known Phase 1 gaps / follow-ups for Phase 2

- No reference-image upload UI yet for tasks (the `reference_image_path` column and
  RPC parameter exist; wiring the picker into the task-creation form is a small
  follow-up).
- Scoring engine, monthly locking, and leaderboards are Phase 2 per the spec — the
  `task_assignments.score` column is reserved for it, untouched by anything in Phase 1.
- PDF reports, GPS corroboration, perceptual hashing, and Urdu/Hindi are Phase 2/3 as
  specified; `submission_photos` already has the GPS/pHash columns so that migration
  won't need a schema change.
- The design system implements the palette, type scale, Liquid Glass chrome, Reduce
  Transparency, and motion tokens from Section 8.5; the "specular sweep on approval"
  micro-interaction and pinch-zoom on the photo viewer are the two purely-cosmetic
  items left for a polish pass.
