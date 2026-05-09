# Persad Pay

Private household payroll web app for the Persad family. Manages weekly pay stub generation, tax calculations, payment tracking, quarterly filing reminders, and W-2 generation. Includes a self-service portal for the employee.

Installable as a PWA on iOS and Android.

## Stack

- **Framework:** Next.js 16 (App Router)
- **Database + Auth:** Supabase (Postgres + RLS + Supabase Auth)
- **Email:** Resend
- **PDF:** `@react-pdf/renderer` (server-side only)
- **UI:** Tailwind CSS + shadcn/ui
- **Deployment:** Vercel
- **Tests:** Vitest (`npm test`)

## Local Development

```bash
npm run dev      # start dev server
npm test         # run unit tests (tax + filings calculations)
npm run test:watch
```

App runs at [http://localhost:3000](http://localhost:3000). Requires `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PROJECT_REF=
RESEND_API_KEY=
CRON_SECRET=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
```

## Users & Roles

Three accounts, created manually in Supabase — no public sign-up. All users must enroll TOTP (MFA) on first login.

| Role | Access |
|---|---|
| Admin (×2) | Full access — generate stubs, mark payment, email stubs, manage settings, view filings, generate W-2s |
| Employee (×1) | View/download her own pay stubs and W-2s; manage her own account settings (2FA, password, push notifications) |

## Key Workflows

**Pay stub:** Generate → mark payment sent (enter Zelle ID) → email to employee. Email is never sent automatically.

**W-2:** Select tax year → preview calculated values → download or email. Upserts on `(employee_id, tax_year)`.

**Reminders:** Quarterly NYS-45 and Schedule H filing reminders. Cron job at `/api/reminders/send-emails` fires email notices 20 and 10 days before each due date (configured in `vercel.json`).

**Filings:** `/filings` provides quarterly NYS-45 summaries, Schedule H annual summary, and federal estimated tax (1040-ES) breakdowns — all calculated from stored stub data.

## Route Summary

```
/                         Login (public)
/dashboard                Role-aware — admin stats vs. employee pay summary
/stubs                    Stub list (role-aware rendering)
/stubs/new                Admin only — generate stub with live preview
/stubs/[id]               Stub detail (role-aware PDF variant)
/reminders                Admin only
/filings                  Admin only — NYS-45, Schedule H, 1040-ES
/hysa                     Admin only — tax reserve tracking
/calendar                 Admin only — filing deadline calendar
/documents                Admin only — signed document vault
/w2                       Role-aware — admin generates, employee views
/settings                 Role-aware — admin payroll config, employee account settings
```

## Project Structure

```
src/
  app/                    Next.js App Router pages and API routes
  components/             UI components organized by feature
  lib/
    tax.ts                calculateTaxes() + getTaxRatesForYear() — rates live in DB
    filings.ts            NYS-45, Schedule H, 1040-ES calculations
    email.ts              All Resend calls
    dates.ts              NY-timezone-aware date formatting and helpers
    pdf/                  Pay stub + W-2 + W-3 PDF generation (server-side only)
    supabase/             Server and browser Supabase clients
supabase/
  migrations/             All schema migrations (applied in order)
scripts/
  screenshot.ts           Admin screenshot script (Playwright + TOTP)
  screenshot-employee.ts  Employee screenshot + route-guard test script
```

All dates display in `America/New_York`. All `timestamptz` stored in UTC. Tax rates are stored in the `tax_rates` table keyed by `effective_year` — update each January via the in-app reminder workflow.
