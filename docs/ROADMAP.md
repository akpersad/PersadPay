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

**Split into 3 PRs:** 4a (HR setup core), 4b (year-end + reporting), 4c (PWA push). iCal feed deprioritized.

#### Phase 4a — HR setup core

**Status: COMPLETE on 2026-05-05.** Migration `0008_phase4a_signed_documents_and_withholding_forms.sql` applied via MCP.

- [x] "Same as last week" duplicate-stub action — `/stubs/new?duplicate=stub_id` pre-fills hours / rate / line items from the source stub; dates roll forward by one week. Triggered from a "Duplicate as next week" button on the stub detail page.
- [x] CSV export — `/api/stubs/export?year=YYYY` returns all stub fields. Year picker + button on `/stubs` list (admin only).
- [x] Signed document upload (Phase 4a delivered)
- [x] W-4 / IT-2104 withholding capture (Phase 4a delivered)
- [x] HYSA transfer tracking — per-stub workflow step after Mark Payment Sent → Email Paystub. Admin sees a "HYSA Transfer" card on the stub detail page summing all employee withholdings + employer taxes (= every dollar that should move to the high-yield savings account before the next quarterly filing). Mark button + status badge ("HYSA pending" / "HYSA funded"). Status piggy-bank icon added to Recent Stubs on the dashboard and the `/stubs` list. Migration `0009_phase4a_hysa_transfer.sql` adds `hysa_transferred`, `hysa_transferred_at`, `hysa_notes` to paystubs.

#### Phase 4b — "Everything I need to do is in the app"

**Status: COMPLETE on 2026-05-06.** Migration `0010_phase4b_federal_estimated_tax_and_reminders.sql` applied via MCP. Build green. In-app calendar view deferred to Phase 4d (requires daily-hours persistence backfill — separate concern).

**Federal — quarterly + annual**
- [x] Federal quarterly estimated tax view at `/filings/federal-estimated-tax/[year]/[quarter]` — per-quarter Schedule H slice with copy chips, Mark-paid form, deep-links to IRS Direct Pay + EFTPS.
- [x] Auto-seeded federal estimated tax reminders for Apr 15 / Jun 15 / Sep 15 / Jan 15 of next year.
- [x] W-3 Transmittal PDF (`/api/pdf/w3?id=...`) admin-only, linked from `/w2` and the year-end view. Jan 31 W-2/W-3 reminder seeded.
- [x] Weekend/holiday deadline shifting (`shiftedDeadline()` in `lib/dates.ts`) applied across filing detail views and reminder cards. Federal holidays for 2025–2027.

**NY State**
- [x] NYS-45 quarterly (Phase 1 ✅)
- [x] Schedule H annual (Phase 1 ✅)
- [x] DBL/PFL coverage threshold watch — banner on admin dashboard when 6-month rolling avg hits 20 hrs/wk OR last-52-weeks stub count hits 175 (proxy for 175 days; daily-hours backfill in Phase 4d will sharpen this). Silent at 9 hrs/wk per memory.
- [x] SUTA rate annual update reminder seeded for early February.

**Reminders surface live amounts**
- [x] `/reminders` server-fetches all stubs + tax rates and runs the matching filing math per reminder. NYS-45 / Schedule H / Federal Estimated Tax reminders show `$X.XX · pays <agency>` inline. Plain reminders unaffected. Weekend-shifted dates display the next business day with a "shifted from..." note.

**Year-end + reporting**
- [x] `/api/pdf/year-end-packet?year=YYYY` — accountant PDF: cover, summary, Schedule H box totals, W-2 box totals, every-paystub table with year totals. Linked from year-end view + `/filings` listing for past years. Note: not a literal merge of every stub PDF (would need pdf-lib); detail PDFs available individually at `/api/pdf/stub`, `/api/pdf/w2`, `/api/pdf/w3`.
- [x] Consolidated `/filings/year-end/[year]` view showing W-2/W-3/Schedule H deadlines + accountant packet download.
- [ ] **Deferred to Phase 4d** — In-app calendar view requires daily-hours persistence backfill.

**Onboarding additions**
- [x] Workers' Comp recommended note seeded.

**Defensive guards**
- [x] Stub deletion guard renders an explanation card (replacing the Delete button) when `stub_sent = true` OR `hysa_transferred = true`.

#### Phase 4d — In-app calendar (deferred from 4b)

**Status: COMPLETE on 2026-05-06.** Migration `0012_phase4d_daily_hours.sql` written; user to apply via MCP. Build green.

- [x] Daily-hours backfill: persist the per-day breakdown when admin uses daily-entry mode in the stub form (currently summed and discarded). New `daily_hours jsonb` column on paystubs.
- [x] Calendar view: month grid at `/calendar` showing paystubs (color-coded by payment/email status) + per-day worked hours from the new persisted breakdown. Linked from the Stubs list page. Admin-only.
- [x] Sharpens the DBL/PFL coverage watch: uses actual calendar days from `daily_hours` when available; falls back to stub-count proxy for legacy stubs.

#### Phase 4c — PWA push notifications

**Status: COMPLETE on 2026-05-06.** Migration `0011_phase4c_push_subscriptions.sql` applied via MCP. Build green.

- [x] VAPID keypair generated; user adds `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` to `.env.local` + Vercel env.
- [x] Service worker (`public/sw.js`) extended with `push` + `notificationclick` handlers. Reuses existing registration in `ServiceWorkerRegistration.tsx`.
- [x] `push_subscriptions` table — one row per device per user, unique on endpoint, audit-logged. Users manage own; admins read all.
- [x] `lib/push-client.ts` — request permission, subscribe via SW, POST to `/api/push/subscribe`. Unsubscribe likewise.
- [x] `lib/push-server.ts` — `sendPushToUsers(supabase, ids, payload)` and `sendPushToRoles(...)`. Auto-prunes 410/404 subscriptions. No-ops cleanly when VAPID env missing.
- [x] `/api/push/subscribe` POST + DELETE.
- [x] Settings page (admin) + employee dashboard get a Push Notifications card with a per-device toggle.
- [x] Triggers wired into the existing daily Vercel cron (`/api/reminders/send-emails`):
  - **Friday admin nudge** — fires when no paystub yet covers the current week.
  - **Payment-not-sent nag** — fires for any stub created >24h ago with `payment_sent = false`.
  - **Filing reminders** — push mirrors the existing email at the 20-day and 10-day marks.
- [x] **Employee new paystub** — push fires inside `/api/email/stub` whenever the admin emails a stub.

#### Skipped

- iCal feed `/api/calendar/reminders.ics` — explicit deprioritization in spec; in-app calendar (4b) + push (4c) cover the use case.

---

### Phase 5 — HYSA ledger + reconciliation

**Status: COMPLETE on 2026-05-06.** Migration `0013_phase5_hysa_ledger.sql` written; user to apply via MCP. Build green.

**Goal:** every dollar in and out of the HYSA is accounted for in the app, so a discrepancy between what the app expects and what the bank actually shows can be flagged and audited at a glance. Closes the loop on the per-stub HYSA workflow that landed in Phase 4a.

**Schema**
- [x] `hysa_transactions` table: id, transaction_type, amount, paystub_id (FK, nullable), filing_id (FK, nullable), effective_date, notes, actor_id, created_at. Audit-logged via the existing `audit_trigger` function. Admin-only RLS.
- [x] `transaction_type` enum-text: `deposit_paystub` | `deposit_manual` | `withdrawal_filing` | `withdrawal_manual` | `balance_correction`. Constraint: deposit types have positive amount, withdrawal types have negative amount, correction can be either signed.
- [x] Settings additions: `hysa_actual_balance numeric` + `hysa_actual_balance_at timestamptz` for the most-recent admin-entered actual bank balance.

**Auto-flow (no manual entry needed)**
- [x] When admin marks a stub HYSA-funded, insert a `deposit_paystub` row with `amount = hysaAmountForStub(stub).total` and FK to the stub. "Undo" button reverses the paystub update + deletes the transaction.
- [x] When admin marks a filing as filed, insert a `withdrawal_filing` row with `amount = -<filing's computed amount>` and FK to the filing. NYS-45 uses Box 5 + Box 15. Federal Estimated Tax uses total_due. Schedule H uses total_household_employment_taxes.
- [x] When admin edits/re-saves a filing, the existing withdrawal is deleted and a fresh one inserted (upsert pattern).

**Manual entry**
- [x] `/hysa` admin page with a "Add manual transaction" dialog: type (deposit / withdrawal / balance correction), amount, effective date, notes.

**Ledger view**
- [x] `/hysa` — running-balance ledger: reverse-chronological list of every transaction with type badge, source link (stub or filing if applicable), running balance column. All transactions shown (no year filter needed at this volume).
- [x] Stat cards: expected balance, actual balance (if reconciled), YTD deposits, YTD withdrawals.

**Reconciliation**
- [x] "Enter actual HYSA balance" form on `/hysa`: admin enters the bank balance + date. App computes expected balance from all transactions and shows the delta.
- [x] If delta != 0: amber banner with discrepancy amount, likely-cause note, and one-click "Record correction" action.
- [x] Dashboard card showing "HYSA Balance: $X · last reconciled date" with amber discrepancy indicator when applicable. Links to `/hysa`.

**Backfill at migration time**
- [x] Migration script generates synthetic `deposit_paystub` transactions for every existing `paystubs.hysa_transferred = true` row. Filing backfill omitted (no filed filings exist yet at first-stub date).

**Running balance strategy**
- Computed dynamically from the `hysa_transactions` table (option a — always accurate). ~100 transactions/year max makes this trivially fast.

**User TODO from Phase 5:**
- Apply migration `0013_phase5_hysa_ledger.sql` to the remote Supabase project.

#### Phase 4a delivery details

##### Signed document upload (redundancy copy of physical originals)
  - **Primary storage of physical originals:** fire-safe lock box at the user's home. The in-app upload is intentionally a *secondary* backup, not the system of record — if Supabase ever goes away, the legal originals are still safe.
  - Supabase Storage bucket `signed-documents`, admin-only RLS (free tier covers ~5–10 PDFs over the employee's lifetime, well under the 1 GB limit).
  - New `signed_documents` table tracking one row per document_type (LS-59, PFL-Waiver, Sick Leave Policy, W-4, IT-2104, Sick Leave Summary acknowledgment) with file_path, uploaded_at, uploaded_by, optional notes. Re-upload replaces the current version.
  - `/documents` index gets an "Upload signed copy" action per document. Each card shows status (Unsigned vs. Signed on YYYY-MM-DD) with a download link.
##### W-4 / IT-2104 withholding capture (Option A — link to canonical sources)
  - **Why:** when the babysitter submits or updates her W-4 or IT-2104, capture the form values + the resulting per-period withholding amount so settings.federal_withholding_per_period and settings.state_withholding_per_period stay current and auditable. Paired with the signed-doc upload above so the actual signed PDF lives in Supabase Storage.
  - **Why Option A** (link out, don't compute): at this income (~$10K/yr) federal will be $0 and NY will be $0–2/wk no matter what. Building Pub 15-T + NYS-50-T table lookups in code adds maintenance burden (annual updates) for a number that's near zero. Delegating to the IRS estimator + the NY DTF publication keeps us out of the math business.
  - New `withholding_forms` table — one row per form_type ('W-4' | 'IT-2104'), with the captured field values as jsonb, computed per-period dollar amount, computed_at timestamp, computed_against_gross numeric (so we can warn when settings change), uploaded by, notes. Existing audit trigger covers it for free.
  - New `/settings/withholding-forms` admin page with two cards:
    - **W-4 card:** filing status, Step 2 multiple-jobs box, Step 3 dependents $, Step 4a/4b/4c amounts. "Compute via IRS estimator" button opens [irs.gov/individuals/tax-withholding-estimator](https://www.irs.gov/individuals/tax-withholding-estimator) in a new tab with an inline note showing her current expected gross/wk so the admin knows what to enter. Field to paste the per-period amount the estimator returns. Save updates `settings.federal_withholding_per_period`.
    - **IT-2104 card:** total allowances, additional withholding $/period. "Open Pub NYS-50-T (NY tax tables)" button opens the current-year PDF on tax.ny.gov with an inline note showing her gross/wk + filing status so the admin knows which row to look up. Field to paste the looked-up amount. Save updates `settings.state_withholding_per_period`.
  - Last-computed timestamp on each card; warning banner if `employee_hourly_rate` × expected hours has changed since last computation ("re-run with the new gross to be safe").
  - No tax-engine refactor — settings stays the source of truth for per-period dollar amounts; this feature is a smart UI for keeping those amounts current.

---

### Phase 6 — Visual polish + brand identity

**Status: COMPLETE on 2026-05-07.**

**Goal:** give the app a real visual identity so it feels like a finished product. Right now the CSS theme is pure grayscale — every `--primary` is near-black. `BRAND_COLOR = '#1a1a2e'` exists but only in the PDFs. Phase 6 wires the palette across the entire UI, audits every colored element for consistency, and locks in the app icon.

---

#### Palette

The brand color is **burnt orange** `#a53005`. The three semantic state colors are deliberately spread across the hue wheel to stay unambiguous next to the primary:

| Token | Light mode | Dark mode | Role | Hue |
|---|---|---|---|---|
| `--primary` | `#a53005` (burnt orange) | `#d4541a` (lighter orange) | Buttons, active nav, focus rings | ~20° |
| `--primary-foreground` | `#ffffff` | `#ffffff` | Text on primary | — |
| `--accent` | `#fdf0eb` (pale orange tint) | `#3d1a0a` (dark tinted orange) | Hover states, subtle highlights | — |
| `--accent-foreground` | `#a53005` | `#f5b99a` | | — |
| Success green | `#16a34a` (green-600) | `#22c55e` (green-500) | Paid badge, HYSA funded, Uploaded | ~140° |
| Warning yellow | `#eab308` (yellow-500) | `#ca8a04` (yellow-600) | HYSA discrepancy, cap warnings | ~85° |
| Destructive | `#be123c` (rose-700) | `#f43f5e` (rose-500) | Delete, error states | ~350° |

**Why this spread:** `#a53005` sits at hue ~20° (orange-red). Amber (~40°) and the shadcn default destructive red (~27°) are both too close. Shifting warning to golden yellow (~85°, 65° gap) and destructive to cooler crimson/rose (~350°, 30° gap but visually distinct because the primary is dark+orange while crimson is brighter+magenta-leaning) keeps all four semantic roles unambiguous.

All other tokens (background, card, border, muted, etc.) stay neutral — only `primary`, `accent`, success, warning, and destructive get color.

---

#### Deliverables

**Color tokens**
- [x] Update `globals.css` `:root` and `.dark` — wire `--primary`, `--primary-foreground`, `--accent`, `--accent-foreground` to the palette above. All in OKLCH.
- [x] Update `manifest.ts` `theme_color` to `#a53005`.
- [x] Update `BRAND_COLOR` in `src/lib/pdf/constants.ts` to `#a53005`; `BRAND_COLOR_LIGHT` to `#fdf0eb`.

**Bottom nav**
- [x] Active tab: already uses `text-primary` + `strokeWidth={2.5}` — auto-updates with the token. No code change needed.

**Badges + status chips**
- [x] Shifted all `amber-*` classes → `yellow-*` globally across all TSX/TS files (17 files). Warning states now at hue ~85° vs primary at ~34° — clear separation. HYSA debit/credit red/green left intact (accounting convention).

**Cards + layout**
- [x] Audited card header padding — standard `pb-2 pt-4` on CardHeader, `py-3 px-4` on list-row CardContent, `pt-4 pb-3 px-3` on stat cards. Consistent; no changes needed.
- [x] Page header area — standard `px-4 pt-6 pb-4 max-w-lg mx-auto` wrapper with `text-lg font-semibold` h1 across all app pages. Consistent; no changes needed.
- [x] Stat cards — three well-defined structures for three different contexts (3-col dashboard, 2-col HYSA, employee single-card). Consistent within each context; no unification needed.

**Typography**
- [x] Evaluated Geist vs. Inter on device — kept Geist. Renders cleanly at mobile sizes; no meaningful difference for this use case.
- [x] Added `font-mono` to all stat card currency values (AdminDashboard YTD Gross, HYSA 4 cards, EmployeeDashboard Gross/Net). Also added to stubs list gross_pay. Replaced raw `.toFixed()` in filings list with `formatCurrency()`.

**PWA icon**
- [x] `icon-192.png`, `icon-512.png`, and `favicon.ico` dropped into `/public` — already referenced by `manifest.ts`.
- [ ] Verify on iOS "Add to Home Screen" after adding icons — confirm safe zone / maskable padding looks correct. (User action required.)

**Dark mode**
- [x] Decision: **keep but don't surface toggle** — system-preference-only. The `.dark` OKLCH token block in `globals.css` is complete and auto-activates with OS dark mode. No toggle needed for a 3-person private app.

**PDF alignment**
- [x] `BRAND_COLOR = '#a53005'` and `BRAND_COLOR_LIGHT = '#fdf0eb'` in `src/lib/pdf/constants.ts` — matches `--primary` light-mode token. No further change needed.

---

#### Out of scope for Phase 6
- Animations / transitions beyond what shadcn provides out of the box.
- Custom illustrations or decorative graphics.
- Per-user theme preferences.

---

### Phase 7 — TOTP / Authenticator App MFA

**Status: COMPLETE on 2026-05-07.**

**Goal:** add a second factor to every login using Supabase's built-in TOTP MFA (free on all plans). All three users — both admins and the employee — must enroll before they can access the app. This closes the biggest remaining security gap for a household payroll app that contains EINs, SSNs, and financial data.

---

#### Supabase configuration

- [ ] **User action required:** Enable TOTP MFA in the Supabase dashboard: **Authentication → Sign In / Up → Multi-Factor Authentication → Enable TOTP**. No code change needed — deploy this branch first, then enable in the console. Once enabled, all users will be redirected to `/auth/enroll-mfa` on next login.

---

#### Enrollment flow

- [x] On first login after MFA is enabled, any user whose session has no enrolled TOTP factor is redirected to `/auth/enroll-mfa` before reaching `/dashboard`. Middleware uses `getAuthenticatorAssuranceLevel()` — if both `currentLevel` and `nextLevel` are `aal1`, no factor is enrolled.
- [x] `/auth/enroll-mfa` page renders:
  - A QR code (from `supabase.auth.mfa.enroll()`) for scanning with Google Authenticator, Authy, etc.
  - A manual entry secret (the plain-text seed) for users who can't scan, with a copy button.
  - A 6-digit TOTP input + **Verify & Enable** button — calls `supabase.auth.mfa.challengeAndVerify()`.
  - On success: user is fully enrolled; redirect to `/dashboard`.
  - Graceful error if Supabase MFA is not yet enabled in the dashboard.
- [x] Middleware (`proxy.ts`) updated: after confirming session validity, checks AAL. `aal1 → aal2` redirects to `/auth/verify-mfa`. Both `aal1` redirects to `/auth/enroll-mfa`. `aal2` proceeds normally. API routes and public paths bypass the check.

#### Verification flow (subsequent logins)

- [x] `/auth/verify-mfa` page renders after a successful password login:
  - 6-digit TOTP input with autoFocus.
  - **Verify** button — calls `supabase.auth.mfa.challengeAndVerify()`.
  - On success: redirect to `/dashboard`.
  - On failure: inline error.

#### MFA management (authenticated users)

- [x] Each user can unenroll and re-enroll their own authenticator from a **Security** section (`MfaSecurityCard` component):
  - Admins: `/settings` page has the Security card.
  - Employee: dashboard has the Security card.
- [x] Unenroll action requires the user to enter a valid TOTP code before removing the factor — calls `supabase.auth.mfa.challengeAndVerify()` then `supabase.auth.mfa.unenroll()`. Unenrolled users are immediately redirected to `/auth/enroll-mfa`.
- [x] Re-enroll follows the same QR + verify flow as initial enrollment (navigates to `/auth/enroll-mfa`).

#### Admin visibility

- [x] Settings page: read-only **MFA Status** panel (`MfaStatusPanel` component) showing each user (by name + role) and whether they have a verified TOTP factor. Sourced from `supabase.auth.admin.listUsers()` → `factors` array. Admin-only, server-rendered.

---

#### Out of scope for Phase 7

- SMS MFA (requires paid Supabase add-on — $75/month).
- Recovery codes (Supabase does not expose these for TOTP in the free tier; advise users to save their QR seed in a password manager).
- Per-user MFA enforcement toggle (all-or-nothing for this 3-person app).

---

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
