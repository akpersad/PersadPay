# PersadPay Audit Work Plan

Source: `docs/PRELAUNCH_AUDIT_REPORT.md` | Babysitter starts: **May 11, 2026**

---

## Out of scope (deliberately not fixing)
_Audit items the user reviewed and decided not to address. Don't re-flag in future passes._

- **B2 middleware never runs** — Wrong: Next.js 16 uses `src/proxy.ts` / `proxy()`. Build output confirms it registers correctly.
- **B5 sick_hours not in gross_pay** — Sick leave is unpaid and unlimited at this household. Code is correct; the spec was wrong (now fixed in CLAUDE.md).
- **7c FUTA $1K quarterly threshold** — Zero practical impact; Schedule H handles the threshold check.
- **10e OT YTD column** — By design: each line shows its own YTD (regular wages YTD excludes OT premium).
- **10f / 16c employee_id_display** — Single employee; no need for an ID display field.
- **12f "Switch FROM address" checklist row** — User will check off manually.
- **13.1 profiles WITH CHECK** — User will never elevate a user from employee to admin.

---

## Phase 1 — Pre-launch blockers (ship before May 11) ✅ COMPLETE 2026-05-09
_All of these must be done before the first stub is generated._
_Two items deferred to Phase 2: 13c (schema grants tightening) and 11f (multi-recipient partial failure)._

### Calculations & data
- [x] B1: Migration — SUTA wage base $13,000 → $17,600; update CLAUDE.md
- [x] 7a: Employer FICA SS/Medicare — explicit calc instead of aliasing employee values
- [x] 7b: ~~FICA $3K household threshold — don't apply FICA until YTD gross ≥ $3,000~~ **REVERSED 2026-05-09:** withhold FICA from the first dollar (`src/lib/tax.ts` threshold gate removed). Per IRS Topic 756 / Pub 926, once a household employee crosses $3,000 in a year, FICA is owed on ALL wages — including pre-threshold ones. At 9 hrs/wk × $22+ × ~33 weeks remaining of 2026, the babysitter will demonstrably cross $3,000, so withholding from $1 avoids mid-year catch-up withholding or out-of-pocket employer reimbursement. Schedule H year-end calc (`lib/filings.ts`) keeps the threshold check correctly — if the employee leaves before crossing, no FICA is reported on the form.
- [x] 7d: YTD year derived from `payDate` field, not server clock
- [x] 7e: YTD stub query — add `employee_id` filter
- [x] 7f: Zero-hour guard — withholdings pass $0 when `hours_worked === 0`
- [x] 7g: PFL `remainingCap` — round before `Math.min`

### Security / access control
- [x] B3: RSC data leak — strip employer fields + zelle from RSC payload when role = employee
- [x] B4: Employee PDF access — use admin client for settings fetch in `/api/pdf/stub` and `/api/pdf/w2`
- [x] 13b: schema.sql — remove `INSERT on audit_log to authenticated` (migration 0025 revoked it; schema.sql wasn't updated)
- [ ] 13c: schema.sql — tighten over-broad grants on settings/reminders/onboarding_checklist/tax_rates
- [x] 13d: tax_rates — add employee SELECT policy so stub view doesn't silently fail
- [x] 13e: Push notifications — filing reminders should go to `['admin']` only, not `['admin', 'employee']`
- [x] 13f: `/api/pdf/stub` — enforce variant server-side (remove ?variant=admin attack surface)

### Email pipeline
- [x] 11a: Stub email idempotency — `force` flag required for resends; rejects duplicate first-sends
- [x] 11c: Cron 10-day followup — added `followup_email_sent` guard (new DB column + migration)
- [x] 11d: Cron windowing — changed `=== 20`/`=== 10` to `±1 day` windows
- [ ] 11f: Multi-recipient partial failure — track which recipients failed; don't block `stub_sent=true` on partial success
- [x] 11g: Store Resend message ID + `stub_sent_at` timestamp on stub record
- [x] 11h: `stub_sent` DB update return value — surface error if update fails after send succeeds

### Stub display / compliance
- [x] 10a: Employer phone — render "(123) 456-7890" when null (NY § 195(3) requires unconditional display)
- [x] 10b: Stub deletion — block hard delete when `payment_sent = true` (UI + DB restrictive RLS policy)

### Spec corrections (CLAUDE.md + code comments)
- [x] Correct gross_pay formula: sick leave is unpaid; remove `sick_hours` from the formula
- [x] Correct FROM address: `noreply@payroll.persadpay.com` is correct (not `payroll@persadpay.com`)

---

## Phase 2 — Filings accuracy + compliance display
_Q1 NYS-45 is already past due. Fix filings and stub display issues._

### NYS-45
- [ ] B6a: Add RSF Line 5 — `rsf = ui_taxable_wages × 0.00075`
- [ ] B6b: Add employee count by 12th of each month (3 numbers per quarter)

### Schedule H
- [ ] 8a: Fix line numbering throughout UI (current: 1a/1b/2a/2b/5/6/7/8/9 → actual: 1/2/3/4/5/6/7/8/15/16/26)
- [ ] 8b: Add Additional Medicare Tax lines 5/6 (required even at $0)
- [ ] 8c: Add state UI lines 13/14 (SUTA contributions paid)
- [ ] 8d: FUTA threshold — check prior-year wages too, not only current year
- [ ] 8e: Confirm FICA threshold shows $3,000 for 2026

### 1040-ES
- [ ] 8g: Add safe-harbor surface, YTD payment tracking, annualized projection

### Filings cards (`/filings`)
- [x] Add "Mark Not Applicable" action alongside "Mark Filed" — landed on branch `fix/audit-followups` (migration 0027 adds `filings.not_applicable` + reason with mutual-exclusivity check; `MarkFiledForm` becomes a tri-state status card; "Not applicable" badge in `/filings` list + 4 detail pages + year-end view; `AdminDashboard.NextFilingCard` treats N/A as handled; HYSA withdrawal sync deletes any prior withdrawal when a filing flips to N/A).

### Stub display / compliance
- [ ] 10c: Sick leave summary — show "Unlimited" for accrued balance
- [ ] 10d: Admin PDF — add payment_sent, zelle_transaction_id, stub_sent to audit trail section
- [ ] 10g: Zero-hour stubs — show "0" hours instead of "—"
- [ ] 15f: OT YTD column — show computed YTD value instead of "—"
- [ ] 15g: YTD line items — sum only through this stub's pay date (not full-year total)

### Onboarding checklist
- [ ] 12c: DBL insurance — show warning if `dbl_covered` toggle is on ("you must purchase a DBL policy from NYSIF or a private carrier"); verify toggle is currently off
- [ ] 12d: Add IT-2104-E as a checklist note (employee may qualify for exemption; admin keeps current withholding)
- [ ] 12e: Fix stale URLs (LS-59 → updated DOL link, labor.ny.gov → dol.ny.gov, PFL waiver URL)
- [ ] 12g: W-4 checklist item — clarify "voluntary for household employees; requires signed W-4"

---

## Phase 3 — W-2 completeness + polish
_Ship before end-of-year W-2 season, but no rush before May._

### W-2
- [ ] 9a: Multi-copy W-2 PDF — include Copy B + Copy C + Copy 2 as a single multi-page PDF
- [ ] 9b: Copy B "Notice to Employee" — full IRS Pub 1141 §4 required text
- [ ] 9c: Box 14 (SDI/PFL) — populate in email path (currently blank)
- [ ] 9d: Box 12 — contiguous layout (12a/12b/12c/12d all on same side)
- [ ] 9e: W-2 PDF margins — increase to 36pt (0.5") minimum per Pub 1141
- [ ] 9f: `filed_with_ssa` flag — lock regeneration after W-2 has been filed with SSA
- [ ] 14a: SSN UI alert — warn admin at W-2 generation/download that SSN must be hand-written before distribution

### Polish
- [ ] Nav: Add page transition loader/spinner for mobile navigation
- [ ] Filings cards (`/filings`): inconsistent vertical spacing between cards — add consistent margin/gap between rows
- [ ] schema.sql: Tighten grants + add DST note to cron comment in dates.ts
- [ ] 12a: W-2/W-3 reminder due date — verify Jan 31 2027 (Sunday) handling
