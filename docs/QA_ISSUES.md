# PersadPay QA Issues Tracker

**Audit date:** 2026-05-12  
**Branch at time of audit:** `bugfix/employee-invite-issue`  
**Auditor:** Claude Code (comprehensive audit of all user flows)  
**Status key:** `[ ]` open · `[~]` in progress · `[x]` fixed · `[-]` won't fix / accepted risk

---

## How to use this doc

Each issue has everything needed to fix it without re-investigating:
- Exact file path + line numbers (at time of audit — may drift slightly)
- Root cause
- Specific fix instruction

Work through by severity order: Critical → High → Medium → Low.  
After fixing a group, commit with a message referencing the issue numbers.  
**Note:** Issue IDs are not perfectly sequential (e.g. H-5 appears before H-3) — items were added across two audit passes. IDs are labels only; work top-to-bottom within each severity section.

---

## App context (for cold-start sessions)

- **Stack:** Next.js App Router, Supabase (Postgres + Auth + RLS), Tailwind/shadcn, `@react-pdf/renderer` (server-side only), Resend email
- **Roles:** `admin` (2 users) and `employee` (1 user — babysitter Melina)
- **TOTP MFA enforced for all users**
- **Middleware:** `src/proxy.ts` (not `middleware.ts`) — handles auth, MFA enforcement, and role-based route guards
- **Admin client:** `createAdminClient()` from `src/lib/supabase/server.ts` — uses service role key, bypasses RLS. Use for server-side fetches that need to read across roles (e.g., settings fetched on employee pages).
- **Tax rates:** Live in `tax_rates` Postgres table via `getTaxRatesForYear(supabase, year)` in `src/lib/tax.ts` — never hardcode
- **PDF generation:** Server-side only in `src/lib/pdf/` — never client-side
- **Stub numbering:** DB trigger `paystubs_assign_stub_number` assigns atomically; never trust client-sent value
- **Settings table:** Single row. RLS allows admin read/write only. Employees have no access.
- **`proxy.ts` MFA logic:** If `currentLevel === 'aal1' && nextLevel === 'aal2'` → redirect to `/auth/verify-mfa`. If `currentLevel === 'aal1' && nextLevel === 'aal1'` (no factor enrolled) → redirect to `/auth/enroll-mfa`.
- **Next.js 16 proxy note:** Next.js 16 added `PROXY_FILENAME = 'proxy'` — `src/proxy.ts` exporting `proxy(request)` IS correctly compiled as middleware. Confirmed by `.next/dev/server/middleware.js` referencing `src/proxy.ts`. Do NOT rename to `middleware.ts`.

---

## CRITICAL

### [ ] C-1 · Employee sick-leave-summary: settings fetch blocked by RLS
**Flow:** Employee → `/documents/sick-leave-summary`  
**File:** `src/app/(app)/documents/sick-leave-summary/page.tsx` ~lines 54–58  
**Symptom:** Page renders with "Employer" and "Employee" as placeholder text instead of real names/address. No error shown.  
**Root cause:** The settings fetch uses the employee's Supabase session client. The `settings` RLS policy is `is_admin()` only — employee gets `null` back silently.  
**Fix:** Replace the settings fetch with `createAdminClient()` (same pattern used in PDF API routes and W-2 routes).  
```ts
// Before:
const { data: settings } = await supabase.from('settings').select('*').single()
// After:
const adminClient = createAdminClient()
const { data: settings } = await adminClient.from('settings').select('*').single()
```
**Verified open:** `src/app/(app)/documents/sick-leave-summary/page.tsx` line 55 still uses `supabase.from('settings')` with the employee's session client. Not yet fixed.

---

## HIGH

### [ ] H-1 · New stub: no date ordering validation
**Flow:** Admin → `/stubs/new`  
**File:** `src/components/stubs/NewStubForm.tsx` ~line 408 (`canPreview` logic)  
**Symptom:** Admin can set `pay_period_end` before `pay_period_start`. The form allows preview and save. Saved stub has inverted dates, which corrupts YTD calculations for all subsequent stubs (YTD sums stubs ordered by date).  
**Root cause:** `canPreview` only checks that both date fields are non-empty, not their ordering.  
**Fix:**
1. In `canPreview` (or equivalent derived boolean), add: `periodEnd >= periodStart`
2. In `saveStub()` server action / API handler, add the same guard and return a 400 if violated
3. Show inline field error: "End date must be on or after start date"

---

### [ ] H-2 · New stub: `setSaving(false)` missing on success path
**Flow:** Admin → `/stubs/new` → save  
**File:** `src/components/stubs/NewStubForm.tsx` ~lines 399–404 (inside `saveStub`)  
**Symptom:** After successful save, the Save button remains in "Saving…" / disabled state permanently if Next.js router navigation is slow or the user presses back.  
**Root cause:** `setSaving(false)` is called in error branches but not before `router.push(...)` on the success branch.  
**Fix:** Add `setSaving(false)` immediately before each `router.push(...)` call in `saveStub`.

---

### [ ] H-5 · Set-password: no session guard on page mount — raw Supabase error shown on direct navigation
**Flow:** Employee onboarding → `/auth/set-password`  
**File:** `src/app/auth/set-password/page.tsx`  
**Symptom:** The page has no `useEffect` session check. If an employee navigates directly to `/auth/set-password` without a valid session (expired invite, direct URL), the form renders normally. On submit, `supabase.auth.updateUser()` fails with "Auth session missing" and the raw Supabase error message is displayed via `setError(error.message)`. The user sees a technical error with no recovery instruction.  
**Root cause:** No session check on mount; relies entirely on the upstream `/auth/confirm` flow having established a session. The page is in `MFA_PATHS` (so middleware allows it through) but does not self-validate.  
**Fix:** Add a `useEffect` session check — if no session, redirect to `/`:
```ts
useEffect(() => {
  createClient().auth.getUser().then(({ data: { user } }) => {
    if (!user) router.replace('/')
  })
}, [router])
```
Also: replace `setError(error.message)` with a user-friendly message for the "Auth session missing" case: "Your session has expired. Please use the invitation link again or contact your employer."

---

### [ ] H-3 · W-2 calculate: no `employee_id` filter on paystubs fetch
**Flow:** Admin → `/w2` → Preview W-2  
**File:** `src/app/api/w2/calculate/route.ts` ~lines 26–31  
**Symptom:** W-2 wages aggregate stubs from ALL employees if any test/additional employee stubs exist. `employee_id` is taken from `typedStubs[0].employee_id` — the first stub returned — rather than being explicitly filtered.  
**Root cause:** Missing `.eq('employee_id', ...)` on the paystubs query.  
**Fix:**
1. Before the paystubs query, fetch the employee profile (the single `role = 'employee'` row from `profiles`)
2. Add `.eq('employee_id', employeeProfile.id)` to the paystubs query
3. Use that same `employee_id` for the W-2 record — don't derive it from stub data
```ts
// Fetch canonical employee
const { data: emp } = await adminClient
  .from('profiles').select('id').eq('role', 'employee').single()
// Then filter stubs
.eq('employee_id', emp.id)
```

---

### [ ] H-4 · W-2 view: `CURRENT_YEAR` is a build-time constant
**Flow:** Admin or employee → `/w2`  
**File:** `src/components/w2/W2View.tsx` ~line 25  
**Symptom:** On Jan 1 of a new year, a cached PWA bundle compiled in the previous December shows last year's most recent selectable tax year. Admin cannot generate the current year's W-2 without reinstalling the PWA or forcing a refresh.  
**Root cause:** `const CURRENT_YEAR = new Date().getFullYear()` at module level in a `'use client'` component. The value is frozen in the compiled JS bundle cached by the service worker.  
**Fix:** Move `CURRENT_YEAR` computation inside the component function body (not module scope):
```ts
// Before (module level):
const CURRENT_YEAR = new Date().getFullYear()

// After (inside component):
export default function W2View(...) {
  const CURRENT_YEAR = new Date().getFullYear()
  ...
}
```

---

## MEDIUM

### [ ] M-1 · Set-password: `setLoading(false)` missing on success path
**Flow:** New user onboarding → `/auth/set-password`  
**File:** `src/app/auth/set-password/page.tsx` ~lines 31–42  
**Symptom:** On slow networks/PWA, the "Set password & continue" button stays in "Saving…" disabled state after `updateUser` succeeds. If navigation is intercepted (back button, PWA), user cannot retry.  
**Fix:** Call `setLoading(false)` before `router.push('/auth/enroll-mfa')`.

---

### [ ] M-2 · Enroll-MFA: no retry or sign-out escape when enrollment fails
**Flow:** Any user (especially employee on iOS PWA) → `/auth/enroll-mfa` with a fatal enrollment error  
**File:** `src/app/auth/enroll-mfa/page.tsx` ~lines 77–88 (the `enrollError` render branch)  
**Symptom:** If `mfa.enroll` fails (e.g., network error — the stale-factor cleanup runs first but the subsequent enroll call can still fail), user sees the error card with no way to retry and no way to sign out. They are authenticated (AAL1) but middleware redirects every app route back to `/auth/enroll-mfa`. On iOS PWA there is no obvious browser reload affordance.  
**Fix:** Add both a retry button and a sign-out escape in the `enrollError` state:
```tsx
<Button onClick={startEnrollment}>Try Again</Button>
<Button variant="outline" onClick={async () => {
  await createClient().auth.signOut()
  window.location.href = '/'
}}>
  Sign out and try again
</Button>
```

---

### [ ] M-3 · Verify-MFA: silent disabled button when no factor found
**Flow:** Login → `/auth/verify-mfa`  
**File:** `src/app/auth/verify-mfa/page.tsx` ~lines 17–25  
**Symptom:** If `listFactors()` returns no verified TOTP factor (e.g., factor was unenrolled in another tab), `factorId` is `null`, the Verify button is permanently disabled, and there is no error message explaining why. User is stuck.  
**Fix:** When `factorId` remains `null` after the fetch, show an error message: "No authenticator found. Please sign out and sign in again." with a sign-out link.

---

### [ ] M-4 · Stub email: `partialErrors` not surfaced in UI
**Flow:** Admin → stub detail → "Email Paystub"  
**Files:** `src/app/api/email/stub/route.ts` ~line 141, `src/components/stubs/StubDetail.tsx` ~lines 112–116  
**Symptom:** If the employee email succeeds but an `additional_emails` recipient fails, the API returns `{ success: true, partialErrors: [...] }`. The client only checks `res.ok` and shows "Pay stub emailed successfully." The delivery failure is silent.  
**Fix:** After a successful response, parse the JSON and check `partialErrors`:
```ts
const json = await res.json()
if (json.partialErrors?.length) {
  toast.warning(`Stub emailed, but ${json.partialErrors.length} recipient(s) failed: ${json.partialErrors.join(', ')}`)
} else {
  toast.success('Pay stub emailed successfully.')
}
```

---

### [ ] M-5 · W-2 save+email: email silently not sent if SSN dialog dismissed
**Flow:** Admin → `/w2` → "Save & Email" → dismisses SSN dialog  
**File:** `src/components/w2/W2View.tsx` ~lines 93–109  
**Symptom:** `saveAndEmail` saves the W-2 to the DB, then opens an SSN confirmation dialog. If admin presses Cancel/Escape, the W-2 is saved but no email is sent. No toast or indicator shows the email is pending. Admin may not realize.  
**Fix:** On dialog cancel (`onCancel`), show a toast: "W-2 saved. Email was not sent — use the Email button on the W-2 record to send it."

---

### [ ] M-6 · Reminders dismiss: insert error silently swallowed
**Flow:** Admin → `/reminders` → dismiss reminder  
**File:** `src/components/reminders/RemindersView.tsx` ~lines 54–65  
**Symptom:** If the insert of next year's replacement reminder fails (Supabase error, constraint violation), the current reminder is marked dismissed and `toast.success` fires. Next year's reminder is silently never created.  
**Root cause:** `const [{ error }] = await Promise.all([update, insert])` — only destructures the first (update) result.  
**Fix:**
```ts
const [{ error: updateError }, { error: insertError }] = await Promise.all([update, insert])
if (updateError || insertError) {
  toast.error('Failed to dismiss reminder. Please try again.')
  return
}
```

---

### [ ] M-7 · Reminders dismiss: year regex replaces wrong occurrence in title
**Flow:** Admin → `/reminders` → dismiss reminder  
**File:** `src/components/reminders/RemindersView.tsx` ~line 52  
**Symptom:** `nextTitle` uses `.replace(/\d{4}/, String(nextYear))` — unanchored, replaces the **first** 4-digit sequence. If the title is "NY § 195-3 — Q4 2026" the regex would match "1953" before "2026".  
**Fix:** Anchor to end of string or use a more specific pattern:
```ts
const nextTitle = reminder.title.replace(/\b20\d{2}\b(?=[^0-9]*$)/, String(nextYear))
```

---

### [ ] M-8 · Settings: save silently no-ops if settings row not pre-seeded
**Flow:** Admin → `/settings` → Save (on a fresh instance with no settings row)  
**File:** `src/components/settings/SettingsForm.tsx` ~line 79  
**Symptom:** If `initial` is `null` (no settings row exists yet), `update` with `.eq('id', '')` matches nothing. Supabase returns no error (0 rows updated). `toast.success('Settings saved.')` fires but nothing was actually saved.  
**Root cause:** Form uses `update` only — no `insert` path for the initial case.  
**Fix:** Use `upsert` with `onConflict: 'id'`:
```ts
const { error } = await supabase
  .from('settings')
  .upsert({ id: initial?.id ?? crypto.randomUUID(), ...payload })
  .eq('id', initial?.id ?? '')  // remove this line when using upsert
```
Or more cleanly: check `initial?.id` — if null, do `.insert()`, else do `.update().eq('id', initial.id)`.

---

### [ ] M-12 · Stub detail + PDF: YTD query has no explicit `employee_id` filter (defense-in-depth gap)
**Flow:** Employee → `/stubs/[id]` + PDF download  
**Files:** `src/app/(app)/stubs/[id]/page.tsx` lines 37–41; `src/app/api/pdf/stub/route.ts` lines 34–40  
**Symptom:** No current user-visible bug — RLS on `paystubs` correctly limits employee queries to their own rows. However both the page and the PDF API route query `paystubs` for YTD without `.eq('employee_id', stub.employee_id)`. If RLS were misconfigured, or if an admin-context bug caused the wrong session client to be used, YTD figures on the employee's stub would silently incorporate other employees' wages.  
**Root cause:** Reliance on RLS alone without explicit filter — single point of failure.  
**Fix:** Add `.eq('employee_id', stub.employee_id)` to both YTD queries:
```ts
const { data: ytdStubs } = await supabase
  .from('paystubs')
  .select('*')
  .eq('employee_id', stub.employee_id)  // add this
  .gte('pay_date', `${payYear}-01-01`)
  .lte('pay_date', `${payYear}-12-31`)
```

---

### [ ] M-9 · Employee settings: password change requires no current password
**Flow:** Employee → `/settings` → Change Password  
**File:** `src/components/settings/ChangePasswordCard.tsx` ~line 34  
**Symptom:** `supabase.auth.updateUser({ password: newPassword })` only requires an active session. Anyone with a briefly unlocked phone (session alive) can change the password without knowing the current one.  
**Root cause:** Supabase `updateUser` doesn't re-authenticate by default.  
**Fix:** Add a "Current password" field. Before calling `updateUser`, verify the current password with `signInWithPassword({ email, password: currentPassword })`. If it fails, show "Current password is incorrect." and abort.

---

### [ ] M-10 · API: `/api/stubs/export` auth guard unconfirmed
**Flow:** Admin → stubs export (CSV)  
**File:** `src/app/api/stubs/export/route.ts`  
**Symptom:** Unknown — route was not audited for admin-only enforcement.  
**Fix:** Audit the file. Confirm it has an admin check equivalent to other API routes (e.g., `createServerClient` + profile role check). If missing, add it.

---

### [ ] M-11 · PDF generation: no try-catch — unhandled exceptions return unformatted 500
**Flow:** Any user → download PDF (stub or W-2)  
**Files:** `src/app/api/pdf/stub/route.ts` ~line 107, `src/app/api/pdf/w2/route.ts` ~line 48  
**Symptom:** If `renderToBuffer` throws (e.g., a `NaN` value in a numeric field, `@react-pdf/renderer` internal error), the API returns an unformatted 500 with no JSON body. The client-side download opens a blank/error tab with no actionable message.  
**Fix:** Wrap `generateStubPDF` / `generateW2PDF` calls in try-catch:
```ts
try {
  const buffer = await generateStubPDF(...)
  return new Response(buffer, { headers: { 'Content-Type': 'application/pdf' } })
} catch (err) {
  console.error('PDF generation failed:', err)
  return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 })
}
```

---

## LOW

### [ ] L-1 · `/auth/confirm`: `recovery` token type gives opaque "invalid link" error
**File:** `src/app/auth/confirm/page.tsx` ~line 8  
**Fix:** Add `'recovery'` to a separate branch that redirects to `/auth/reset-password` with params forwarded, instead of showing "Invalid link."

---

### [ ] L-2 · Login: no return-to URL after session expiry redirect
**File:** `src/components/auth/LoginForm.tsx` ~line 34  
**Symptom:** User visiting `/stubs/123` with expired session is redirected to `/`. After login they land on `/dashboard`, not `/stubs/123`.  
**Fix:** Middleware captures `pathname` into a `?returnTo=` query param when redirecting to `/`. Login form reads `returnTo` and uses it as the post-login destination.

---

### [ ] L-3 · Verify-MFA page: recovery session navigation edge case
**File:** `src/app/auth/verify-mfa/page.tsx`  
**Symptom:** User who navigates away from `/auth/reset-password` before completing it, while having an enrolled TOTP factor, is redirected to `/auth/verify-mfa`. Correct security behavior but confusing UX.  
**Fix:** Low priority — no code change needed, but consider adding copy: "You were redirected here to verify your identity."

---

### [ ] L-4 · New stub preview: stub number can be stale if concurrent admin session generates a stub
**File:** `src/app/(app)/stubs/new/page.tsx` ~line 92  
**Symptom:** Preview shows "Stub #X Preview" but saved stub may be #X+1 due to the atomic DB trigger.  
**Fix:** Show "Stub #TBD (assigned on save)" in preview, or show the actual assigned number only post-save.

---

### [ ] L-5 · Stub detail: delete with no RLS error message surfacing
**File:** `src/components/stubs/StubDetail.tsx` ~lines 173–184  
**Note:** RLS correctly blocks deletion of paid stubs. The UI handles the error with a generic toast. Consider making the error message more specific: "Cannot delete a stub after payment has been marked sent."

---

### [ ] L-6 · Stub email: `force` value is stale snapshot from page load
**File:** `src/components/stubs/StubDetail.tsx` ~line 103  
**Symptom:** If stub was emailed in another tab, the "Email Paystub" button still shows (stale `stub_sent = false`). Clicking it sends a 409 from the API. The error message is generic.  
**Fix:** After 409, show: "This stub was already emailed. To resend, use the Resend Email option." (The `router.refresh()` after the 409 will already update the button state.)

---

### [ ] L-7 · W-2: tax year dropdown shows years with no payroll data
**File:** `src/components/w2/W2View.tsx`  
**Symptom:** Dropdown shows 5 years back from current year regardless of when payroll started. Selecting a year with no stubs shows a "Failed to calculate" toast only after clicking Preview.  
**Fix:** Pre-filter `TAX_YEARS` to years where at least one paystub's `pay_date` falls in that year. Disable or omit years with no data.

---

### [ ] L-8 · W-2: existing W-2 warning triggers after save, not before download
**File:** `src/components/w2/W2View.tsx` ~lines 93–109  
**Note:** Minor flow ordering issue — regeneration confirmation dialog fires at the right point. Acceptable as-is.

---

### [ ] L-9 · Reminders: StrictMode double-fire on `/auth/confirm` OTP
**File:** `src/app/auth/confirm/page.tsx`  
**Note:** Development-only issue (React StrictMode double-invokes effects). Add a `useRef` guard. Production is unaffected.

---

### [ ] L-10 · Missing custom error.tsx and not-found.tsx pages
**Files:** `src/app/error.tsx`, `src/app/(app)/error.tsx`, `src/app/not-found.tsx` — do not exist  
**Symptom:** Unhandled server errors and 404s show default Next.js/Vercel pages instead of branded Persad Pay pages.  
**Fix:** Create minimal `error.tsx` and `not-found.tsx` with a simple "Something went wrong" / "Page not found" card and a link back to `/dashboard`.

---

### [ ] L-11 · Bottom nav: progress animation never resets on navigation failure
**File:** `src/components/nav/BottomNav.tsx` ~lines 75–82  
**Symptom:** If Next.js navigation fails (network error), `transitioningTo` is never cleared — progress bar animates forever.  
**Fix:** Add a `setTimeout` fallback (e.g., 5 seconds) that clears `transitioningTo` if `pathname` hasn't changed.

---

### [ ] L-14 · Employee dashboard: `.single()` instead of `.maybeSingle()` — silent PGRST116 console error
**Flow:** Employee → `/dashboard` (when no stubs exist yet)  
**File:** `src/components/dashboard/EmployeeDashboard.tsx` line 22  
**Symptom:** When Melina has no stubs, `.single<Paystub>()` returns `{ data: null, error: { code: 'PGRST116' } }`. The UI empty state renders correctly (the `latestStub ?` check handles `null`). But PGRST116 errors appear in the console/Vercel logs, which can obscure real errors.  
**Fix:** Change `.single<Paystub>()` to `.maybeSingle<Paystub>()` — returns `{ data: null, error: null }` cleanly on zero rows.

---

### [ ] L-15 · Employee header: client-side `signOut()` may leave stale server session on iOS PWA
**Flow:** Employee → account dialog → Sign Out  
**File:** `src/components/nav/EmployeeHeader.tsx` lines 16–20  
**Symptom:** `supabase.auth.signOut()` + `router.push('/')` + `router.refresh()` clears the client-side session. On iOS PWA with aggressive cookie handling, the httpOnly server session cookie may not be cleared immediately. Subsequent requests before the full reload completes could be made with a stale authenticated session.  
**Root cause:** Client-side `signOut()` vs. the server-side `/api/auth/sign-out` route handler (which calls `supabase.auth.signOut()` server-side, ensuring complete cookie clearing).  
**Fix:** Replace client-side signOut with a redirect to the server-side handler:
```ts
async function signOut() {
  window.location.href = '/api/auth/sign-out'
}
```

---

### [ ] L-12 · PWA: service worker can cache stale `CURRENT_YEAR` bundle
**Note:** Downstream consequence of H-4. Fixed by H-4. No separate action needed.

---

### [ ] L-13 · Mark Payment Sent: Zelle ID overwrite on double-dialog interaction
**File:** `src/components/stubs/StubDetail.tsx`  
**Symptom:** Race between dialog close and re-open can cause a second `UPDATE` with a different Zelle ID. Idempotent on `payment_sent` but the ID could change.  
**Fix:** Low priority — disable the "Mark Payment Sent" button after first success until `router.refresh()` completes.

---

## Completed fixes log

| Date | Issue(s) | Commit | Notes |
|------|----------|--------|-------|
| 2026-05-12 | MFA invite flow — stuck unverified factor | `94b3879` | `listFactors()` + `unenroll()` stale factor before re-enrolling; better error message |
