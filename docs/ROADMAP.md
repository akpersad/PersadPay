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

**Goal:** support real-world payment scenarios beyond `hours × rate` and make the app forensically defensible.

- [ ] `paystub_line_items` table: `paystub_id, type, label, amount, taxable_fed, taxable_fica, taxable_ny, w2_box1`
- [ ] Add Additional Pay UI section to `NewStubForm` with dropdown options (verdicts and source citations are in the codebase comment block in `lib/tax.ts` after Phase 2 lands):
  - Bonus (taxable)
  - Holiday pay (taxable, regular wages)
  - Sick / PTO pay (taxable, regular wages)
  - Mileage reimbursement at IRS standard rate (non-taxable, accountable plan)
  - Mileage reimbursement above IRS standard rate (excess only, taxable)
  - Receipted expense reimbursement, accountable plan (non-taxable)
  - Flat expense allowance, non-accountable plan (taxable)
  - Cash gift / thank-you (taxable — cash is never de minimis)
  - Gift card, any amount (taxable — gift cards are cash-equivalent)
  - Occasional overtime meal money (non-taxable, only when triggered by OT)
  - Third-party tip (informational only, not employer wages, not on W-2)
- [ ] Default new line items to a taxable type; non-taxable selections show a confirmation modal explaining the substantiation requirement
- [ ] Tax calculation pulls `taxable_*` flags per line item — only adds taxable line items to the FICA/fed/state base
- [ ] Display line items on PaystubDocument PDF
- [ ] Allow editing stubs while `payment_sent = false`; lock once paid
- [ ] `audit_log` table + Postgres triggers on paystubs, settings, paystub_line_items, w2s — captures actor, action, before/after JSON
- [ ] Settings Change History UI subview (filtered audit_log on settings table)
- [ ] Wage-base cap warning banners on stub generation for FUTA, SUTA, SS

---

### Phase 3 — Sick leave usage + OT support

**Goal:** track sick-leave usage for the on-demand summary requirement and add legally-required OT calculation.

- [ ] Add `reason` column to paystubs: enum-like text, nullable, applies primarily to zero-hour weeks (`Week off`, `Sick — unpaid`, `Vacation — unpaid`, `Holiday — unpaid`, `Other`). Non-zero-hour stubs default to null.
- [ ] On NewStubForm, when `hours_worked = 0`, surface a reason dropdown
- [ ] Add `sick_hours_taken` calculated column or query helper: SUM zero-hour stubs flagged `Sick — unpaid` per year
- [ ] Documents page: button "Generate sick-leave summary for [year]" → PDF showing sick-leave hours used and the policy stance (unlimited unpaid)
- [ ] OT calculation in `calculateTaxes`:
  - Add `regular_hours` and `overtime_hours` to TaxInputs
  - OT trigger: `total_hours > 40` → split into 40 regular + remainder OT
  - OT rate = `hourly_rate × 1.5`
  - Add `overtime_hours`, `overtime_rate`, `overtime_pay` to `paystubs` and `TaxResult`
- [ ] NewStubForm: detect when daily total >40, prompt "X hours over 40 — calculate overtime?" and split automatically
- [ ] PaystubDocument: when `overtime_hours > 0`, show real OT line above regular line
- [ ] Audit log captures any manual OT override

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
