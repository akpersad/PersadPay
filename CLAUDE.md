@AGENTS.md
# Persad Pay — Project Specification for Claude Code

## Overview

Persad Pay is a private, mobile-first household payroll web app built for a single household employer (two admins: husband and wife) managing one babysitter. It handles weekly pay stub generation, tax calculations, payment tracking, quarterly filing reminders, W-2 generation, and gives the babysitter a read-only portal to access her pay stubs.

The app is a PWA (Progressive Web App) installable on iOS and Android as a pseudo-native app. All three users are in New York. All times and dates display in America/New_York timezone.

---

## Tech Stack

- **Framework:** Next.js (App Router)
- **Database + Auth:** Supabase (Postgres + Supabase Auth + Row Level Security)
- **Email:** Resend (free tier), sent from `noreply@payroll.persadpay.com`
- **PDF Generation:** `@react-pdf/renderer` — server-side only (Next.js API route or server action), never client-side
- **UI:** Tailwind CSS + shadcn/ui
- **Deployment:** Vercel (free tier)
- **PWA:** next-pwa or equivalent
- **Domain:** `persadpay.com` (GoDaddy). DNS splits between Vercel records (web app) and Resend SPF/DKIM records (email). No email inbox or hosting needed — Resend is outbound only.

---

## Authentication

Supabase handles the full auth stack. No Auth0, Clerk, or separate auth service needed.

- Email + password login via Supabase Auth
- Secure password hashing, session management, and JWT handled by Supabase
- Use `@supabase/ssr` package for Next.js session cookie handling
- Middleware calls `supabase.auth.getUser()` on every request
- Role is stored in the `profiles` table — fetched alongside session, not embedded in JWT
- `/` is the only public route (login page). All other routes require an active session.
- Unauthenticated requests redirect to `/`
- Employees attempting to access admin-only routes are redirected to `/dashboard`
- After successful login, redirect to `/dashboard`
- Session persistence enabled — users stay logged in on mobile between visits (critical for PWA)
- No public sign-up page. All three accounts created manually in Supabase dashboard.

---

## Roles (RBAC)

Two roles only. No middle tier.

### Admin (2 users: husband and wife)
- Generate pay stubs
- View full pay stub including employer taxes (FUTA, SUTA, employer FICA)
- Download admin PDF variant (includes employer taxes)
- Mark payment sent + enter Zelle transaction ID
- Click "Email Paystub" to manually fire the stub email
- View and dismiss reminders
- Manage all settings
- View onboarding checklist
- Generate and download W-2 by tax year

### Employee (1 user: babysitter)
- Read-only access to her own pay stubs only
- Views employee PDF variant (no employer taxes, no transaction ID, no payment status)
- Download employee PDF variant
- View and download her own W-2s by year
- View her own sick-leave summary
- Manage her own account settings (push notifications, 2FA, change password) via `/settings`
- No access to admin settings, reminders, filings, dashboard stats, or any admin views

---

## Pay Stub Workflow (Critical — Read Carefully)

The stub email is NOT sent automatically on generation. The flow is deliberate and sequential:

1. Admin navigates to `/stubs/new`
2. Admin fills out the generation form:
   - **Hourly rate**: pre-filled from settings, editable
   - **Pay period start**: pre-filled to the day after the last stub's `pay_period_end`; blank if no prior stubs; editable
   - **Pay period end**: pre-filled to 6 days after the suggested start (one full week); editable
   - **Pay date**: pre-filled to the same day as `pay_period_end`; editable
   - **Hours worked**: blank, required
3. Admin sees a fully rendered pay stub preview before saving
4. Admin saves — stub written to Supabase with `payment_sent = false`, `stub_sent = false`
5. Admin goes to Zelle and sends money manually (outside the app)
6. Admin opens the stub, clicks **"Payment Sent"** — enters Zelle transaction ID — `payment_sent` flips to `true`
7. Admin clicks **"Email Paystub"** — Resend fires, `stub_sent` flips to `true`

Steps 6 and 7 are independent actions. The UI must disable "Email Paystub" until `payment_sent = true`.

**Stub Deletion:** Admin-only. Accessible from the stub detail page action menu (alongside Download, etc.). Requires confirmation before deleting. Stub numbers are never reused — gaps are permanent.

---

## Data Model

### `profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid | References auth.users |
| full_name | text | |
| email | text | |
| role | text | 'admin' or 'employee' |
| created_at | timestamptz | |

### `paystubs`
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| stub_number | integer | Assigned atomically by DB trigger from a forward-only sequence (high-water counter). UNIQUE constraint. Numbers are never reused, even when the newest stub is deleted. |
| employee_id | uuid | References profiles |
| pay_period_start | date | |
| pay_period_end | date | |
| pay_date | date | Tax year is determined by pay_date (IRS constructive receipt) |
| hours_worked | numeric | Can be 0 (zero-hour week still generates a stub) |
| overtime_hours | numeric | Hours above 40/week; triggers OT row on stub at 1.5× rate |
| sick_hours | numeric | Sick hours used this period — informational only; sick leave is unpaid and unlimited |
| hourly_rate | numeric | Copied from settings at generation time |
| gross_pay | numeric | hours_worked × hourly_rate + overtime_hours × hourly_rate × 1.5 (sick leave is unpaid; sick_hours does not contribute to gross) |
| federal_withholding | numeric | Flat dollar snapshot from settings; $0.00 if hours_worked = 0 |
| fica_social_security | numeric | 6.2% of gross (capped at SS wage base) |
| fica_medicare | numeric | 1.45% of gross (uncapped) |
| state_withholding | numeric | Flat dollar snapshot from settings; $0.00 if hours_worked = 0 |
| sdi | numeric | 0.5% of gross capped at $0.60/wk — only if dbl_covered_at_generation = true, else $0 |
| pfl | numeric | 0.432% of gross up to annual cap — only if pfl_covered_at_generation = true, else $0 |
| dbl_covered_at_generation | boolean | Snapshot of settings.dbl_covered at time of generation |
| pfl_covered_at_generation | boolean | Snapshot of settings.pfl_covered at time of generation |
| suta_rate_at_generation | numeric | Snapshot of settings.suta_rate at time of generation |
| employer_fica_ss | numeric | Employer only — 6.2% of gross (capped at SS wage base) |
| employer_fica_medicare | numeric | Employer only — 1.45% of gross |
| futa | numeric | Employer only — 0.6% of gross up to $7,000 annual wage base |
| suta | numeric | Employer only — suta_rate_at_generation × gross up to $17,600 annual wage base |
| net_pay | numeric | gross minus all employee-side deductions, plus non-taxable reimbursements (accountable plan); always $0.00 on zero-hour stubs with no reimbursements. The stub PDF footer shows a Reimbursements cell whenever they are present so gross − deductions + reimbursements = net reads on its face. |
| payment_sent | boolean | Default false. True when admin marks payment sent. |
| zelle_transaction_id | text | Free text. Admin only. Nullable. |
| stub_sent | boolean | Default false. True when admin clicks Email Paystub. |
| hysa_transferred | boolean | Default false. True when admin logs the tax-reserve HYSA transfer. |
| created_at | timestamptz | Store in UTC, display in America/New_York |
| created_by | uuid | References profiles (admin who generated) |

### `settings`
Single-row table. Only one record ever exists.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| employer_name | text | e.g. "Persad Family" |
| employer_ein | text | e.g. "12-3456789" — shown on pay stub and W-2 Box b |
| employer_address | text | Shown on pay stub header and W-2 Box c |
| employer_phone | text | Required by NY § 195(3) — appears on pay stub header |
| employer_ny_state_id | text | NY DTF employer registration number — W-2 Box 15. Nullable until registered. |
| employee_name | text | Babysitter's full name (legacy single-string field) |
| employee_name_first | text | Used on W-2 Box e |
| employee_name_middle_initial | text | Nullable |
| employee_name_last | text | Used on W-2 Box e |
| employee_address | text | Used on W-2 Box f. Nullable until populated. |
| employee_id_display | text | Human-readable ID shown on stub e.g. "EMP-001" |
| employee_email | text | Primary stub delivery address |
| employee_hourly_rate | numeric | Pre-fills stub generation form |
| federal_withholding_per_period | numeric | Voluntary flat dollar from her W-4. Default $0. |
| state_withholding_per_period | numeric | Voluntary flat dollar from her IT-2104. Default $0. |
| dbl_covered | boolean | NY DBL (SDI) coverage. Default false — only true if she works 20+ hrs/wk. |
| pfl_covered | boolean | NY PFL coverage. Default false — only true if she works 20+ hrs/wk or 175+ days/52 wks. |
| suta_rate | numeric | Base UI rate from the annual NY UI rate notice, EXCLUDING the 0.075% RSF surcharge (RSF is computed separately from tax_rates.rsf_rate on the NYS-45). Update each January/February when the rate notice arrives. |
| additional_emails | text[] | Extra stub delivery recipients. Each gets a separate email. |
| reply_to_emails | text[] | Admin personal email(s) set as reply-to on all outbound emails |
| reminder_emails | text[] | Recipients for filing reminder emails. Pre-seeded with Persad.household@gmail.com. |
| updated_at | timestamptz | |

### `reminders`
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| title | text | e.g. "Q2 NYS-45 Filing Due" |
| due_date | date | |
| description | text | What needs to be filed and where |
| dismissed | boolean | Default false. When dismissed, auto-create next year's equivalent. |
| email_sent | boolean | Default false |
| created_at | timestamptz | |

### `onboarding_checklist`
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| label | text | e.g. "Apply for Federal EIN (IRS Form SS-4)" |
| detail | text | Brief explanation or link |
| completed | boolean | Default false |
| sort_order | integer | Display order |

### `w2s`
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| employee_id | uuid | References profiles |
| tax_year | integer | e.g. 2026 |
| wages_tips | numeric | Box 1 — total taxable wages |
| federal_tax_withheld | numeric | Box 2 |
| ss_wages | numeric | Box 3 |
| ss_tax_withheld | numeric | Box 4 |
| medicare_wages | numeric | Box 5 |
| medicare_tax_withheld | numeric | Box 6 |
| state_wages | numeric | Box 16 |
| state_tax_withheld | numeric | Box 17 |
| generated_at | timestamptz | |
| generated_by | uuid | References profiles |

---

## Tax Calculations

Tax rates live in the `tax_rates` Postgres table, keyed by `effective_year`. `src/lib/tax.ts` reads them via `getTaxRatesForYear(supabase, year)` — never hardcode rates inline. The in-app "Verify tax constants" December reminder is the trigger to add next year's row.

Current 2026 values (verified 2026-05-05 — source URLs in `/docs/COMPLIANCE_REMEDIATION_PLAN.md`):

| Column | Value | Notes |
|---|---|---|
| `fica_ss_rate` | 0.062 | 6.2% employee + 6.2% employer |
| `fica_medicare_rate` | 0.0145 | 1.45% employee + 1.45% employer (uncapped) |
| `ss_wage_base` | 184500 | Caps both employee and employer FICA SS |
| `futa_rate` | 0.006 | 0.6% net of full NY state credit — verify annually against DOL credit-reduction list |
| `futa_wage_base` | 7000 | Unchanged since 1983 |
| `suta_wage_base` | 17600 | NY 2026 — 18% of state average annual wage (permanent formula from 2026, per NYS-50). Update each January from NY DOL notice. |
| `sdi_rate` | 0.005 | 0.5% NY DBL — only applies when `dbl_covered = true` |
| `sdi_weekly_cap` | 0.60 | $0.60/week hard cap |
| `pfl_rate` | 0.00432 | 0.432% NY PFL — only applies when `pfl_covered = true` |
| `pfl_annual_cap` | 411.91 | NY 2026 annual max employee PFL contribution |
| `irs_mileage_rate` | 0.725 | 72.5¢/mi (non-taxable mileage reimbursement) |
| `fica_household_threshold` | 3000 | IRS Pub 926 — FICA applies only if annual cash wages ≥ this amount |
| `futa_quarterly_threshold` | 1000 | FUTA applies only if any single quarter's cash wages ≥ this amount |

### Employee-Side Deductions (withheld from gross, shown on stub)

| Tax | Calculation |
|---|---|
| FICA - Social Security | gross × fica_ss_rate (capped at ss_wage_base YTD) |
| FICA - Medicare | gross × fica_medicare_rate (uncapped) |
| Federal Income Tax | flat dollar snapshot from settings (voluntary — default $0) |
| NY State Income Tax | flat dollar snapshot from settings (voluntary — default $0) |
| NY SDI | if dbl_covered: MIN(gross × sdi_rate, sdi_weekly_cap), else $0 — omit row when $0 |
| NY PFL | if pfl_covered: MIN(gross × pfl_rate, remaining annual cap), else $0 — omit row when $0 |

### Employer-Side Taxes (admin view only, not withheld from gross)

| Tax | Calculation |
|---|---|
| Employer FICA - SS | gross x FICA_SS_RATE |
| Employer FICA - Medicare | gross x FICA_MEDICARE_RATE |
| FUTA | FUTA_RATE x taxable portion (stop at FUTA_WAGE_BASE) |
| SUTA | settings.suta_rate x taxable portion (stop at SUTA_WAGE_BASE) |

### Wage Base Cap Logic

When generating a stub, first sum gross_pay for all prior stubs in the same calendar year. Apply employer taxes only to the portion of the current gross that keeps YTD under the cap.

Example: YTD gross = $6,800, this week gross = $400. Only $200 is subject to FUTA (cap is $7,000). FUTA = $200 x 0.006 = $1.20.

### Taxes That Do Not Apply

| Tax | Reason |
|---|---|
| MCTMT | Quarterly payroll threshold is $312,500. Not applicable. |
| NYC Local Tax | Nassau County has no local income tax. |
| Yonkers Tax | Not applicable. |

---

## Pay Stub Design

Built with `@react-pdf/renderer` server-side. Accepts `variant: 'admin' | 'employee'`.

**Header**
- Top left: Employer name, EIN, address
- Top right: "Earnings Statement" label + Stub Number

**Employee Info Row**
- Employee name, Employee ID | Pay Schedule: Weekly | Pay Period: [start] to [end] | Pay Date: [date]
- No employee address field

**Earnings Table**
- Columns: Description | Rate | Hours | Total | YTD
- One row: "Regular Earnings" (or "No Hours — Week Off" if hours = 0)

**Earnings Table extras**
- OT rate note above the table: `Overtime rate (after 40 hrs/wk): $X.XX/hr` (hourlyRate × 1.5) — always shown per NY § 195(3)
- Earnings row for OT only appears when overtime_hours > 0
- "Allowances claimed: None" disclosure per NY § 195(3)

**Taxes / Deductions Table**
- Federal Withholding — Current | YTD
- FICA - Social Security — Current | YTD
- FICA - Medicare — Current | YTD
- NY State Withholding — Current | YTD
- NY SDI — Current | YTD (omit row entirely if dbl_covered_at_generation = false)
- NY PFL — Current | YTD (omit row entirely if pfl_covered_at_generation = false)
- **Employer Taxes** — admin variant only, fully omitted from employee variant:
  - Employer FICA - SS — Current | YTD
  - Employer FICA - Medicare — Current | YTD
  - FUTA — Current | YTD
  - SUTA — Current | YTD

**Footer Summary Row**
- YTD Gross | YTD Taxes/Deductions | YTD Net Pay | Gross | Taxes/Deductions | **Net Pay**

No SSN field. Color scheme TBD — use a neutral placeholder. Define a single `BRAND_COLOR` constant so it can be swapped in one place.

---

## W-2 Generation

Generated annually in January for the prior tax year. Precise recreation of the official IRS W-2 layout. Built server-side with `@react-pdf/renderer`.

**Data sourced automatically from that year's paystubs:**
- Box 1: Sum of gross_pay
- Box 2: Sum of federal_withholding
- Box 3: Sum of gross_pay (up to SS wage base)
- Box 4: Sum of fica_social_security
- Box 5: Sum of gross_pay
- Box 6: Sum of fica_medicare
- Box 15-17: NY state wages and withholding
- Employer fields from settings

**W-2 flow:**
1. Admin goes to `/w2`, selects tax year
2. App calculates all box values from that year's stubs — rendered as a live preview, nothing saved yet
3. Admin reviews preview
4. Admin clicks **Download** or **Email**
5. Record is upserted to `w2s` on `(employee_id, tax_year)` — clean replace, no duplicates
6. If Email, Resend fires using the same pattern as stub email delivery

**Regeneration:** If a W-2 already exists for the selected year, the UI shows a warning: "A W-2 already exists for [year]. Regenerating will replace it." Admin must confirm before proceeding. The upsert handles the replace automatically.

Babysitter can view and download her own W-2s from her dashboard.

---

## Email Behavior (Resend)

All email triggered by explicit admin action. Nothing sends automatically.

**Stub delivery** (triggered by "Email Paystub" button):
- From: `Persad Pay <noreply@payroll.persadpay.com>`
- Reply-to: `settings.reply_to_emails`
- To: `settings.employee_email` + each in `settings.additional_emails`
- Each recipient gets a separate individual email — no CC or BCC
- Attachment: employee variant PDF
- Subject: `Your pay stub for [pay period start] – [pay period end]`
- Body: Plain, professional text. No marketing language.

**Reminder emails** (triggered by approaching due date):
- From: `Persad Pay <noreply@payroll.persadpay.com>`
- To: all addresses in `settings.reminder_emails`
- Subject: `Reminder: [filing name] due [date]`
- Body: Plain text with filing name, due date, brief description

**W-2 delivery** (triggered by admin action):
- Same email pattern as stub delivery
- Subject: `Your W-2 for tax year [year]`

**Error handling:**
- If Resend call fails, show a visible error on the stub/W-2 detail page
- Display a "Retry" button that re-fires the email without creating a duplicate record
- Never fail silently

---

## Navigation

Bottom tab bar for all authenticated users. Mobile-first, touch-friendly, no hover dependencies.

**Admin tabs (mobile):** Dashboard | Stubs | Reminders | HYSA | More (sheet: W-2, Filings, Documents, Calendar, Settings)
**Admin tabs (desktop md+):** All tabs visible inline — no overflow sheet.

**Employee tabs:** Dashboard | Pay Stubs | W-2 | Settings

Sign out accessible from the Settings page for both roles. Employee also has a profile icon in the top header that opens a quick account dialog.

---

## Dashboard Content

### Admin Dashboard (`/dashboard` — admin role)

Mobile-first. Scannable. Primary use case: admin just paid the babysitter and wants to confirm everything is logged.

1. **Stats row** (top of page, 3 cards side by side):
   - YTD gross paid (sum of `gross_pay` for current calendar year)
   - Total stubs generated this year (count of stubs for current calendar year)
   - Next reminder due (e.g. "NYS-45 Q2 due in 18 days" — nearest non-dismissed reminder)

2. **Generate New Stub button** — prominent, full-width or near-full-width CTA. Most-used action in the app. Links to `/stubs/new`.

3. **Onboarding checklist** — shown directly below stats until all items are checked off, then hidden.

4. **Recent stubs** — last 5 stubs as a list. Each row shows: stub number, pay period, gross pay, and status indicators for payment sent and stub emailed. Tapping a row navigates to `/stubs/[id]`.

5. **Pending reminders** — reminders due within the next 90 days (deliberately widened from 60 in PR #11), shown as a card list with title, due date, and days remaining. This surfaces urgency beyond the badge count. Links to `/reminders` for the full list. The Next Due stat card fetches the nearest reminder without the 90-day cap.

Nothing else. No charts, no extra widgets.

---

### Employee Dashboard (`/dashboard` — employee role)

Minimal. One job: answer "was I paid and for how much?"

1. **Most recent pay stub card** — shows pay period, pay date, gross pay, and net pay. Tapping navigates to `/stubs/[id]`.
2. **"View All Pay Stubs"** button — links to `/stubs`.
3. **"View W-2s"** button — links to `/w2`.
4. **"View Sick Leave Summary"** button — links to `/documents/sick-leave-summary` (employee sees only her own data per NY § 196-b(4)).

No stats, no actions, nothing admin-facing. Account management (2FA, password, push notifications) lives in the employee's Settings tab, not here.

---

## Onboarding Checklist (Admin only)

Visible on admin dashboard until all items are checked off. Self-serve — no guided wizard.

Pre-seeded items (in order):
1. Apply for Federal EIN at irs.gov (IRS Form SS-4)
2. Register with New York State at labor.ny.gov (Form NYS-100)
3. File new hire report with NY Directory of New Hires (within 20 days of hire)
4. Provide signed LS-59 Wage Notice to employee (NY § 195(1) WTPA — retain 6 yrs)
5. Have employee complete Federal W-4
6. Have employee complete NY IT-2104
7. Obtain signed PFL-Waiver form (employee <20 hrs/week, retain duration of employment)
8. Purchase persadpay.com domain
9. Add Vercel DNS records to domain registrar
10. Sign up for Resend and verify persadpay.com for email sending
11. Fill out all fields in Persad Pay Settings
12. Create Supabase user accounts for all three users
13. Confirm quarterly reminders are seeded in Reminders tab

Once all items checked, checklist collapses or hides from dashboard.

---

## Reminders (Admin only)

Pre-seeded quarterly filing reminders:
- NYS-45 Q1 due April 30
- NYS-45 Q2 due July 31
- NYS-45 Q3 due October 31
- NYS-45 Q4 due January 31
- Schedule H due with federal tax return (mid-April)

Each reminder shows: title, due date, days remaining, description of what to file and where.

Dismissing a reminder marks it dismissed and auto-creates the equivalent for the next year.

Reminder emails fire to all `settings.reminder_emails` addresses on two triggers:
- **20 days before** due date — first notice
- **10 days before** due date — follow-up, only if reminder has not been dismissed

Define as named constants `REMINDER_LEAD_DAYS = 20` and `REMINDER_FOLLOWUP_DAYS = 10` in `lib/dates.ts`.

Dashboard shows badge with pending reminder count.

---

## Stub Numbering

`stub_number` is assigned by a Postgres `BEFORE INSERT` trigger (`paystubs_assign_stub_number`) that pulls from the forward-only sequence `paystubs_stub_number_seq` (migration 0039). The sequence is a high-water counter: deleting the newest stub does not free its number. Any value the client sends is overwritten. A `UNIQUE` constraint enforces no duplicates even under concurrent inserts.

Gaps from deletions are never backfilled. The sequence only moves forward, so gaps are permanent regardless of where the deletion happened.

---

## Route Structure

```
/                              Public only — Login page
/dashboard                     Auth — Role-aware (admin stats vs. employee pay summary)
/stubs                         Auth — Stub list, role-aware rendering
/stubs/new                     Admin only — Generation form + live preview
/stubs/[id]                    Auth — Stub detail, role-aware PDF variant
/reminders                     Admin only
/filings                       Admin only — NYS-45, Schedule H, 1040-ES hub
/filings/nys-45/[year]/[q]     Admin only — Quarterly NYS-45 summary
/filings/schedule-h/[year]     Admin only — Annual Schedule H summary
/filings/federal-estimated-tax/[year]/[q]  Admin only — 1040-ES quarterly
/filings/year-end/[year]       Admin only — Year-end checklist
/hysa                          Admin only — Tax reserve HYSA tracking
/calendar                      Admin only — Filing deadline calendar
/documents                     Admin only — Signed document vault
/documents/sick-leave-policy   Admin only — Printable sick-leave policy PDF
/documents/sick-leave-summary  Auth — Admin sees all; employee sees own data only
/w2                            Auth — Role-aware W-2 section
/settings                      Auth — Role-aware: admin payroll config; employee account settings
/api/auth/sign-out             Internal — Signs out and redirects to / (handles profile-less loop)
```

---

## Row Level Security (Supabase RLS)

Enforced at the database level, not just the UI.

- Admins: full read/write on all tables
- Employees: SELECT only on `paystubs` where `employee_id = auth.uid()`
- Employees: SELECT only on `w2s` where `employee_id = auth.uid()`
- Employees: no access to `settings`, `reminders`, or `onboarding_checklist`

---

## Timezone Handling

- All `timestamptz` stored in UTC in Supabase
- All date display in UI uses `America/New_York` locale
- Pay period fields are `date` type (no time component) — no conversion needed
- Create a `lib/dates.ts` utility with a `formatNYDate(date)` helper used throughout the app — never format dates inline

---

## PDF Generation

- All PDFs generated server-side in Next.js API routes or server actions
- Never generate PDFs client-side
- Pay stub PDF component: `variant: 'admin' | 'employee'`, accepts stub with pre-calculated YTD values
- W-2 PDF component: accepts W2Data with all box values pre-calculated
- PDF returned as buffer — streamed for download or base64-encoded for Resend attachment
- Both types should be print-ready at US Letter size

---

## Settings Page Requirements

The `/settings` page is **role-aware**:
- **Admin** sees the full payroll configuration form below, plus their own account management (push notifications, 2FA, change password).
- **Employee** sees only their own account management (push notifications, 2FA, change password). No payroll data exposed.

Admin settings must be filled out before the app is functional. Render gracefully with empty/null values. Fields:

- Employer name, EIN, address, phone, NY state ID (for W-2 Box 15)
- Employee first/middle/last name (for W-2 Box e), display ID, email, home address (for W-2 Box f), hourly rate
- Federal withholding per period (voluntary — inline note: "voluntary for household employees; default $0; requires signed W-4")
- State withholding per period (voluntary — inline note: "voluntary; default $0; requires signed IT-2104")
- NY DBL (SDI) coverage toggle — default off; help text: "covers domestic workers at 20+ hrs/wk; DBL insurance policy also required if on"
- NY PFL coverage toggle — default off; help text: "covers domestic workers at 20+ hrs/wk OR 175+ days/52 wks"
- SUTA rate (note: update annually from NY UI rate notice)
- Additional stub recipient emails (add/remove individually)
- Reply-to emails (add/remove individually)
- Reminder notification emails (add/remove individually; pre-seeded with Persad.household@gmail.com)

---

## Out of Scope

- Public sign-up (all accounts created manually in Supabase)
- Multiple employees
- Direct deposit or Zelle API integration
- Mobile native app (PWA is sufficient)
- Guided onboarding wizard

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY       # alias for PUBLISHABLE_KEY in some Supabase setups
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_PROJECT_REF
RESEND_API_KEY
CRON_SECRET                         # Vercel cron Bearer auth
NEXT_PUBLIC_VAPID_PUBLIC_KEY        # web push public key
VAPID_PRIVATE_KEY                   # web push private key
VAPID_SUBJECT                       # mailto: address for push registration
```

All in `.env.local`. Never hardcode.

---

## Code Organization Notes for Claude Code

- TypeScript throughout — no `any` types
- Tailwind CSS + shadcn/ui for all UI
- `src/lib/tax.ts` — `calculateTaxes()` (pure function), `getTaxRatesForYear()` (DB fetch). Rates live in `tax_rates` table, not hardcoded.
- `src/lib/filings.ts` — `calculateNYS45()`, `calculateScheduleH()`, `calculateFederalEstimatedTax()`
- `src/lib/pdf/` — `PaystubDocument.tsx`, `W2Document.tsx`, `W3Document.tsx`, `constants.ts` (BRAND_COLOR)
- `src/lib/email.ts` — all Resend calls
- `src/lib/dates.ts` — NY-timezone-aware helpers: `formatNYDate()`, `todayNY()`, `daysUntil()`, `formatDateRange()`, `nextBusinessDay()`, `addDays()`
- `src/proxy.ts` — middleware (not `middleware.ts`). See `AGENTS.md` note about Next.js naming.
- `BRAND_COLOR = '#a53005'` defined in `src/lib/pdf/constants.ts`
- No sign-up page — all accounts created manually in Supabase
- Keep components small and composable — owner will maintain this codebase
- Tests: `npm test` runs Vitest. Test files live alongside source (`*.test.ts`). Cover all tax calc logic.
- When adding a new tax rate or changing a threshold: update the `tax_rates` DB row (via migration), not a hardcoded constant
- Every `CREATE TABLE public.xyz` in a migration must be paired with explicit `GRANT` statements in that same file — `grant select, insert, update, delete on public.xyz to authenticated;` and ensure `service_role` coverage. Omitting grants will break supabase-js access (PostgREST returns 42501). See `schema.sql` lines 580–598 for the established pattern.