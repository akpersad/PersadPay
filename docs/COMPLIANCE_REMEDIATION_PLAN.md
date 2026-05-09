# Persad Pay — Compliance Remediation Plan

> **Reading this with no prior context?** That's the design. Each phase is self-contained. Read the **Project Context** + **Decisions Already Made** sections, then jump to the phase you've been asked to implement.

**Audit date:** 2026-05-07
**Author of plan:** Claude (Opus 4.7) after a 6-agent independent audit

**Current status (updated 2026-05-08):**
- Phase 12 — DONE. Branch `verify-calcs` → merged to `main` as PR #18 (`99ec76b`).
- Phase 13 — DONE. Branch `feature/phase13-onboarding-forms` → open PR to `main` (6 commits, `f6db572`–`ca9c329`).
- Phase 14 — NEXT. Branch off `main` after Phase 13 PR merges.

**Branching:** Each phase gets a fresh branch off `main`.
- Phase 12: `verify-calcs` (merged)
- Phase 13: `feature/phase13-onboarding-forms` (ready to merge)
- Phase 14: `feature/phase14-infra-tests` (not started — create when starting)

---

## Project Context (read first, every phase)

- **Repo root:** `/Users/apersad/Documents/Development/PersonalProjects/persadpay`
- **Spec:** `CLAUDE.md` at repo root + `AGENTS.md`. Note `AGENTS.md` warns Next.js APIs may differ from training data — the file convention is `proxy.ts` (not `middleware.ts`); read `node_modules/next/dist/docs/` if a Next.js API behaves unexpectedly.
- **Tech stack:** Next.js (App Router), Supabase (Postgres + Auth + RLS), Resend, `@react-pdf/renderer`, Tailwind + shadcn/ui, Vercel deployment.
- **Tax constants live in** `supabase/migrations/0002_phase1_tax_versioning_and_filings.sql` and the `tax_rates` table — `src/lib/tax.ts` reads from there. `CLAUDE.md` mirrors values for documentation but is not canonical.
- **Migrations:** apply via Supabase MCP without confirmation per user preference (memory `feedback_supabase_migrations`).
- **Commits:** split logically; never auto-commit; finish work and wait for explicit commit instruction (memories `feedback_commit_style`, `feedback_no_auto_commit`).

### Employee facts (single household employee — entire app is sized for this)

- **Babysitter, 18+, unrelated to employer**
- Works in employer's Nassau County, NY home
- $22/hr × 9 hrs/week = $198/week (~$10,296/year, ~$2,574/quarter)
- Starting fresh — no 2026 wages paid before app launch
- Unlimited (paid) sick time policy
- First official paycheck: week of 2026-05-12 (or whenever paperwork is signed)
- **No paperwork on file at audit time** — W-4, IT-2104, LS-59, PFL Waiver, sick-leave acknowledgement, I-9, sexual-harassment policy/training all to be completed before first paycheck

### Key facts that drive the design

| Fact | Implication |
|---|---|
| 9 hrs/week, single private home | NY DBL (SDI) does NOT cover (<20 hrs/wk threshold) → no SDI deduction |
| 9 hrs/week × 52 = 468 hrs/yr ≈ 52 days/yr | NY PFL does NOT cover (<20 hrs/wk AND <175 days/52 wks) → no PFL deduction |
| <40 hrs/week live-out | Workers' Comp not required (voluntary, user has chosen no) |
| Nassau County | Not NYC, not Yonkers, not in MCTMT employer threshold (~$312,500/qtr); none of those taxes apply |
| Annual gross ~$10,296 | Above FICA household threshold ($3,000 in 2026); above FUTA quarterly threshold ($1,000); below SS wage base ($184,500); will hit FUTA wage base ($7,000) mid-year; below SUTA wage base ($17,600) |

---

## Decisions Already Made (do not re-litigate)

The user has made these calls. Implement directly.

1. **App is single-employee-only.** Entire UI/data model defaults to *her* situation. No multi-employee scaling — per-employee settings are not needed. Defaults like SDI off, PFL off live in `settings`, not on a per-employee row.
2. **SDI deduction defaults to OFF.** She is not covered. Add a flag (default false), gate the calc, snapshot on stub.
3. **PFL deduction defaults to OFF.** Same reasoning. Replace `pfl_waived` (deduct unless waived) with `pfl_covered` (deduct only if covered).
4. **Federal income tax withholding: $0.** User opts to pay all federal tax via Schedule H + 1040-ES (or W-4 from day job). Settings default for `federal_withholding_per_period = 0`. Same UI/copy.
5. **NY state income tax withholding: $0.** Same logic.
6. **W-2 filing: SSA BSO e-file** (not paper). PDF in app stays as Copy B/C/2/D + worksheet, not Copy A. Pub 1141 form-fidelity rules apply only to paper Copy A → relaxed.
7. **SSN never stored in app.** PDF Box a is a writable blank ("____-__-____"). User hand-writes SSN on each printed copy before distribution. Type SSN directly into BSO when e-filing.
8. **OT rate display:** small header note near regular rate ("Overtime rate after 40 hrs/wk: $33.00/hr") on every stub. Earnings-table OT row only when OT > 0. Satisfies NY § 195(3) without polluting normal weeks.
9. **Workers' Comp policy:** none (voluntary, declined by user).
10. **Resend `FROM` address:** stays on `onboarding@resend.dev` until `persadpay.com` is purchased and verified at Resend (existing onboarding step #10 tracks this).
11. **Credentials posted in chat:** already rotated by user. No code action.
12. **Annual sexual-harassment-training cadence:** calendar year (every January) per NY DOL FAQ "at least once each year".

---

## What's Verified Correct (skip re-auditing)

These were independently confirmed by the audit against primary sources. Don't change them.

| Item | Value | Verified source |
|---|---|---|
| FICA SS rate | 6.2% (employee + employer) | IRS Pub 926 (2026) |
| FICA Medicare rate | 1.45% (employee + employer), no cap | IRS Pub 926 (2026) |
| 2026 SS wage base | $184,500 | IRS Pub 926 (2026) |
| FUTA rate (NY) | 0.6% — NY not on 2025 final list, not on 2026 potential list | DOL FUTA credit-reduction page |
| FUTA wage base | $7,000 | IRS Pub 926 (2026) |
| FUTA quarterly trigger | $1,000+ in any quarter | IRS Pub 926 (2026), Table 1 |
| **NY SUTA wage base 2026 = $17,600** | Per NYS-50 (tax.ny.gov/forms/publications/wt/nys50.htm). Permanent formula change from 2026: 18% of state average annual wage. NY's historical wage bases never reached $13,000 (2025 = $12,800, 2024 = $12,500); the $13,000 figure that briefly appeared in earlier docs was a misread caught by pre-launch audit B1 (Agent 21). | NYS-50 publication |
| **IRS standard mileage rate 2026 = $0.725** | Confirmed; up 2.5¢ from 2025's $0.70 | IRS Notice 2026-10 |
| NY PFL rate 2026 | 0.432% (rate when covered) | paidfamilyleave.ny.gov/2026 |
| NY PFL annual cap 2026 | $411.91 | paidfamilyleave.ny.gov/2026 |
| NY SDI rate / cap | 0.5% / $0.60 weekly (when covered) | NY DBL § 209 |
| FICA household-employee cash threshold 2026 | **$3,000** (note: code currently has $2,800 — fix in Phase 12) | IRS Pub 926 (2026) Table 1 |
| Schedule H (not 940/941) is the right form | — | IRS Pub 926 (2026) |
| W-2/W-3 deadline 2026 → Feb 1, 2027 | (Jan 31 falls Sunday) | IRS Pub 926 (2026) |
| Pay-date determines tax year | code uses `pay_date` everywhere ✓ | IRS constructive receipt |
| RLS coverage on every table | Verified ✓ | code review |
| Auth uses `getUser()` not `getSession()` | Verified ✓ | Supabase guidance |
| Stub workflow gates | Verified ✓ | spec |
| Reminder cron 20-day + 10-day rules | Verified ✓ | spec |
| Pay frequency weekly satisfies NY § 191 | ✓ | NY § 191 |
| OT @ 1.5× after 40 hrs (non-residential live-out) | ✓ | DWBR / 12 NYCRR § 142-2.2 |
| MCTMT/NYC/Yonkers not applicable | ✓ | Nassau, under threshold |
| Workers' Comp not required at <40 hrs/wk live-out | ✓ | WCB household-employer page |
| Sick-leave: small-employer 40 unpaid tier; "unlimited" satisfies | ✓ | NY § 196-b(1)(a) |

---

## Source-of-truth links (use these, not training data)

- IRS Publication 926 (Household Employer's Tax Guide): https://www.irs.gov/publications/p926
- IRS W-2/W-3 Instructions: https://www.irs.gov/pub/irs-pdf/iw2w3.pdf
- IRS Pub 1141 (substitute W-2 forms): https://www.irs.gov/pub/irs-pdf/p1141.pdf
- IRS Notice 2026-10 (mileage rates): https://www.irs.gov/pub/irs-drop/n-26-10.pdf
- USCIS Form I-9: https://www.uscis.gov/i-9
- NY Labor Law § 195: https://www.nysenate.gov/legislation/laws/LAB/195
- NY Labor Law § 196-b (paid sick leave): https://www.nysenate.gov/legislation/laws/LAB/196-B
- NY Labor Law § 161 (day of rest): https://www.nysenate.gov/legislation/laws/LAB/161
- NY DOL LS-49 sample wage statement: https://dol.ny.gov/system/files/documents/2022/12/ls49.pdf
- NY DOL LS-59 hourly-rate wage notice: https://dol.ny.gov/system/files/documents/2022/02/ls59.pdf
- NY DOL Domestic Workers page: https://dol.ny.gov/domestic-workers-bill-rights
- NY DOL Sick Leave FAQ: https://dol.ny.gov/system/files/documents/2021/01/sickleavefaq_1-20-21.pdf
- NY WCB Household Employers (DBL/PFL): https://www.wcb.ny.gov/content/main/coverage-requirements-db/household-employers.jsp
- NY WCB Household Employers (Workers' Comp): https://www.wcb.ny.gov/content/main/coverage-requirements-wc/household-employers.jsp
- NY PFL eligibility: https://paidfamilyleave.ny.gov/eligibility
- NY PFL Waiver form: https://www.wcb.ny.gov/content/main/forms/PFLWaiver.pdf
- NY DTF "Hiring Household Help": https://www.tax.ny.gov/pubs_and_bulls/tg_bulletins/mu/hiring_household_help.htm
- NY DTF Pub NYS-50: https://www.tax.ny.gov/forms/publications/wt/nys50.htm
- NY new-hire reporting (CORRECT URL): https://www.nynewhire.com/ — reference page: https://www.tax.ny.gov/bus/newhire/
- NY required workplace posters: https://dol.ny.gov/required-workplace-posters
- NY Sexual Harassment Prevention (model policy + training): https://www.ny.gov/combating-sexual-harassment-workplace
- SSA BSO (W-2 e-file): https://www.ssa.gov/employer/bso/bsowelcome.htm

---

# Phase 12 — Calculation Correctness & Data Integrity ✓ DONE (2026-05-08)

**Branch:** `verify-calcs` — merged to `main` as PR #18 (`99ec76b`).
**Migration applied:** 0018 (phase12_compliance_calc).

**Goal:** After this phase, every paystub generated will be legally and mathematically correct in dollars. No illegal deductions. Edit-mode preserves immutability.

**Estimated scope:** 1–2 sittings. One migration + ~6 source files + tests.

**Why first:** Items here directly affect money on a paystub. Phase 13 and 14 polish forms/workflows, but if Phase 12 isn't done, every stub generated has wrong deductions or risks corruption on edit.

## 12.1 Stop SDI deduction (default off)

**Files:** `src/lib/tax.ts:85`, `supabase/schema.sql` (settings table), `src/components/stubs/NewStubForm.tsx`, `src/lib/pdf/PaystubDocument.tsx`, `src/components/stubs/StubDetail.tsx`
**Source:** WCB household-employer DBL page — https://www.wcb.ny.gov/content/main/coverage-requirements-db/household-employers.jsp

**Spec:**
1. **Migration:** add `dbl_covered boolean not null default false` to `settings`. Add `dbl_covered_at_generation boolean not null default false` to `paystubs`.
2. **`src/lib/tax.ts`:** in `calculateTaxes`, accept `dblCovered: boolean` param. `sdi = dblCovered ? Math.min(round(gross * sdi_rate), sdi_weekly_cap) : 0`.
3. **Stub generation (`NewStubForm.tsx`):** read `settings.dbl_covered`, pass to calc, store as `paystubs.dbl_covered_at_generation` on insert.
4. **Stub display:** PaystubDocument and StubDetail read `stub.dbl_covered_at_generation` (snapshot, not live setting). When `false`, omit the "NY SDI" row from the deductions table entirely (mirror existing PFL-row-omission pattern).
5. **Settings UI:** add "NY State Disability (DBL) coverage" toggle with help text: "NY DBL covers domestic workers only at 20+ hrs/week in a private home. Default off — turn on only if she crosses that threshold (then a DBL insurance policy is also required, contact NYSIF or any private carrier)."
6. **W-2 calc impact:** Box 14 NY SDI line should show $0 / be omitted when `sum(sdi) = 0` across the year (already correct — sums what's stored).

## 12.2 Stop PFL deduction (default off, replace `pfl_waived`)

**Files:** same set + `src/components/settings/SettingsForm.tsx` + the existing PFL waiver onboarding row
**Source:** paidfamilyleave.ny.gov/eligibility, WCB part-time fact sheet

**Spec:**
1. **Migration:**
   - Rename `settings.pfl_waived` → `settings.pfl_covered` with semantics inverted (default `false`).
   - Add `pfl_covered_at_generation boolean not null default false` to `paystubs`.
   - Backfill: for any existing stubs, set `pfl_covered_at_generation = (NOT pfl_waived_at_generation)` if such a column existed, else `false`.
2. **`src/lib/tax.ts`:** `pfl = pflCovered ? min(round(gross * rate), max(0, annual_cap - ytdPflBefore)) : 0`. Remove the `pfl_waived` arg.
3. **Stub generation:** read `settings.pfl_covered`, pass to calc, snapshot.
4. **Stub display:** PaystubDocument and StubDetail read `stub.pfl_covered_at_generation` and omit the "NY PFL" row when false.
5. **Settings UI:** rename toggle from "PFL waived" to "NY Paid Family Leave (PFL) coverage" — same on/off logic, default off, help text: "PFL covers domestic workers at 20+ hrs/week OR <20 hrs/week reaching 175 days/52 weeks. Default off — turn on if she crosses either threshold (separate PFL policy then required)."
6. **Onboarding checklist row update:** the "Obtain signed PFL-Waiver form" row's `detail` should change to "Document the schedule analysis (one-page memo: hours per week × days per year). PFL waiver form is optional belt-and-suspenders evidence: https://www.wcb.ny.gov/content/main/forms/PFLWaiver.pdf"

## 12.3 FICA household-employee threshold $2,800 → $3,000 (year-keyed)

**Files:** `src/lib/filings.ts:161`, `src/app/(app)/filings/schedule-h/[year]/page.tsx:117`, `tax_rates` table

**Source:** IRS Pub 926 (2026), Table 1, p. 4 — https://www.irs.gov/publications/p926

**Spec:**
1. **Migration:** add `fica_household_threshold numeric(10,2) not null default 0` and `futa_quarterly_threshold numeric(10,2) not null default 0` columns to `tax_rates`. Seed:
   - 2026 row: `fica_household_threshold = 3000`, `futa_quarterly_threshold = 1000`
   - 2025 row (if present): `fica_household_threshold = 2800`, `futa_quarterly_threshold = 1000`
2. **`src/lib/filings.ts`:** delete the `FICA_HOUSEHOLD_THRESHOLD_2026` and `FUTA_QUARTERLY_THRESHOLD` consts. Read both from `getTaxRatesForYear(taxYear)`.
3. **Schedule H UI string** at `src/app/(app)/filings/schedule-h/[year]/page.tsx:117`: change literal `"$2,800/yr"` to interpolate from rates: `${formatCurrency(rates.fica_household_threshold)}/yr`.
4. **Test:** add unit test that calls `calculateScheduleH({ taxYear: 2025, totalGross: 2799.99 })` and expects `fica_threshold_met = false`; same call for 2026 should expect `false` until $3,000.

## 12.4 Edit mode preserves stub snapshot (don't re-read settings)

**Files:** `src/components/stubs/NewStubForm.tsx:251-260` (and surrounding), `src/app/(app)/stubs/[id]/edit/page.tsx`

**Spec:**
- When the form is in edit mode (`initialStub` is provided), default these to the stored stub values:
  - `federalWithholding` ← `initialStub.federal_withholding`
  - `stateWithholding` ← `initialStub.state_withholding`
  - `sutaRate` ← snapshot from stub (see 12.4.b)
  - `dblCovered` ← `initialStub.dbl_covered_at_generation` (from 12.1)
  - `pflCovered` ← `initialStub.pfl_covered_at_generation` (from 12.2)
  - `hourlyRate` ← `initialStub.hourly_rate` (already correct — verify)
- **12.4.b** add `suta_rate_at_generation numeric(6,4)` to `paystubs` schema. Snapshot at insert. Read in edit mode.

## 12.5 Edit-mode YTD-before filter (and detail-page filter)

**Files:**
- `src/app/(app)/stubs/[id]/edit/page.tsx:47-49`
- `src/app/(app)/stubs/[id]/page.tsx:34-44`
- `src/app/api/pdf/stub/route.ts:35-46`
- `src/app/api/email/stub/route.ts:31-44`

**Spec:** Replace existing YTD-before queries with a uniform pattern: filter by `pay_date` calendar year + `(pay_date < current.pay_date) OR (pay_date = current.pay_date AND stub_number < current.stub_number)`. In Supabase JS this is two filtered queries unioned, OR a Postgres view, OR explicit OR via `.or()`. Pick whichever is simplest. Goal: handle backdated stubs and same-day stubs correctly.

Concrete query (Postgres view recommended for clarity):
```sql
create or replace view paystubs_with_ytd_predicate as
  select *,
    -- composite ordering key for "stubs before this one in the same calendar year"
    extract(year from pay_date)::int as tax_year
  from paystubs;
```
Then in code, query stubs where `tax_year = current.tax_year` and either earlier `pay_date` or same `pay_date` with smaller `stub_number`, and sum/aggregate as needed.

## 12.6 PFL row visibility uses snapshot, not live setting

Already covered by 12.2 (`pfl_covered_at_generation` is the snapshot).

## 12.7 W-2 calc honors per-line-item flags

**Files:** `src/app/api/w2/calculate/route.ts:40-54`, `src/lib/line-items.ts`, possibly `src/lib/tax.ts`

**Spec:** Today the W-2 calc sums `paystubs.gross_pay` for every box. That's only correct if every line item has identical `taxable_fed`/`taxable_fica`/`taxable_ny`/`w2_box1` flags. To future-proof:
1. Join `paystub_line_items` and aggregate per flag:
   - Box 1 (`wages_tips`) = sum of base wages + sum of line items where `w2_box1 = true`
   - Box 3 (`ss_wages`) = sum of base wages + sum of line items where `taxable_fica = true`, capped at SS wage base
   - Box 5 (`medicare_wages`) = same as Box 3 but uncapped
   - Box 16 (`state_wages`) = sum of base wages + sum of line items where `taxable_ny = true`
2. Add a unit test with a synthetic mixed-flag line item: `taxable_fed = true, taxable_fica = false`. Expect Box 1 to differ from Box 3.

If the line-items model becomes too tangled, an acceptable alternative is to store per-flag wage subtotals on each `paystub` row at generation time. Pick whichever feels lighter.

## 12.8 `Math.round` IEEE-754 fix

**File:** `src/lib/tax.ts:57-59`

**Spec:**
```ts
function round(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n) * 100 + Number.EPSILON) / 100;
}
```
Add unit test: `round(1.005) === 1.01`, `round(-1.005) === -1.01`.

## 12.9 PFL annual-cap math: remove double round

**File:** `src/lib/tax.ts:87-92`

**Spec:** the inner `round(gross * pfl_rate)` is sufficient; the trailing `pfl = round(pfl)` is redundant. Remove the redundant call.

## 12.10 YTD-by-pay_date with stub_number tiebreaker (across all consumers)

Already covered by 12.5.

## Phase 12 — testing & verification checklist

After implementation, verify by hand:
1. Generate a 9-hr / $198 stub in the UI. SDI row absent. PFL row absent. Net = gross − FICA SS − FICA Medicare = $198 − $12.28 − $2.87 = $182.85.
2. Edit a stub after toggling settings. Federal/state/SUTA values do NOT change.
3. Run the new test suite (12.3, 12.7, 12.8 tests at minimum). All pass.
4. Run any existing tests (`npm test` or equivalent) — none should regress.
5. Migration applies cleanly; rollback path documented in the migration comment.

## Phase 12 — files to commit (likely)

- 1 new migration in `supabase/migrations/` (timestamp + descriptive name)
- `src/lib/tax.ts`
- `src/lib/filings.ts`
- `src/lib/line-items.ts` (if 12.7 touches it)
- `src/app/api/w2/calculate/route.ts`
- `src/components/stubs/NewStubForm.tsx`
- `src/components/stubs/StubDetail.tsx`
- `src/components/settings/SettingsForm.tsx`
- `src/lib/pdf/PaystubDocument.tsx`
- `src/app/(app)/stubs/[id]/edit/page.tsx`
- `src/app/(app)/stubs/[id]/page.tsx`
- `src/app/api/pdf/stub/route.ts`
- `src/app/api/email/stub/route.ts`
- `src/app/(app)/filings/schedule-h/[year]/page.tsx`
- New test files (vitest setup deferred to Phase 14, but if test infra exists, add tests here)

Commit grouping suggestion (per user preference for medium-sized logical commits):
- Commit A: migration + tax.ts changes (12.1, 12.2, 12.3, 12.8, 12.9)
- Commit B: stub generation/edit/display snapshot fixes (12.4, 12.5, 12.6)
- Commit C: W-2 calc per-flag aggregation (12.7)
- Commit D: settings UI updates for new flags (12.1, 12.2 UI)

---

# Phase 13 — Onboarding & Forms Compliance ✓ DONE (2026-05-08)

**Branch:** `feature/phase13-onboarding-forms` — 6 commits, ready to PR → `main`.
**Migrations applied:** 0019 (I-9), 0020 (harassment), 0021 (W-2 fields), 0022 (day-of-rest/posters), 0023 (misc fixes).

**Goal:** After this phase, the onboarding checklist + Documents vault + pay stub + W-2 PDF cover every legally required form and disclosure for a NY household employer with one part-time live-out babysitter.

**Estimated scope:** 2–3 sittings. One+ migrations + several UI/PDF tweaks + new document templates.

**Read first:** Project Context + Decisions Already Made + What's Verified Correct sections at the top of this document.

## 13.1 Form I-9 added to onboarding + Documents vault

**Source:** USCIS I-9 (https://www.uscis.gov/i-9), 8 USC § 1324a, IRS Pub 926 p. 4

**Spec:**
1. **Migration:** add `'i9'` to the `signed_documents.document_type` check constraint.
2. **Onboarding seed migration:** insert a new row with sort order placed before W-4 (it must be done day 1):
   - `label`: "Complete USCIS Form I-9 (Employment Eligibility Verification)"
   - `detail`: "Required for every U.S. employee. Section 1: employee fills on or before first day of work. Section 2: you fill within 3 business days after examining her ID documents (List A alone, OR List B + List C). **Do NOT mail this anywhere — retain in your files.** Keep for 3 years from hire OR 1 year after termination, whichever is later. Form: https://www.uscis.gov/i-9"
3. **`src/components/dashboard/OnboardingChecklist.tsx`:** add `i9` to `ITEM_LINKS` mapping → `https://www.uscis.gov/i-9`.
4. **`src/app/(app)/documents/page.tsx`:** add I-9 entry to `DOCS` array. Same upload UX as LS-59. Help text repeats the "do not mail; retain" instruction.
5. **(Optional but useful):** add a "Where do I file this? → Nowhere — keep in records" inline tooltip pattern on this and harassment-policy items.

## 13.2 Sexual Harassment Prevention — policy + annual training

**Source:** NY Labor Law § 201-g, 9 NYCRR § 466.13, https://www.ny.gov/combating-sexual-harassment-workplace

**Spec:**
1. **Migration:** add `'sexual_harassment_policy'` and `'sexual_harassment_training_certificate'` to `signed_documents.document_type`.
2. **Onboarding rows:**
   - "Adopt and distribute Sexual Harassment Prevention Policy" — detail explains NY § 201-g requires all employers (including 1-employee household) to adopt the NYS model policy or a compliant equivalent and distribute to each employee at hire and annually. Link: https://www.ny.gov/combating-sexual-harassment-workplace
   - "Complete annual interactive harassment-prevention training" — detail: "Free NYS-provided training: https://www.ny.gov/sexual-harassment-prevention-employees. Retain certificate."
3. **Documents vault:** add policy and training-certificate upload tiles.
4. **Annual reminder:** seed a recurring "Sexual Harassment Prevention Training due" reminder for January 31 each year. Title: `Sexual Harassment Prevention Training due {year}`. The existing reminder dismissal-rolls-forward pattern auto-creates next year's row.
5. **(Optional polish):** generate a simple printable NY model policy PDF using the existing `@react-pdf/renderer` pipeline at `/documents/harassment-policy/page.tsx`, mirroring the sick-leave-policy pattern.

## 13.3 W-2 missing fields (BSO e-file path)

**Files:** `src/lib/pdf/W2Document.tsx`, `src/app/api/w2/calculate/route.ts`, `src/app/api/pdf/w2/route.ts`, `settings` schema, types

**Source:** IRS 2026 W-2/W-3 Instructions (https://www.irs.gov/pub/irs-pdf/iw2w3.pdf)

**Context:** decision is BSO e-file → no Pub 1141 substitute-form burden for Copy A (BSO generates Copy A on its own). PDF in app is for Copy B (employee files with federal return), C (employee records), 2 (employee files with state return), D (employer record). Plus a worksheet variant.

**Spec — capture/add these missing W-2 elements:**

| Element | Today | Fix |
|---|---|---|
| Box a (SSN) | Missing | Render as a writable blank "____-__-____" with light underlines so user can hand-write. Do NOT capture in app per Decision #7. |
| Box b (EIN) | Conflated with employer block | Split into its own labeled box. |
| Box c (Employer name + address + ZIP) | Conflated with EIN | Single labeled block, no EIN in it. |
| Box d (Control number) | Missing | Render an empty box with label. |
| Box e (Employee name) | Single string | Add `settings.employee_name_first`, `..._middle_initial`, `..._last`. Render as three sub-fields. |
| Box f (Employee address + ZIP) | Missing | Add `settings.employee_address` (text). Render. |
| Boxes 7, 8, 9, 10, 11 | Missing | Render labeled empty boxes (zeroes hidden, just empty). |
| Box 12a–d | Missing | Render four labeled empty boxes. |
| Box 13 (3 checkboxes: Statutory employee, Retirement plan, Third-party sick pay) | Missing | Render labeled unchecked boxes. |
| Box 14 (Other) | Missing | Render. Label "NY SDI" with sum-of-year SDI; "NYPFL" with sum-of-year PFL. Hide rows when sum = 0 (post-Phase-12 default). |
| Box 15 (NY state ID) | Only "NY" rendered | Add `settings.employer_ny_state_id` (text). Render alongside "NY". |
| Boxes 18, 19, 20 (local) | Missing | Render labeled empty boxes (Nassau has no local). |
| Copy designation | None | Add a `copy: 'B' \| 'C' \| '2' \| 'D' \| 'worksheet'` query param. Render the corresponding bottom-of-form designation text (per IRS instructions). |
| Disclaimer | "for household payroll purposes" | Replace per copy: B/C/2 — actual W-2 furnished to employee with hand-written SSN; D — employer record; worksheet — clearly marked "WORKSHEET — NOT A FILED FORM". |

**Visual layout:** approximate the IRS six-column box grid (Box a top-right, b/c left, 1-6 in two columns, 7-11, 12a-d block, 13 checkboxes, 14, 15-20 across the bottom). Reference: https://www.irs.gov/pub/irs-pdf/fw2.pdf. Doesn't need pixel-perfect Pub 1141 fidelity since you're e-filing Copy A.

**Migration:** add to `settings`:
- `employee_name_first text`
- `employee_name_middle_initial text` (nullable)
- `employee_name_last text`
- `employee_address text` (nullable until populated; warn in Settings UI before W-2 generation if empty)
- `employer_ny_state_id text` (nullable; populated after NYS-100 registration)

The existing single `employee_name` field can be migrated to `${first} ${mi}. ${last}` on read for backward compat, then deprecated.

## 13.4 Day-of-Rest acknowledgement document

**Source:** NY Labor Law § 161

**Spec:**
1. Add `'day_of_rest_acknowledgement'` to `signed_documents.document_type`.
2. Onboarding row: "Acknowledge NY Day of Rest rule (§ 161)"
   - `detail`: "NY mandates 24 consecutive hours off per calendar week for domestic workers. If she voluntarily works that day, the entire day is paid at 1.5×. Sign a one-paragraph acknowledgement and retain for the duration of employment."
3. Optional: generate a printable acknowledgement at `/documents/day-of-rest/page.tsx` (mirror sick-leave-policy pattern). Single paragraph with two signature blocks.

## 13.5 Workplace posters checklist + retention

**Source:** NY DOL required-posters page (https://dol.ny.gov/required-workplace-posters)

**Spec:**
1. Onboarding row: "Print and post required workplace posters in kitchen/work area"
   - `detail` lists each poster with a download link:
     - NYS Domestic Workers' Bill of Rights notice — https://dol.ny.gov/system/files/documents/2021/03/p715-english.pdf
     - NYS Minimum Wage Information (LS-207-style)
     - NYS Sexual Harassment Prevention Notice — https://www.ny.gov/sites/default/files/atoms/files/SexualHarassmentNoticeofRights.pdf
     - NYS Discrimination Notice
     - Federal FLSA "Your Rights" (WH-1088) — https://www.dol.gov/agencies/whd/posters
     - Federal EEO Is The Law / USERRA / Polygraph Protection
   - "Place all in a binder kept in the kitchen or other location where employee can read."
2. Add `'posters_bundle'` to `signed_documents.document_type`.
3. Documents vault entry to upload a scan of the printed bundle (or photo of the binder).

## 13.6 § 196-b Sick Leave Summary employee-accessible

**File:** `src/app/(app)/documents/sick-leave-summary/page.tsx:28`
**Source:** NY § 196-b(4)

**Spec:** today this route is admin-only. Make it accessible to the employee role for HER OWN data:
1. Remove the role-redirect at the top of the page.
2. Server-side data fetch: if `role = 'employee'`, force the employee_id filter to `auth.uid()` (defensive).
3. Surface a link to it on the employee dashboard ("View my sick-leave summary").

## 13.7 New-hire URL fix

**File:** `supabase/schema.sql` (the onboarding seed row that references "labor.ny.gov/newhire")

**Spec:** new migration that updates the `detail` for that onboarding row to:
> "Report within 20 days of hire at https://www.nynewhire.com/ (NY Tax Law § 171-h). Reference: https://www.tax.ny.gov/bus/newhire/. Submit IT-2104 with the new-hire box checked, OR submit Form IT-2104.1, OR upload via the online portal."

Update `OnboardingChecklist.tsx` `ITEM_LINKS` if the URL is referenced there.

## 13.8 NY state withholding voluntary banner + Settings copy

**File:** `src/components/settings/SettingsForm.tsx` (and equivalent for federal)

**Spec:** add inline help text near the federal_withholding and state_withholding fields:
- "Federal income tax withholding is **voluntary** for household employees. Default $0. Only set a value if you and the employee both agree and she has signed a Form W-4. Most household employers settle federal tax via Schedule H + 1040-ES."
- "NY state income tax withholding is **voluntary** for household employees. Default $0. Only set a value after she has signed Form IT-2104."

Source citation tooltip: NY DTF Hiring Household Help — https://www.tax.ny.gov/pubs_and_bulls/tg_bulletins/mu/hiring_household_help.htm

## 13.9 Pay stub legal-copy fixes

**File:** `src/lib/pdf/PaystubDocument.tsx`
**Source:** NY § 195(3), NY DOL LS-49 sample

**Spec:**
1. **Hourly basis disclosure:** Rate-column header becomes "Rate (hourly)" OR add a new "Basis: Hourly" line in the Employee Info row.
2. **Allowances disclosure:** Add a single static line "Allowances claimed: None" near the wage-rate area.
3. **Overtime rate header note:** add a small line near the regular hourly rate (above the earnings table) reading: `Overtime rate (after 40 hrs/wk): $33.00/hr` (computed `hourlyRate * 1.5`). The earnings-table OT row continues to render only when `overtimeHours > 0` (existing behavior).
4. **Zero-hour rendering:** show explicit `0` in the Hours and Total cells of the OT row when shown, not em-dashes (only matters once OT is shown).

## 13.10 December "verify tax constants" reminder — make FUTA-credit-reduction-list explicit

**File:** the seed for the existing "Verify 2027 tax rates" reminder
**Source:** DOL FUTA credit-reduction page

**Spec:** update the reminder's `description` to include a bullet: "Re-verify FUTA rate against the DOL credit-reduction list — NY's status can change year-to-year. Page: https://oui.doleta.gov/unemploy/futa_credit.asp".

## Phase 13 — testing & verification checklist

1. New onboarding rows appear on the dashboard with correct `detail` and link.
2. Documents page shows new tiles. Each accepts a PDF/image upload.
3. Generate a W-2 PDF (preview from `/w2`) — visually verify Boxes a (blank with underline), b/c separated, e (split name), f (address), 7-13 (empty/unchecked), 14 (NY SDI / NYPFL appear only if amounts > 0), 15 (NY state ID rendered when populated), 18-20 (empty), copy designation, copy-specific disclaimer.
4. Pay stub renders the new "hourly", "Allowances: None", and OT-rate header note. OT row absent when no OT.
5. Employee logs in (test account) and can access `/documents/sick-leave-summary` and sees only their own data.
6. New-hire onboarding row's link resolves to `nynewhire.com`.

## Phase 13 — commit grouping suggestion

- Commit A: I-9 onboarding + Documents vault entry (13.1)
- Commit B: Sexual harassment policy + training + reminder (13.2)
- Commit C: W-2 PDF rebuild + settings schema additions (13.3)
- Commit D: Day-of-rest + posters checklist (13.4, 13.5)
- Commit E: Sick-leave summary employee access + employee dashboard link (13.6)
- Commit F: Misc fixes — new-hire URL (13.7), withholding banner copy (13.8), stub legal copy (13.9), Dec reminder (13.10)

---

# Phase 14 — Infrastructure, Integrity, Polish, Tests

**Goal:** Tighten data integrity (UNIQUE constraints, audit triggers), fix small bugs (tz, redirect loop, env-var doc), modernize the codebase with tests so future changes are safer.

**Estimated scope:** 1–2 sittings + initial test infrastructure.

**Read first:** Project Context + Decisions Already Made + What's Verified Correct sections at the top of this document.

## 14.1 UNIQUE constraint on `paystubs.stub_number` + atomic insert

**Files:** new migration; review `src/app/(app)/stubs/new/page.tsx` and `src/components/stubs/NewStubForm.tsx`

**Spec:**
1. **Migration:**
```sql
-- 1. Add unique constraint
alter table public.paystubs
  add constraint paystubs_stub_number_unique unique (stub_number);

-- 2. Helper function for atomic next-number (also runs under row lock)
create or replace function public.next_paystub_number()
  returns integer
  language plpgsql
  security definer
  as $$
declare
  next_num integer;
begin
  -- Lock the table briefly so two concurrent inserts can't read the same MAX
  lock table public.paystubs in exclusive mode;
  select coalesce(max(stub_number), 0) + 1 into next_num from public.paystubs;
  return next_num;
end;
$$;

-- 3. BEFORE INSERT trigger that always overwrites stub_number with the locked value
create or replace function public.assign_stub_number()
  returns trigger
  language plpgsql
  as $$
begin
  new.stub_number := public.next_paystub_number();
  return new;
end;
$$;

create trigger paystubs_assign_stub_number
  before insert on public.paystubs
  for each row execute function public.assign_stub_number();
```
2. **Code change:** the client-passed `stub_number` is now ignored (overwritten by the trigger). You can either still send it for backward compat or remove the column from the insert payload. Verify `NewStubForm.tsx` doesn't break.
3. **Test:** add a test that fires two concurrent inserts and asserts both succeed with sequential numbers.

## 14.2 Env var documentation fix

**Files:** `CLAUDE.md`, `README.md`

**Spec:** find every reference to `SUPABASE_SECRET_KEY` and replace with `SUPABASE_SERVICE_ROLE_KEY`. Update the Environment Variables block to include all required keys:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY (alias for PUBLISHABLE_KEY in some Supabase setups)
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_PROJECT_REF
RESEND_API_KEY
CRON_SECRET                                  # Vercel cron Bearer auth
NEXT_PUBLIC_VAPID_PUBLIC_KEY                 # web push public key
VAPID_PRIVATE_KEY                            # web push private key
VAPID_SUBJECT                                # mailto: address for push registration
```

## 14.3 `daysUntil()` NY-tz-aware

**File:** `src/lib/dates.ts:39-45` (and `todayNY()` at lines 48-50)

**Spec:** rewrite `daysUntil(targetDate: string)` to compute "today" via `todayNY()` and compare ISO date strings (or construct both dates via the same NY-locale formatter). Goal: `daysUntil` returns the same answer regardless of process tz. Add a unit test that mocks `Date.now()` to a UTC moment that's the previous day in NY (e.g., 2026-05-08 03:00 UTC → 2026-05-07 23:00 NY) and expects "today" relative comparisons.

## 14.4 Admin middleware path coverage

**File:** `src/proxy.ts:5`

**Spec:** add `/filings`, `/hysa`, `/calendar`, `/documents` to `ADMIN_ONLY_PATHS`. Each page already does its own role check (defense in depth retained). This guards against typos in any one page file.

## 14.5 Profile-less authenticated user redirect-loop

**Files:** `src/app/(app)/layout.tsx:19`, `src/app/(app)/dashboard/page.tsx:18`, `src/app/page.tsx:7-9`

**Spec:** if `auth.users` row exists but `profiles` row is null:
- In `(app)/layout.tsx` and `dashboard/page.tsx`: call `supabase.auth.signOut()` then redirect to `/`.
- In `/` page: same — if no profile, sign out and stay on `/`.

This handles the (unlikely but possible) case of a profile being manually deleted in Supabase dashboard.

## 14.6 `audit_log` stray INSERT grant

**File:** new migration

**Spec:**
```sql
revoke insert on public.audit_log from authenticated;
```
(Trigger writes via SECURITY DEFINER as `postgres`, so revoking authenticated INSERT doesn't break anything. Belt-and-suspenders.)

## 14.7 Reminders table audit triggers

**File:** new migration

**Spec:** mirror the existing audit-trigger pattern (see `supabase/migrations/0003_phase2_line_items_and_audit.sql`):
```sql
create trigger reminders_audit
  after insert or update or delete on public.reminders
  for each row execute function public.audit_trigger();
```
Useful for tracing "did I really dismiss this reminder?" disputes later.

## 14.8 Schedule H link to Pub 926

**File:** `src/app/(app)/filings/schedule-h/[year]/page.tsx:226` (and adjacent help-link area)

**Spec:** add a link to https://www.irs.gov/publications/p926 alongside the existing Schedule H form link. Also add this link from the W-3 PDF copy (`src/lib/pdf/W3Document.tsx`).

## 14.9 Vitest setup + tax math test suite

**Files:** new — `vitest.config.ts`, `package.json` (deps + script), `src/lib/tax.test.ts`, `src/lib/filings.test.ts`

**Spec:**
1. **Install deps:** `vitest`, `@vitest/ui`, `@types/node` (already), nothing more needed for pure-function tests.
2. **`package.json` scripts:**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```
3. **`vitest.config.ts`** minimal — Node environment is fine for `src/lib` code.
4. **`src/lib/tax.test.ts`** test cases (at minimum):
   - Happy path: `gross 198 @ 22 × 9` → exact FICA SS, Medicare, $0 SDI (default off post-12.1), $0 PFL (default off post-12.2), employer FICA mirroring, FUTA 0.6% × $198 = $1.19 (when YTD < cap)
   - Zero hours: every field = $0 including federal/state withholding regardless of settings
   - SDI cap: when `dblCovered = true`, gross ≥ $120 → SDI = $0.60 exactly
   - PFL cap: when `pflCovered = true`, ytdPflBefore = $411.81 (cap − $0.10), gross $198 → PFL = $0.10
   - FUTA wage base crossover: YTD $6,802, gross $198 → FUTA on $198; YTD $6,900, gross $198 → FUTA on $100; YTD $7,100 → FUTA = 0
   - SUTA wage base crossover at $17,600 (same shape)
   - SS wage base crossover at $184,500 (synthetic high-gross)
   - `round(1.005)` returns `1.01` (post-Phase-12.8)
5. **`src/lib/filings.test.ts`** test cases:
   - `calculateScheduleH` at threshold edge: 2026 totalGross $2,999.99 → `fica_threshold_met = false`; $3,000.00 → true
   - `calculateScheduleH` SS combined rate = 12.4% × ssWages, Medicare = 2.9% × wages
   - `calculateNYS45` excess-wages stub-by-stub cap respected
   - `calculateFederalEstimatedTax` IRS fiscal periods (3/2/3/4 months) boundary correctness
6. **CI hook:** add `npm test` to a pre-push or pre-deploy hook in CI if there's existing infra. Optional.

## Phase 14 — testing & verification checklist

1. `npm test` passes.
2. Concurrent stub insert test (manual): open two browser tabs, click "Save" near-simultaneously. Both succeed with sequential stub numbers (no collision).
3. Manually delete a profile row in Supabase, log in — should sign out and land on `/` cleanly.
4. Visit `/filings`, `/hysa`, `/calendar`, `/documents` as employee role — redirected to `/dashboard`.
5. Confirm audit_log entries appear for reminder dismiss/create operations.
6. README env-var section matches Vercel.

## Phase 14 — commit grouping suggestion

- Commit A: stub_number UNIQUE + atomic trigger (14.1)
- Commit B: env-var doc fix (14.2)
- Commit C: dates/tz fix (14.3)
- Commit D: middleware path coverage + redirect loop (14.4, 14.5)
- Commit E: audit grants + reminders triggers (14.6, 14.7)
- Commit F: test infra setup + tax/filings test suites (14.9)
- Commit G: small UI link addition for Pub 926 (14.8)

---

## Cross-phase notes for future context-cleared sessions

- **If a phase says "files at line X" and the line doesn't match:** `grep -n` for the symbol/string named in the spec. Files have shifted since the audit was performed.
- **If a primary-source URL returns a 404:** use the search query the audit used, e.g., for the FUTA credit reduction list, search `site:dol.gov FUTA credit reduction 2026`. Don't take training-data figures.
- **If unsure whether a pre-existing constant is correct:** trust the value in `tax_rates` for the relevant year over `CLAUDE.md` (which is documentation), and verify against the primary-source link in the "What's Verified Correct" table at the top of this document.
- **Don't auto-commit.** User preference is medium-sized logical commits, never one omnibus commit. Wait for explicit "commit" instruction.
- **Migrations apply via Supabase MCP without confirmation** for non-destructive DDL. Confirm before any `DROP TABLE` etc.
- **Don't introduce SSN storage anywhere in the app.** Decision #7 — PDF Box a is a hand-write blank.
