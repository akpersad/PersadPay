/**
 * Employee account screenshot + route-guard test script.
 *
 * 1. Logs in as test-employee@persadpay.com
 * 2. Enrolls TOTP programmatically (saves secret to .employee-totp-secret)
 * 3. Screenshots all employee-accessible routes at 4K + mobile
 * 4. Visits every admin-only route and asserts each redirects to /dashboard
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/screenshot-employee.ts
 */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

const BASE_URL   = 'http://localhost:3000'
const SUPA_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY   = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

const EMP_EMAIL  = 'test-employee@persadpay.com'
const EMP_PASS   = process.env.SCREENSHOT_TEST_EMPLOYEE_PASS ?? 'TestEmployee2026!'
const SECRET_FILE = path.join(__dirname, '.employee-totp-secret')
const OUT_DIR     = path.join(__dirname, 'screenshots-employee')

const VIEWPORTS = [
  { name: 'desktop-4k',         width: 3840, height: 2160 },
  { name: 'mobile-iphone14pro', width: 390,  height: 844  },
]

// Routes the employee should be able to see
const EMPLOYEE_ROUTES = [
  { path: '/dashboard',                    name: 'dashboard'          },
  { path: '/stubs',                        name: 'stubs-list'         },
  { path: '/w2',                           name: 'w2'                 },
  { path: '/settings',                     name: 'settings'           },
  { path: '/documents/sick-leave-summary', name: 'sick-leave-summary' },
]

// Routes that must redirect to /dashboard for employees (14.4 guard)
// /settings is intentionally excluded — employees now have their own settings page there
const ADMIN_ONLY_ROUTES = [
  '/stubs/new',
  '/reminders',
  '/filings',
  '/hysa',
  '/calendar',
  '/documents',
]

// ── TOTP helpers ──────────────────────────────────────────────────────────────

function base32Decode(s: string): Buffer {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  s = s.replace(/=+$/, '').toUpperCase()
  let bits = 0, value = 0
  const out: number[] = []
  for (const c of s) {
    value = (value << 5) | chars.indexOf(c)
    bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}

function generateTotp(secret: string): string {
  const counter = Math.floor(Date.now() / 1000 / 30)
  const buf = Buffer.alloc(8)
  buf.writeBigInt64BE(BigInt(counter))
  const hmac   = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code   = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
  return String(code % 1_000_000).padStart(6, '0')
}

async function ensureEmployeeTotp(): Promise<string> {
  if (fs.existsSync(SECRET_FILE)) {
    console.log('  Using saved employee TOTP secret.')
    return fs.readFileSync(SECRET_FILE, 'utf8').trim()
  }

  console.log('  No employee TOTP secret found — enrolling…')
  const supabase = createClient(SUPA_URL, ANON_KEY, { auth: { persistSession: false } })

  const { data: signIn, error: signInErr } =
    await supabase.auth.signInWithPassword({ email: EMP_EMAIL, password: EMP_PASS })
  if (signInErr || !signIn.session) throw new Error(`Employee sign-in failed: ${signInErr?.message}`)

  // Clean up any stale unverified factors
  const { data: fl } = await supabase.auth.mfa.listFactors()
  for (const f of fl?.totp ?? []) {
    await supabase.auth.mfa.unenroll({ factorId: f.id })
  }

  const { data: enroll, error: enrollErr } = await supabase.auth.mfa.enroll({
    factorType: 'totp', issuer: 'PersadPay', friendlyName: 'EmployeeBot',
  })
  if (enrollErr || !enroll) throw new Error(`Enroll failed: ${enrollErr?.message}`)

  const secret = new URL(enroll.totp.uri).searchParams.get('secret') ?? ''
  if (!secret) throw new Error('Could not parse secret from TOTP URI')

  const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enroll.id })
  if (chErr || !ch) throw new Error(`Challenge failed: ${chErr?.message}`)

  await new Promise(r => setTimeout(r, 2000))
  const { error: verErr } = await supabase.auth.mfa.verify({
    factorId: enroll.id, challengeId: ch.id, code: generateTotp(secret),
  })
  if (verErr) throw new Error(`Verify failed: ${verErr.message}`)

  fs.writeFileSync(SECRET_FILE, secret)
  console.log('  Employee TOTP enrolled and secret saved.')
  return secret
}

// ── Main ──────────────────────────────────────────────────────────────────────

type PwPage = Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>

async function screenshot(page: PwPage, route: { path: string; name: string }, outDir: string) {
  console.log(`  📸 ${route.path}`)
  try {
    await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(outDir, `${route.name}.png`), fullPage: true })
  } catch (err) {
    console.warn(`     ⚠ Failed: ${(err as Error).message.split('\n')[0]}`)
  }
}

async function testAdminRedirects(page: PwPage): Promise<{ pass: number; fail: number }> {
  console.log('\n🔒 Testing admin-only route guards (14.4 — each must redirect to /dashboard)…')
  let pass = 0, fail = 0

  for (const route of ADMIN_ONLY_ROUTES) {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(400)
    const landed = new URL(page.url()).pathname
    const ok = landed === '/dashboard'
    console.log(`  ${ok ? '✅' : '❌'} ${route} → landed at ${landed}`)
    if (ok) pass++; else fail++
  }

  return { pass, fail }
}

async function main() {
  console.log('\n📸 PersadPay Employee Screenshot + Route Guard Test')
  console.log('────────────────────────────────────────────────────')

  const totpSecret = await ensureEmployeeTotp()

  const browser = await chromium.launch({ headless: false, slowMo: 50 })
  const context  = await browser.newContext()
  const page     = await context.newPage()

  // ── Login ────────────────────────────────────────────────────────────────────
  console.log('\n🔐 Logging in as test-employee…')
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]',    EMP_EMAIL)
  await page.fill('input[type="password"]', EMP_PASS)
  await page.click('button[type="submit"]')

  await page.waitForURL('**/auth/verify-mfa', { timeout: 15000 })
  console.log('  At verify-mfa…')
  await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 10000 }).catch(() => null)
  await page.waitForTimeout(500)

  const now = Date.now()
  const msIntoWindow = now % 30000
  if (msIntoWindow > 27000) {
    console.log('  Near TOTP window boundary — waiting…')
    await new Promise(r => setTimeout(r, 30000 - msIntoWindow + 500))
  }

  const code = generateTotp(totpSecret)
  console.log(`  Entering TOTP: ${code}`)
  await page.fill('#totp-code', code)
  await page.click('button[type="submit"]')

  await page.waitForURL('**/dashboard', { timeout: 20000 })
  console.log('  ✅ Authenticated as employee — at dashboard')

  // ── Route guard tests ─────────────────────────────────────────────────────────
  const { pass, fail } = await testAdminRedirects(page)

  // Return to dashboard before screenshotting
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' })

  // Grab a stub ID for detail page
  await page.goto(`${BASE_URL}/stubs`, { waitUntil: 'networkidle' })
  const stubHref = await page.locator('a[href^="/stubs/"]:not([href="/stubs/new"])').first().getAttribute('href').catch(() => null)
  const stubId   = stubHref?.match(/\/stubs\/([0-9a-f-]{36})/)?.[1] ?? null
  if (stubId) console.log(`\n  Stub ID found: ${stubId}`)

  // ── Screenshots ───────────────────────────────────────────────────────────────
  for (const vp of VIEWPORTS) {
    const vpDir = path.join(OUT_DIR, vp.name)
    fs.mkdirSync(vpDir, { recursive: true })
    await page.setViewportSize({ width: vp.width, height: vp.height })
    console.log(`\n📐 ${vp.name} (${vp.width}×${vp.height})`)
    console.log('────────────────────────────────────────────────────')

    for (const route of EMPLOYEE_ROUTES) {
      await screenshot(page, route, vpDir)
    }

    if (stubId) {
      await screenshot(page, { path: `/stubs/${stubId}`, name: 'stubs-detail' }, vpDir)
    }

    // Screenshot one blocked route to show the redirect result
    await page.goto(`${BASE_URL}/reminders`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(vpDir, 'reminders-blocked-redirected-to-dashboard.png'), fullPage: true })
    console.log(`  📸 /reminders → redirected (screenshot saved)`)
  }

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n────────────────────────────────────────────────────')
  console.log(`Route guard results: ${pass}/${pass + fail} admin routes correctly blocked`)
  if (fail > 0) console.log(`  ❌ ${fail} route(s) were NOT redirected — check proxy.ts`)
  console.log(`Screenshots saved to: ${OUT_DIR}`)

  await browser.close()
}

main().catch(err => { console.error(err); process.exit(1) })
