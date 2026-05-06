# PersadPay Roadmap & Compliance Audit

**Status as of 2026-05-05.** This document is the source of truth for ongoing work. If a session drops, open this file first to understand context, then continue from the current phase.

---

## Context

- Single-household payroll app for the Persad family (Franklin Square, NY 11010, **Nassau County** — not NYC).
- One employee: a babysitter who works ~9 hrs/week, **non-residential / live-out**, in the family's home.
- Two admins (husband + wife). One employee. Three accounts total.
- First paystub is expected to be generated the week of 2026-05-05.
- Stack: Next.js 16 App Router · Supabase · Resend · @react-pdf/renderer · Tailwind + shadcn · PWA on Vercel.
- See `CLAUDE.md` for the original product spec and `AGENTS.md` for repo norms.

---

## Compliance audit (2026)

Every value below was verified against primary sources on 2026-05-05. Re-verify each January. Source URLs are in commit messages on the corresponding code changes.

### Tax constants — VERIFIED for 2026

| Constant | Value | Source |
|---|---|---|
| FICA Social Security | 6.2% (employee + employer) | IRS Topic 751 |
| FICA Medicare | 1.45% (employee + employer) | IRS Topic 751 |
| FUTA effective rate | 0.6% (no NY credit reduction in 2026) | IRS Pub 926 |
| FUTA wage base | $7,000 | unchanged since 1983 |
| NY SDI rate | 0.5% | NY DFS / WCB |
| NY SDI weekly cap | $0.60 (annual max $31.20) | NY DFS / WCB |
| NY PFL rate | 0.432% | DFS 2026 PFL rate decision |
| NY PFL annual cap | **$411.91** | DFS 2026 PFL rate decision |
| NY SUTA wage base | **$13,000** (NOT $17,600 as originally specced) | NY DOL 2026 UI rate notice |
| Social Security wage base | $184,500 | IRS Topic 751 |
| IRS standard mileage | 72.5¢/mi | IRS Notice 2026-10 |

### Does NOT apply

- **MCTMT** — threshold is $312,500 quarterly payroll; babysitter's annual wages (~$10K) are nowhere near.
- **Nassau County local income tax** — does not exist; NY only levies local income tax in NYC and Yonkers.
- **NYC / Yonkers tax** — Persad family lives in Nassau, employee works in their home in Nassau.
- **Workers' Comp insurance** — required only at 40+ hrs/wk or live-in; babysitter is 9 hrs/wk live-out. Not required (optional via NYSIF, recommended for liability).
- **Disability Benefits Insurance (DBL)** — required at 20+ hrs/wk; not required at 9 hrs/wk.

### Labor-law obligations at 9 hrs/wk

- **NY Paid Sick Leave (Labor Law § 196-b)** — REQUIRED but **UNPAID** at the family's tier (1–4 employees, ≤$1M net income → 40 hrs/yr unpaid). Persad family has chosen to offer **unlimited unpaid** sick leave, which exceeds the statutory floor.
  - Requires written sick-leave policy → drafted in Phase 0.
  - Requires written summary of accrued/used hours within 3 business days of an employee request → tracked via stub "reason" field starting Phase 3.
- **Overtime (Domestic Workers' Bill of Rights, NY Labor Law Art. 19, § 170)** — non-residential domestic workers earn 1.5× after 40 hrs/wk. At 9 hrs/wk this never triggers, but the system must support it (Phase 3) and the paystub must display the OT rate per WTPA (Phase 0).
- **PFL Waiver** — employee is eligible (regular schedule <20 hrs/wk and <175 days/52 wks). Form: **PFL-Waiver**, retain for full duration of employment. Auto-revokes if her schedule reaches ≥20 hrs/wk for 6+ months — and if it does, the family owes back contributions retroactively.
- **LS-59 Wage Notice (NY Labor Law § 195(1) / WTPA)** — must be given at hire in English + employee's primary language, signed acknowledgment retained for 6 years.
- **New-hire reporting (Tax Law § 171-h)** — within 20 days of hire to NY New Hire Reporting Center. Already in onboarding checklist.
- **Paystub content (NY Labor Law § 195(3))** — must include employer name, address, and **phone**, employee name, pay period dates, regular rate + basis, **OT rate**, regular hours, **OT hours**, gross, itemized deductions, net.

### Key data sources

- **IRS:** [Pub 926](https://www.irs.gov/publications/p926) · [Pub 15](https://www.irs.gov/publications/p15) · [Pub 15-B](https://www.irs.gov/publications/p15b) · [Topic 751](https://www.irs.gov/taxtopics/tc751) · [Topic 756](https://www.irs.gov/taxtopics/tc756) · [Notice 2026-10 (mileage)](https://www.irs.gov/pub/irs-drop/n-26-10.pdf)
- **NY DOL:** [Domestic Workers' Bill of Rights](https://dol.ny.gov/domestic-workers-bill-rights) · [UI rate info](https://dol.ny.gov/unemployment-insurance-rate-information) · [Wage Statement Guidelines (LS45)](https://dol.ny.gov/system/files/documents/2023/11/ls45.pdf)
- **NY Tax & Finance:** [MCTMT](https://www.tax.ny.gov/bus/mctmt/emp.htm)
- **NY DFS / WCB:** [PFL rate decision 2026](https://www.dfs.ny.gov/apps-and-licensing/health-insurers/pfl-rate-decision-2026-page) · [paidfamilyleave.ny.gov/2026](https://paidfamilyleave.ny.gov/2026) · [WCB Household Employers (WC)](https://www.wcb.ny.gov/content/main/coverage-requirements-wc/household-employers.jsp) · [WCB Household Employers (DB/PFL)](https://www.wcb.ny.gov/content/main/coverage-requirements-db/household-employers.jsp)
- **Statutes:** [NY Labor Law § 196-b](https://www.nysenate.gov/legislation/laws/LAB/196-B) · [NY Labor Law § 195](https://codes.findlaw.com/ny/labor-law/lab-sect-195/)

---

## User decisions (locked in)

These have been confirmed in conversation and should not be re-litigated unless explicitly revisited.

| # | Decision |
|---|---|
| 1 | Persad family lives in **Nassau County, Franklin Square 11010**. Employee works in their home. No NYC/Yonkers tax. |
| 2 | Daily-hours breakdown will be **persisted** (small schema add) so the in-app calendar can show day-by-day worked hours retroactively. |
| 3 | Sick leave policy: **unlimited unpaid**. Family wants the policy in writing, stored under a new "Documents" admin section. |
| 4 | Tax-rate strategy: **versioned `tax_rates` table** keyed on `effective_year`. No third-party API. December 1 reminder to verify next year's rates. |
| 5 | "Additional Pay" line items will support a typed dropdown (bonus, mileage at IRS rate, accountable reimbursement, etc.) with default-to-taxable behavior. |
| 6 | Push notifications enabled for both admins and the employee (all on iOS 16.4+). |
| 7 | Calendar view: in-app, shows both paystub days and worked hours pulled from the new daily-hours breakdown. |
| 8 | "NYC" was a misnomer; all references are to **NY State + Nassau County**. |
| 9 | Wage-base cap warnings are admin-only. |
| 10 | Year-end PDF packet, CSV export, "same as last week" stub duplication, edit-before-payment-sent — all approved. |
| 11 | Employee-side hours submission feature was **explicitly rejected**. Family tracks hours, not the employee. |

---

## Phasing

### Phase 0 — Compliance hot-fix (THIS WEEK, before first stub)

**Status: COMPLETE on 2026-05-05.** Migration `0001_phase0_compliance` applied via Supabase MCP. Build green.

**Goal:** correct underlying tax-constant bug and bring the paystub PDF into NY § 195(3) compliance before any real money moves.

- [x] Fix `SUTA_WAGE_BASE` 17600 → 13000 in `src/lib/tax.ts`
- [x] Add `SS_WAGE_BASE = 184500` defensive cap on FICA SS calculation
- [x] Add `PFL_ANNUAL_CAP = 411.91` defensive cap on PFL withholding
- [x] Add `IRS_MILEAGE_RATE = 0.725` constant (used Phase 2 onward)
- [x] Add `employer_phone` column to `settings` table (migration + schema.sql)
- [x] Add `employer_phone` to `Settings` type + SettingsForm
- [x] Add `employer_phone` to PaystubDocument header
- [x] Add OT Rate (= hourly_rate × 1.5) and OT Hours (= 0 until Phase 3) rows to PaystubDocument
- [x] Update `onboarding_checklist` seed: add LS-59 Wage Notice item; tighten PFL Waiver item; add "Print, sign, and file Sick Leave Policy" item
- [x] Update `CLAUDE.md` — correct SUTA value, add Documents nav tab, refresh tax constants table
- [x] Create `/documents` admin route + nav tab (6th tab "Docs")
- [x] Draft sick-leave policy as printable component at `/documents/sick-leave-policy`
- [x] Apply migration `0001_phase0_compliance` to remote Supabase
- [x] Lint + build clean

**Out of scope for Phase 0 (deferred):** OT *calculation* logic (Phase 3); sick-day usage tracking (Phase 3); NYC tax handling (not applicable); migration to versioned `tax_rates` table (Phase 1).

**User TODO from Phase 0** (tracked in the in-app onboarding checklist):
- Fill in `employer_phone` in Settings (form now has the field).
- Print the Sick Leave Policy from Documents → Sick Leave Policy, sign with employee, scan, and commit to `/docs/signed/sick-leave-policy.pdf`.

---

### Phase 1 — Tax-year versioning + Quarterly filing data

**Status: COMPLETE on 2026-05-05.** Migration `0002_phase1_tax_versioning_and_filings.sql` written; user to apply via MCP. Build green.

**Goal:** make tax constants year-aware so the app stays correct across calendar boundaries, and surface the exact numbers needed to file NYS-45 each quarter.

- [x] `tax_rates` table keyed on `effective_year`; columns mirror current `lib/tax.ts` constants plus `irs_mileage_rate` and `pfl_annual_cap`
- [x] Seed with 2026 row + leave 2027 empty
- [x] Refactor `calculateTaxes` to look up rates by `pay_date` year — falls back to most-recent populated year with a console warning (`getTaxRatesForYear` in `lib/tax.ts`)
- [x] Settings UI: read-only "Tax Rates for [year]" panel showing what's in the DB
- [x] December 1 reminder: "Verify 2027 tax rates" — auto-rolls forward each year via existing reminder dismiss logic
- [x] `/filings/nys-45/[year]/[quarter]` view (admin only) with copy-to-clipboard for each NYS-45 box value, plus a "Mark filed on YYYY-MM-DD" toggle and free-text confirmation field
- [x] Historical view via `/filings` landing page — lists every quarter back to first stub year
- [x] `/filings/schedule-h/[year]` view: year-end Schedule H worksheet (Lines 1a/1b, 2a/2b, 5, 6, 7, 8, 9 — single-state Section A)
- [x] Dashboard card: "Q[X] filing window opens in Y days" / "Q[X] data ready to file" (`NextFilingCard` on admin dashboard)
- [x] Bonus: Reminders page deep-links each NYS-45 / Schedule H reminder to its corresponding `/filings` detail view (replaces the old external links)
- [x] Bonus: `filings` table tracks `filed_on`, `confirmation`, `notes` per filing — permanent audit record separate from the reminders system

NY State tax quarters align with federal: Q1 Jan–Mar (due Apr 30), Q2 Apr–Jun (due Jul 31), Q3 Jul–Sep (due Oct 31), Q4 Oct–Dec (due Jan 31). Persad family's Q2 2026 will be the first filing.

**User TODO from Phase 1:**
- Apply migration `0002_phase1_tax_versioning_and_filings.sql` to the remote Supabase project (or ask Claude to apply it via MCP).

---

### Phase 2 — Additional pay + edits + audit log

**Status: COMPLETE on 2026-05-05.** Migration `0003_phase2_line_items_and_audit.sql` written; user to apply via MCP. Build green.

**Goal:** support real-world payment scenarios beyond `hours × rate` and make the app forensically defensible.

- [x] `paystub_line_items` table: `paystub_id, line_type, label, amount, taxable_fed, taxable_fica, taxable_ny, w2_box1, informational_only, sort_order`
- [x] Add Additional Pay UI section to `NewStubForm` with 11 dropdown options (registry in `lib/line-items.ts`, sources cited inline):
  - Bonus (taxable)
  - Holiday pay (taxable, regular wages)
  - Sick / PTO pay (taxable, regular wages)
  - Mileage reimbursement at IRS standard rate (non-taxable, accountable plan, miles × auto-calculated rate)
  - Mileage reimbursement above IRS standard rate (excess only, taxable)
  - Receipted expense reimbursement, accountable plan (non-taxable)
  - Flat expense allowance, non-accountable plan (taxable)
  - Cash gift / thank-you (taxable — cash is never de minimis)
  - Gift card, any amount (taxable — gift cards are cash-equivalent)
  - Occasional overtime meal money (non-taxable, only when triggered by OT)
  - Third-party tip (informational only, not employer wages, not on W-2)
- [x] Default new line items to a taxable type; non-taxable selections show a confirmation modal explaining the substantiation requirement
- [x] Tax calculation pulls `taxable_*` flags per line item — taxable additions roll into `gross_pay`; non-taxable reimbursements add to net pay only; informational items don't move money
- [x] Display line items on PaystubDocument PDF + StubDetail page (Earnings, Reimbursements, and admin-only Informational sections)
- [x] Allow editing stubs while `payment_sent = false`; lock once paid (`/stubs/[id]/edit` route + Edit button on detail)
- [x] `audit_log` table + Postgres `audit_trigger` function attached to paystubs, paystub_line_items, settings, w2s — captures actor, action, before/after JSON
- [x] Settings Change History UI at `/settings/history` — field-level diff, actor name, timestamp
- [x] Wage-base cap progress card on stub generation showing FUTA / NY SUTA / SS YTD progress with color-coded "approaching" and "reached" states

**User TODO from Phase 2:**
- Apply migration `0003_phase2_line_items_and_audit.sql` to the remote Supabase project.

---

### Phase 3 — Sick leave usage + OT support

**Status: COMPLETE on 2026-05-05.** Migration `0006_phase3_overtime_and_sick_leave.sql` applied via MCP. Build green.

**Goal:** track sick-leave usage for the on-demand summary requirement and add legally-required OT calculation.

- [x] Add `reason` column to paystubs: enum-like text, nullable, applies primarily to zero-hour weeks (`week_off`, `sick_unpaid`, `vacation_unpaid`, `holiday_unpaid`, `other`). DB check constraint enforces the enum.
- [x] On NewStubForm, when `hours_worked = 0`, surface a reason dropdown
- [x] Added `sick_hours` numeric column on paystubs — admin enters hours when picking `Sick — unpaid`. Sums per year drive the summary.
- [x] Documents page: "Sick Leave Summary" entry → `/documents/sick-leave-summary?year=YYYY` rendering a print-friendly summary listing each stub with `sick_hours > 0`, total hours, NY § 196-b(4) statutory note, signature lines.
- [x] OT support:
  - Stored as `overtime_hours numeric` on paystubs (default 0); regular hours derived as `hours_worked - overtime_hours`.
  - Auto-suggest split when total > 40 hrs (NY threshold for non-residential domestic workers per Labor Law Art. 19, § 170). Admin override via input.
  - OT rate = `hourly_rate × 1.5`. OT pay rolls into `gross_pay` so the existing `calculateTaxes` (which takes total taxable gross) needed no signature change.
- [x] NewStubForm: amber callout appears when total > 40 with the suggested split + override input
- [x] PaystubDocument: renders OT row only when `overtime_hours > 0`. Regular row shows derived `regular_hours` (not full `hours_worked`) when OT exists.
- [x] StubDetail mirrors the same OT treatment, plus surfaces reason and sick hours on zero-hour stubs.
- [x] Audit log captures every paystubs row change automatically (Phase 2 trigger), so manual OT overrides land in `audit_log` for free.

**User TODO from Phase 3:**
- Apply migration `0006_phase3_overtime_and_sick_leave.sql` to remote Supabase (already applied via MCP on 2026-05-05).

---

### Phase 4 — Convenience features

**Goal:** quality-of-life improvements once the app is legally airtight.

- [ ] "Same as last week" duplicate-stub action on Pay Stubs list
- [ ] PWA push notifications (web push) for:
  - Admin: "It's Friday — generate this week's stub" (configurable day)
  - Admin: "Stub generated, payment not sent after 24 hrs"
  - Employee: "New paystub from Persad Pay"
  - Both: filing reminder fires (replaces some email noise)
- [ ] Year-end PDF packet: single PDF with all stubs + W-2 + employer-tax summary + Schedule H worksheet — one-click for accountant handoff
- [ ] CSV export: `/stubs/export?year=YYYY` → all stub fields, one row per stub
- [ ] In-app calendar view (admin only initially): month grid showing paystubs and worked hours from the persisted daily breakdown
- [ ] Quarterly tax payment confirmation tracking: per-quarter "We paid $X on YYYY-MM-DD" record with reference number
- [ ] iCal feed `/api/calendar/reminders.ics` — optional, deprioritized in favor of in-app calendar
- [ ] Signed document upload (redundancy copy of physical originals)
  - **Primary storage of physical originals:** fire-safe lock box at the user's home. The in-app upload is intentionally a *secondary* backup, not the system of record — if Supabase ever goes away, the legal originals are still safe.
  - Supabase Storage bucket `signed-documents`, admin-only RLS (free tier covers ~5–10 PDFs over the employee's lifetime, well under the 1 GB limit).
  - New `signed_documents` table tracking one row per document_type (LS-59, PFL-Waiver, Sick Leave Policy, W-4, IT-2104, Sick Leave Summary acknowledgment) with file_path, uploaded_at, uploaded_by, optional notes. Re-upload replaces the current version.
  - `/documents` index gets an "Upload signed copy" action per document. Each card shows status (Unsigned vs. Signed on YYYY-MM-DD) with a download link.
- [ ] W-4 / IT-2104 withholding capture (Option A — link to canonical sources)
  - **Why:** when the babysitter submits or updates her W-4 or IT-2104, capture the form values + the resulting per-period withholding amount so settings.federal_withholding_per_period and settings.state_withholding_per_period stay current and auditable. Paired with the signed-doc upload above so the actual signed PDF lives in Supabase Storage.
  - **Why Option A** (link out, don't compute): at this income (~$10K/yr) federal will be $0 and NY will be $0–2/wk no matter what. Building Pub 15-T + NYS-50-T table lookups in code adds maintenance burden (annual updates) for a number that's near zero. Delegating to the IRS estimator + the NY DTF publication keeps us out of the math business.
  - New `withholding_forms` table — one row per form_type ('W-4' | 'IT-2104'), with the captured field values as jsonb, computed per-period dollar amount, computed_at timestamp, computed_against_gross numeric (so we can warn when settings change), uploaded by, notes. Existing audit trigger covers it for free.
  - New `/settings/withholding-forms` admin page with two cards:
    - **W-4 card:** filing status, Step 2 multiple-jobs box, Step 3 dependents $, Step 4a/4b/4c amounts. "Compute via IRS estimator" button opens [irs.gov/individuals/tax-withholding-estimator](https://www.irs.gov/individuals/tax-withholding-estimator) in a new tab with an inline note showing her current expected gross/wk so the admin knows what to enter. Field to paste the per-period amount the estimator returns. Save updates `settings.federal_withholding_per_period`.
    - **IT-2104 card:** total allowances, additional withholding $/period. "Open Pub NYS-50-T (NY tax tables)" button opens the current-year PDF on tax.ny.gov with an inline note showing her gross/wk + filing status so the admin knows which row to look up. Field to paste the looked-up amount. Save updates `settings.state_withholding_per_period`.
  - Last-computed timestamp on each card; warning banner if `employee_hourly_rate` × expected hours has changed since last computation ("re-run with the new gross to be safe").
  - No tax-engine refactor — settings stays the source of truth for per-period dollar amounts; this feature is a smart UI for keeping those amounts current.

---

## Working norms

- Every tax / labor-law code change must include the source URL in the commit message. See `memory/feedback_tax_accuracy.md`.
- Tax constants are tagged with the year they apply to in inline comments; verify each January.
- Run `npm run lint` and `npm run build` before claiming a phase complete.
- Schema changes go through `supabase/migrations/NNNN_description.sql` AND mirror into `supabase/schema.sql` for fresh installs. The user reviews and applies migrations themselves; do NOT auto-apply via MCP without explicit approval each time.
- Branch protection / PR norms TBD — solo project, direct commits to `main` for now.

---

## How to resume work mid-phase

1. Run `git log --oneline -20` to see what's already shipped.
2. Open this file. Find the first unchecked box `- [ ]` in the active phase. That's your next task.
3. Check `memory/MEMORY.md` for any user feedback added since last session.
4. Update the relevant box to `- [x]` as you complete each item — do not batch.
5. When a phase fully lands, write a short "Phase N complete on YYYY-MM-DD — see commit XXXX" line under that phase header.
