/**
 * Phase 12 screenshot script — captures every route at 4K desktop and iPhone 14 Pro.
 * Run with: npx tsx scripts/screenshot.ts
 *
 * Handles auth fully automatically:
 *   1. Logs in via browser UI using test-admin credentials
 *   2. Verifies TOTP from the saved secret (scripts/.totp-secret)
 *   3. Screenshots all routes once authenticated
 *
 * Prerequisites:
 *   - Run once first to enroll TOTP: npx tsx scripts/enroll-totp.ts
 *   - Or let this script enroll on first run (it will exit with instructions)
 *
 * Screenshots saved to: scripts/screenshots/{viewport}/{route}.png
 */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

const BASE_URL    = 'http://localhost:3000'
const SUPA_URL    = 'https://cmctfwzqumdkthehpqxv.supabase.co'
const ANON_KEY    = 'sb_publishable_Bt5MaklCq9qUTgndTw8mRQ_dYHCiWlr'

const TEST_EMAIL  = 'test-admin@persadpay.com'
const TEST_PASS   = 'TestAdmin2026!'
const SECRET_FILE = path.join(__dirname, '.totp-secret')
const OUT_DIR     = path.join(__dirname, 'screenshots')

const VIEWPORTS = [
  { name: 'desktop-4k',         width: 3840, height: 2160 },
  { name: 'mobile-iphone14pro', width: 390,  height: 844  },
]

const ROUTES = [
  { path: '/',                                         name: 'login'                        },
  { path: '/dashboard',                                name: 'dashboard'                    },
  { path: '/stubs',                                    name: 'stubs-list'                   },
  { path: '/stubs/new',                                name: 'stubs-new'                    },
  { path: '/reminders',                                name: 'reminders'                    },
  { path: '/w2',                                       name: 'w2'                           },
  { path: '/settings',                                 name: 'settings'                     },
  { path: '/settings/history',                         name: 'settings-history'             },
  { path: '/settings/withholding-forms',               name: 'settings-withholding-forms'   },
  { path: '/filings',                                  name: 'filings'                      },
  { path: '/filings/nys-45/2026/1',                   name: 'filings-nys45-2026-q1'        },
  { path: '/filings/nys-45/2026/2',                   name: 'filings-nys45-2026-q2'        },
  { path: '/filings/schedule-h/2026',                 name: 'filings-schedule-h-2026'      },
  { path: '/filings/federal-estimated-tax/2026/2',    name: 'filings-fed-est-2026-q2'      },
  { path: '/filings/year-end/2026',                   name: 'filings-year-end-2026'        },
  { path: '/hysa',                                    name: 'hysa'                         },
  { path: '/calendar',                                name: 'calendar'                     },
  { path: '/documents',                               name: 'documents'                    },
  { path: '/documents/sick-leave-policy',             name: 'documents-sick-leave-policy'  },
  { path: '/documents/sick-leave-summary?year=2026', name: 'documents-sick-leave-summary' },
]

// ── Pure-Node TOTP (RFC 6238) ─────────────────────────────────────────────────

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

// ── Ensure TOTP is enrolled ───────────────────────────────────────────────────

async function ensureTotp(): Promise<string> {
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim()
  }

  console.log('\n  No .totp-secret file found — enrolling TOTP for test-admin…')
  const supabase = createClient(SUPA_URL, ANON_KEY, { auth: { persistSession: false } })

  const { data: signIn, error: signInErr } =
    await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASS })
  if (signInErr || !signIn.session) throw new Error(`Sign-in: ${signInErr?.message}`)

  // Remove any existing unverified factors
  const { data: fl } = await supabase.auth.mfa.listFactors()
  for (const f of fl?.totp ?? []) {
    if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  }

  const { data: enroll, error: enrollErr } = await supabase.auth.mfa.enroll({
    factorType: 'totp', issuer: 'PersadPay', friendlyName: 'ScreenshotBot',
  })
  if (enrollErr || !enroll) throw new Error(`Enroll: ${enrollErr?.message}`)

  const secret = new URL(enroll.totp.uri).searchParams.get('secret') ?? ''
  if (!secret) throw new Error('Could not parse secret from TOTP URI')

  // Verify to activate the factor
  const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enroll.id })
  if (chErr || !ch) throw new Error(`Challenge: ${chErr?.message}`)

  await new Promise(r => setTimeout(r, 2000)) // small buffer to avoid same-window reuse
  const { error: verErr } = await supabase.auth.mfa.verify({
    factorId: enroll.id, challengeId: ch.id, code: generateTotp(secret),
  })
  if (verErr) throw new Error(`Verify: ${verErr.message}`)

  fs.writeFileSync(SECRET_FILE, secret)
  console.log('  TOTP enrolled and secret saved to scripts/.totp-secret')
  return secret
}

// ── Screenshot ────────────────────────────────────────────────────────────────

type PwPage = Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>

async function screenshot(page: PwPage, route: { path: string; name: string }, outDir: string) {
  console.log(`  → ${route.path}`)
  try {
    await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(outDir, `${route.name}.png`), fullPage: true })
  } catch (err) {
    console.warn(`    ⚠ Failed: ${(err as Error).message.split('\n')[0]}`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n📸 PersadPay Phase 12 Screenshot Script')
  console.log('─────────────────────────────────────────')

  const totpSecret = await ensureTotp()

  const browser = await chromium.launch({ headless: false, slowMo: 50 })
  const context = await browser.newContext()
  const page = await context.newPage()

  // ── Step 1: Login ────────────────────────────────────────────────────────────
  console.log('\n🔐 Logging in via browser UI…')
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.fill('input[type="email"]',    TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASS)
  await page.click('button[type="submit"]')

  // ── Step 2: MFA verification ─────────────────────────────────────────────────
  await page.waitForURL('**/auth/verify-mfa', { timeout: 15000 })
  console.log('  At verify-mfa — waiting for factor to load…')
  // Wait for the Verify button to be enabled (factor ID has loaded)
  await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 10000 })
    .catch(() => null)
  await page.waitForTimeout(500)

  // Generate TOTP — wait until we're at least 2s into the current 30s window
  // to avoid boundary issues
  const now = Date.now()
  const msIntoWindow = now % 30000
  if (msIntoWindow > 27000) {
    console.log('  Near window boundary — waiting for next TOTP window…')
    await new Promise(r => setTimeout(r, 30000 - msIntoWindow + 500))
  }

  const code = generateTotp(totpSecret)
  console.log(`  Entering TOTP code: ${code}`)
  await page.fill('#totp-code', code)
  await page.click('button[type="submit"]')

  await page.waitForURL('**/dashboard', { timeout: 20000 })
  console.log('  ✅ At dashboard — authenticated')

  // ── Step 3: Grab a stub ID ───────────────────────────────────────────────────
  await page.goto(`${BASE_URL}/stubs`, { waitUntil: 'networkidle' })
  // Exclude /stubs/new — match only UUID-like stub IDs
  const stubHref = await page.locator('a[href^="/stubs/"]:not([href="/stubs/new"])').first().getAttribute('href').catch(() => null)
  const stubId   = stubHref?.match(/\/stubs\/([0-9a-f-]{36})/)?.[1] ?? null
  if (stubId) console.log(`  Stub ID for detail pages: ${stubId}`)

  // ── Step 4: Screenshots ──────────────────────────────────────────────────────
  for (const vp of VIEWPORTS) {
    const vpDir = path.join(OUT_DIR, vp.name)
    fs.mkdirSync(vpDir, { recursive: true })
    await page.setViewportSize({ width: vp.width, height: vp.height })
    console.log(`\n📐 ${vp.name} (${vp.width}×${vp.height})`)
    console.log('─────────────────────────────────────────')

    for (const route of ROUTES) {
      await screenshot(page, route, vpDir)
    }
    if (stubId) {
      await screenshot(page, { path: `/stubs/${stubId}`,      name: 'stubs-detail' }, vpDir)
      await screenshot(page, { path: `/stubs/${stubId}/edit`, name: 'stubs-edit'   }, vpDir)
    }
  }

  console.log(`\n✅ All screenshots saved to: ${OUT_DIR}\n`)
  await browser.close()
}

main().catch(err => { console.error(err); process.exit(1) })
