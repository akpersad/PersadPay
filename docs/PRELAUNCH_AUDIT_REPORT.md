# PersadPay Pre-Launch Audit — Consolidated Report

**Branch:** `feature/resend-verified-domain` | **Date:** 2026-05-09 | **21 agents on Sonnet 4.6 across 8 topics**

## Top-line

**6 confirmed blockers must be fixed before paying the babysitter or filing.** Most are calculation/compliance — not security. The single most damaging is the NY SUTA wage base, which has been wrong since the project started.

The redundancy paid off in two specific places: (1) three rate-verification agents couldn't reach NY DOL's wage-base figure and flagged it as "unverified"; the compliance agent (different starting angle: NYS-50 publication) found the actual 2026 figure is **$17,600, not $13,000**. (2) One adversarial agent caught that middleware never runs at all — `src/proxy.ts` exports `proxy()` not `middleware()`, so the entire route-guard layer is dead code in production. Neither of those would have surfaced without orthogonal angles.

---

## BLOCKERS (must fix before launch)

### B1. NY SUTA wage base is $17,600 for 2026, not $13,000 (Agent 21, missed by Agents 1/2/3)
- `tax_rates.suta_wage_base = 13000` for `effective_year = 2026`. Per NYS-50 (tax.ny.gov/forms/publications/wt/nys50.htm), NY's 2026 figure is **$17,600** (formula change: 18% of state average annual wage, permanent from 2026). The historical table shows NY has *never* had a $13,000 wage base — 2025 was $12,800, 2024 $12,500.
- **Impact:** Every 2026 stub under-collects SUTA. Q1 NYS-45 (already due April 30 — past!) and every subsequent filing will be wrong. NY DOL will assess back-tax + interest.
- **Fix:** Migration: `UPDATE tax_rates SET suta_wage_base = 17600 WHERE effective_year = 2026`. Also fix CLAUDE.md and the data-model doc.

### B2. Middleware (`src/proxy.ts`) never runs — entire route-guard layer is dead code (Agent 17)
- Next.js middleware must be in `src/middleware.ts` and export `middleware()`. The file is `src/proxy.ts` and exports `proxy()`. `.next/server/middleware-manifest.json` confirms `"middleware": {}` (empty).
- All MFA enforcement, admin-only path guards, and unauthenticated redirects are bypassed on every request.
- **Mitigating:** All admin pages independently re-check role server-side, so this is defense-in-depth, not the primary gate. Still must be fixed.
- **Fix:** Rename `src/proxy.ts` → `src/middleware.ts`, rename function `proxy` → `middleware`.

### B3. Employer-side tax data + Zelle ID leak to employee via RSC payload (Agent 17)
- `src/app/(app)/stubs/[id]/page.tsx:66-83` builds `stubWithYTD` including `employer_fica_ss`, `employer_fica_medicare`, `futa`, `suta`, `ytd_employer_*`, `zelle_transaction_id` and passes it to a `'use client'` component. The full object is serialized into the React flight payload and sent to the browser. UI hides them with `{isAdmin && ...}` but the data is in the network response.
- Babysitter can read every employer-side cost via DevTools → Network.
- **Fix:** In the server component, strip employer fields from `stubWithYTD` when `profile.role === 'employee'`.

### B4. Employee cannot download own paystub PDF or W-2 (Agent 16)
- `/api/pdf/stub` and `/api/pdf/w2` query `settings`. RLS only grants admin access. Employee → `settings = null` → routes return 500.
- Spec explicitly says employees download their own PDFs.
- **Fix:** Use `createAdminClient()` for the settings fetch in those two routes (data is internal to PDF rendering, not exposed) OR add a narrow employee-readable RLS policy on the public-display fields of settings.

### B5. Sick hours never added to `gross_pay` (Agent 13)
- Spec data-model: `gross_pay = (hours_worked + sick_hours) × hourly_rate + overtime_hours × hourly_rate × 1.5`.
- `NewStubForm.tsx:197-199,237`: `gross = baseWages + taxableAdditionsTotal` where `baseWages = regularHoursNum × rateNum + overtimePay`. `sick_hours` is saved to DB but never added to gross. `calculateTaxes` therefore receives wrong gross on any week with sick pay.
- **Decision needed:** is sick leave at this household paid or unpaid? The current `sick_unpaid` reason path treats sick_hours as informational only. The spec's gross formula treats sick as paid. These are inconsistent — you need to pick one.

### B6. NYS-45 is missing required Line 5 (Re-employment Service Fund) and the employee count by 12th-of-month (Agent 7)
- NYS-45-I (1/26) Line 5: `RSF = UI taxable wages × 0.00075` — required on every quarterly filing, cannot be credited against FUTA. Zero hits for `rsf` / `0.00075` in source.
- NYS-45-I Part A: each filing must report number of employees in the pay period including the 12th of each month (3 numbers per quarter). Not computed, not surfaced.
- Also missing: SSN for Part C (acknowledged design choice — see process-gap section below).

---

## SHOULD-FIX (non-blocking but real)

### Calculation correctness
- **`employer_fica_ss` and `employer_fica_medicare` aliased to employee values** (Agents 4/5/6/13/21) — `tax.ts:120-121`. Numerically correct today (rates symmetric) but structurally wrong; any future asymmetry silently breaks both sides.
- **FICA $3K household threshold not enforced** (Agents 4/5) — `calculateTaxes` applies FICA from dollar one. ~$190 over-withholding for the first ~6 weeks of any new year, never reconciled. Practical impact small for the babysitter (always crosses $3K), but creates Schedule H reconciliation friction.
- **FUTA $1K quarterly threshold not enforced** (Agent 5) — same pattern, zero practical impact at her wage level.
- **YTD year derived from server clock, not pay_date year** (Agents 5/13/19) — `stubs/new/page.tsx:48`. A stub with `pay_date = 2027-01-02` generated on `2026-12-30` pulls 2026 YTD and uses 2026 rates. Fix: derive year from `payDate` field.
- **YTD query lacks `employee_id` filter** (Agents 5/15) — `new/page.tsx:65-68`, `edit/page.tsx:44-48`. RLS protects in practice, but explicit filter is correct.
- **Zero-hour guard uses `gross === 0` not `hours_worked === 0`** (Agent 6) — taxable line items on a zero-hour week bypass the federal/state withholding zeroing.
- **PFL `remainingCap` not rounded before `Math.min`** (Agent 5) — IEEE-754 artifact: `411.91 - 411.81 = 0.0999...`, not `0.10`. Final-week PFL stored fractionally short. Test uses `toBeCloseTo` because of this.

### Filings
- **Schedule H line numbering wrong throughout the UI** (Agent 8) — code says Lines 1a/1b/2a/2b/5/6/7/8/9; actual form uses Lines 1/2/3/4/5/6/7/8/15/16/26. Admin will mis-transcribe to the IRS form.
- **Schedule H Additional Medicare Tax (Lines 5/6) absent** (Agent 8) — required on the form even at $0 for our employee.
- **Schedule H state UI lines (13/14)** missing — admin must hand-look-up SUTA contributions paid (Agent 8).
- **Schedule H FUTA threshold check ignores prior-year wages** (Agent 8) — IRS asks "current OR prior year ≥ $1,000/qtr."
- **Schedule H FICA threshold value drift** (Agent 8) — verify $3,000 against 2025/2026 form (2025 was $2,800; 2026 form not yet released).
- **1040-ES no voucher PDF for check payers** (Agent 9). Digital payers don't need it; not strictly a blocker.
- **1040-ES no safe-harbor surface, no YTD payment catch-up, no annualized projection** (Agent 9) — admin can't tell mid-year whether they're tracking short.

### W-2
- **Email attaches only Copy B; employee needs B + C + 2** (Agents 10/11/12). Multi-page packet not implemented — single `<Page>` in `W2Document.tsx`.
- **Copy B "Notice to Employee" boilerplate is incomplete** (Agent 11) — IRS Pub 1141 §4 requires the full notice on Copy B; current is one truncated sentence.
- **Box 14 (NY SDI / NYPFL) blank on emailed W-2** (Agents 10/11/12) — `email/w2/route.ts:25` doesn't fetch SDI/PFL like the download route does.
- **Box 12 layout split: 12a in right column, 12b/c/d in left** (Agent 11) — IRS form is contiguous.
- **W-2 PDF margins (28pt = 0.39") below Pub 1141 minimum (36pt = 0.5")** (Agent 11).
- **No `filed_with_ssa` lock on W-2 regeneration** (Agent 12) — once filed, regenerating with updated tax_rates produces silent inconsistency.

### Pay stub
- **Employer phone conditionally rendered** (Agent 14) — NY § 195(3) requires unconditionally; current code hides it if null.
- **Hard stub deletion** (Agent 14) — NY § 195(3)(d) requires 6-year retention; current implementation is hard `DELETE`.
- **Sick leave summary missing accrued balance** (Agent 14) — NY § 196-b(4) requires both accrued and used; only used is shown. (Even if policy is "unlimited," the line must say so.)
- **Admin PDF missing payment_sent / zelle_transaction_id / stub_sent fields** (Agent 15) — these are admin-only audit-trail fields per spec but absent from `PaystubDocument.tsx`.
- **`ytd_regular_wages` excludes OT premium and sick pay** (Agent 13) — earnings table YTD column is understated for any week with OT or sick.
- **`employee_id_display` missing from `Settings` type and PDF info row** (Agent 13).
- **Hours show "—" instead of "0" on zero-hour stubs** (Agent 13) — § 195(3) wants the number.

### Email pipeline
- **No idempotency on `stub_sent`** (Agent 18) — `email/stub/route.ts:19-21` checks `payment_sent` but not `stub_sent`. Rapid double-click → two emails. Fix: atomic `UPDATE stub_sent=true WHERE id=$1 AND stub_sent=false` before sending.
- **FROM address mismatch** (Agents 12/18/19) — spec says `payroll@persadpay.com`; code at `email.ts:7` has `noreply@payroll.persadpay.com`. Confirm what's actually verified in Resend and align spec or code.
- **10-day cron followup has no `email_sent` guard** (Agent 18) — fires every day in the window. (20-day path is correctly guarded.)
- **Cron uses exact-day matching (`days === 20` / `=== 10`)** (Agent 19) — Vercel cron is best-effort; one skipped day = permanently missed email. Fix: `days BETWEEN 19 AND 21` with the dedup flag.
- **Cron auth bypassed when `NODE_ENV !== 'production'`** (Agents 16/17/18) — local dev with real RESEND_API_KEY can fire real emails on unauthenticated requests.
- **Multi-recipient partial failure leaves `stub_sent = false`** (Agent 19) — primary recipient may have received the email, retry sends it again.
- **No Resend message ID stored** (Agent 19) — no audit trail for "I never got my stub" disputes.
- **`stub_sent` DB update return value discarded** (Agent 19) — silent partial state if the update fails after Resend succeeds.

### Compliance / onboarding
- **W-2/W-3 reminder due_date is `2027-01-31` but legal deadline is `2027-02-01`** (Agent 20) — Jan 31, 2027 is a Sunday. Reminders fire one day late relative to the actual deadline.
- **NY employer registration number** — no checklist nudge to enter the assigned NY UI account number into Settings after registration completes (Agent 20).
- **DBL insurance policy** — checklist describes the toggle but doesn't surface "you must purchase a DBL policy from NYSIF or a private carrier" if `dbl_covered` is ever turned on (Agent 20).
- **IT-2104-E exemption** — checklist mentions IT-2104 only; low-income babysitter may qualify for full exemption via IT-2104-E (Agent 20).
- **Stale onboarding URLs** (Agent 20) — LS-59 PDF link returns 404; `labor.ny.gov` redirects to `dol.ny.gov`; NYS-100 form name needs reconfirmation; PFL waiver URL points to a path that may be stale.
- **"Switch FROM" checklist row still `completed = false`** despite the recent commit doing the work (Agent 20).
- **W-4 checklist item should clarify "voluntary"** (Agent 20).

### RLS / security (lower-severity)
- **`profiles` UPDATE policy lacks `WITH CHECK`** (Agents 16/17) — admin could escalate roles; no DB-level guard. Add `WITH CHECK (role = OLD.role)` or scope by SECURITY DEFINER function.
- **`schema.sql` still grants `INSERT on audit_log to authenticated`** (Agent 16) — migration 0025 revoked it but schema.sql wasn't updated. Fresh-install drift.
- **`schema.sql` grants are over-broad** for `settings`, `reminders`, `onboarding_checklist`, `tax_rates` etc. — RLS protects, but any future policy slip would expose them. Tighten to `SELECT` only where appropriate.
- **`tax_rates` has no employee SELECT policy** (Agent 16) — employee viewing own stub server-renders `getTaxRatesForYear()` in their session; query returns null. May silently break YTD computation on the employee stub view. Verify and add a permissive `SELECT` policy.
- **Push notifications send filing reminder content to employee** (Agent 17) — `sendPushToRoles(['admin','employee'])` for filing reminders; should be `['admin']` only.
- **`/api/pdf/stub?variant=admin` query param accepted (then overridden by role check)** (Agent 16) — defense-in-depth ok but unnecessary attack surface.

---

## Process gap (not a bug — needs operating procedure)

- **SSN never stored** — by design. W-2 PDF prints `___-__-____` and instructs admin to hand-write SSN on Copies B/C/2/D before distribution; NYS-45 Part C will need SSN entered manually each quarter. Add a UI alert at W-2 generation/download time so admin can't email a blank-SSN W-2 by accident (Agents 10/11/12/21).

---

## NITS (cosmetic / future-proofing)

Skipping individual citations — see agent reports for evidence:
- IRS mileage rate 0.725 — verified via Notice 2026-10 PDF text extraction; no first-party HTML source yet.
- FUTA credit-reduction status for NY 2025 — confirmed via DOL spreadsheet; no clean public HTML source.
- Stub number preview (`nextStubNumber` from page-load max) is advisory; trigger overwrites on insert.
- Out-of-order `pay_date` vs `stub_number` possible if admin backdates; YTD calc handles correctly.
- Cron `0 14 * * *` UTC = 9am EST / 10am EDT (1hr DST drift, acceptable).
- Overtime YTD column shows `—` instead of computed value.
- Line-item YTD sums full year, not cumulative-through-this-stub.
- Schedule H 2026 form not yet released; line numbers will need re-verification when it is.

---

## Disagreements resolved during synthesis

- **Employer FICA aliasing**: Agent 6 flagged BLOCKER, Agents 4/5/13/21 flagged SHOULD-FIX. Numerically correct today (no dollar error in any year as long as employee/employer rates stay symmetric, which they have for decades). Classified SHOULD-FIX.
- **FICA $3K threshold not enforced**: Agent 4 BLOCKER, Agent 5 SHOULD-FIX. Concrete impact is ~$190 misfiled FICA on the first ~6 weeks of every year, plus Schedule H reconciliation friction. Agent 4's concern is W-2 Box 4/6 accuracy; Agent 5's view is "babysitter always exceeds $3K so impact is zero in practice." Sided with SHOULD-FIX since W-2 sums and Schedule H both use the per-stub stored values, and IRS won't penalize an *overpaying* taxpayer — but it's a real defect worth tracking.
- **YTD `employee_id` missing**: Agent 5 BLOCKER, Agent 15 SHOULD-FIX. Single-employee app + RLS makes practical impact zero. SHOULD-FIX.

## What surprised the audit

The redundancy genuinely caught two issues that single-pass auditing would have missed:
1. **SUTA wage base $17,600** — three rate-verification agents (different angles) all stopped at "unverified" because NY DOL's wage-base figure isn't on a stable public URL. The compliance agent (different topic, different starting point: NYS-50 publication) found it directly with a historical table proving $13,000 was never NY's figure. **This is exactly what the redundancy was supposed to do.**
2. **Middleware not running** — only the attacker-mode security agent ran the actual middleware compilation check. The systematic security agent walked through policies and routes assuming middleware worked.

---

## Proposed branch breakdown

Pending decision on B5 (paid vs unpaid sick leave). Suggested grouping:

- `fix/suta-wage-base` — B1 only. Single migration. Highest urgency since Q1 NYS-45 is already overdue.
- `fix/middleware-and-rsc-leak` — B2, B3, plus related security should-fix items (push role, profile WITH CHECK, schema.sql grants).
- `fix/employee-pdf-access` — B4 plus tax_rates employee SELECT policy.
- `fix/sick-hours-and-stub-display` — B5 (after decision), plus § 195(3) employer phone, hard-delete retention, sick-leave summary accrued balance, admin-PDF audit trail (payment_sent/zelle/stub_sent), employee_id_display, hours-as-0 on zero-hour.
- `fix/nys45-rsf-and-employee-count` — B6 plus Schedule H line numbers, AMT lines, state UI lines, FUTA prior-year threshold, FICA threshold value drift.
- `fix/email-pipeline` — idempotency, FROM, cron windowing, message-ID logging, multi-recipient partial-failure handling, cron auth.
- `fix/w2-multipage-and-notice` — multi-copy packet (B+C+2), full Notice to Employee text, Box 14 in email path, Box 12 contiguous layout, margins, filed_with_ssa lock, SSN UI alert.
- `fix/calc-correctness` — FICA $3K threshold, FUTA $1K threshold, YTD year from pay_date, YTD employee_id filter, PFL rounding, employer FICA explicit calc, zero-hour guard.
- `fix/compliance-onboarding` — W-2/W-3 deadline date, stale URLs, NY employer reg number nudge, DBL insurance warning, IT-2104-E mention, "Switch FROM" mark complete, W-4 voluntary clarification.

Hold compliance/onboarding URL refreshes for the tidy-up branch at the end.
