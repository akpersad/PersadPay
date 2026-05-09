# Persad Pay

Private household payroll web app for the Persad family. Manages weekly pay stub generation, tax calculations, payment tracking, quarterly filing reminders, and W-2 generation. Includes a read-only portal for the employee.

Installable as a PWA on iOS and Android.

## Stack

- **Framework:** Next.js 16 (App Router)
- **Database + Auth:** Supabase (Postgres + RLS)
- **Email:** Resend
- **PDF:** `@react-pdf/renderer` (server-side only)
- **UI:** Tailwind CSS + shadcn/ui
- **Deployment:** Vercel

## Local Development

```bash
npm run dev
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

Three accounts, created manually in Supabase — no public sign-up.

| Role | Access |
|---|---|
| Admin (×2) | Full access — generate stubs, mark payment, email stubs, manage settings, generate W-2s |
| Employee (×1) | Read-only — view and download her own stubs and W-2s |

## Key Workflows

**Pay stub:** Generate → mark payment sent (enter Zelle ID) → email to employee. Email is never sent automatically.

**W-2:** Select tax year → preview calculated values → download or email. Upserts on `(employee_id, tax_year)`.

**Reminders:** Quarterly NYS-45 and Schedule H filing reminders. Cron job at `/api/reminders/send-emails` fires email notices 20 and 10 days before each due date (configured in `vercel.json`).

## Project Structure

```
src/
  app/                  # Next.js App Router pages and API routes
  components/           # UI components by feature
  lib/
    tax.ts              # Tax constants and calculation functions
    email.ts            # All Resend calls
    dates.ts            # Timezone-aware date formatting (America/New_York)
    pdf/                # PDF generation (pay stub + W-2)
  lib/supabase/         # Server and browser Supabase clients
```

All dates display in `America/New_York`. All `timestamptz` stored in UTC.
