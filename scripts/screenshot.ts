/**
 * Phase 11 screenshot script — captures every route at 4K desktop and iPhone 14 Pro.
 * Run with: npx tsx scripts/screenshot.ts
 *
 * The browser opens headed so you can complete login + MFA manually.
 * Once the dashboard loads, automation takes over.
 *
 * Screenshots are saved to: scripts/screenshots/{viewport}/{route}.png
 */

import { chromium } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const BASE_URL = 'http://localhost:3000'
const OUT_DIR = path.join(__dirname, 'screenshots')

const VIEWPORTS = [
  { name: 'desktop-4k', width: 3840, height: 2160 },
  { name: 'mobile-iphone14pro', width: 390, height: 844 },
]

// Static routes — these are all visited for both viewports
const STATIC_ROUTES = [
  { path: '/', name: 'login' },
  { path: '/dashboard', name: 'dashboard' },
  { path: '/stubs', name: 'stubs-list' },
  { path: '/stubs/new', name: 'stubs-new' },
  { path: '/reminders', name: 'reminders' },
  { path: '/w2', name: 'w2' },
  { path: '/settings', name: 'settings' },
  { path: '/settings/history', name: 'settings-history' },
  { path: '/settings/withholding-forms', name: 'settings-withholding-forms' },
  { path: '/filings', name: 'filings' },
  { path: '/filings/nys-45/2026/1', name: 'filings-nys45-2026-q1' },
  { path: '/filings/nys-45/2026/2', name: 'filings-nys45-2026-q2' },
  { path: '/filings/schedule-h/2026', name: 'filings-schedule-h-2026' },
  { path: '/filings/federal-estimated-tax/2026/2', name: 'filings-fed-est-2026-q2' },
  { path: '/filings/year-end/2026', name: 'filings-year-end-2026' },
  { path: '/hysa', name: 'hysa' },
  { path: '/calendar', name: 'calendar' },
  { path: '/documents', name: 'documents' },
  { path: '/documents/sick-leave-policy', name: 'documents-sick-leave-policy' },
  { path: '/documents/sick-leave-summary?year=2026', name: 'documents-sick-leave-summary' },
]

async function screenshot(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>,
  route: { path: string; name: string },
  outDir: string,
) {
  console.log(`  → ${route.path}`)
  try {
    await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 20000 })
    // Allow lazy-loaded content to settle
    await page.waitForTimeout(800)
    await page.screenshot({
      path: path.join(outDir, `${route.name}.png`),
      fullPage: true,
    })
  } catch (err) {
    console.warn(`    ⚠ Failed: ${(err as Error).message.split('\n')[0]}`)
  }
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 50 })
  const context = await browser.newContext()
  const page = await context.newPage()

  // ── Step 1: Wait for the user to authenticate ──────────────────────────────
  console.log('\n📸 PersadPay Phase 11 Screenshot Script')
  console.log('─────────────────────────────────────────')
  console.log('1. A browser window will open at the login page.')
  console.log('2. Log in with your admin credentials and complete MFA.')
  console.log('3. Once the dashboard loads, automation takes over.\n')

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
  console.log('⏳ Waiting for you to log in and reach /dashboard ...\n')
  await page.waitForURL('**/dashboard', { timeout: 300_000 })
  console.log('✅ Logged in. Starting screenshots.\n')

  // ── Step 2: Grab a stub ID for the detail / edit pages ────────────────────
  await page.goto(`${BASE_URL}/stubs`, { waitUntil: 'networkidle' })
  const stubHref = await page.locator('a[href^="/stubs/"]').first().getAttribute('href').catch(() => null)
  const stubId = stubHref?.match(/\/stubs\/([^/?]+)/)?.[1] ?? null
  if (stubId) {
    console.log(`Found stub ID for detail screenshots: ${stubId}\n`)
  } else {
    console.log('No stubs found — skipping stub detail / edit screenshots.\n')
  }

  // ── Step 3: Screenshot every viewport ─────────────────────────────────────
  for (const vp of VIEWPORTS) {
    const vpDir = path.join(OUT_DIR, vp.name)
    fs.mkdirSync(vpDir, { recursive: true })

    await page.setViewportSize({ width: vp.width, height: vp.height })
    console.log(`\n📐 Viewport: ${vp.name} (${vp.width}×${vp.height})`)
    console.log('─────────────────────────────────────────')

    // Static routes
    for (const route of STATIC_ROUTES) {
      await screenshot(page, route, vpDir)
    }

    // Dynamic stub routes (only when a stub exists)
    if (stubId) {
      await screenshot(page, { path: `/stubs/${stubId}`, name: 'stubs-detail' }, vpDir)
      await screenshot(page, { path: `/stubs/${stubId}/edit`, name: 'stubs-edit' }, vpDir)
    }
  }

  // ── Step 4: Done ──────────────────────────────────────────────────────────
  console.log(`\n✅ All screenshots saved to: ${OUT_DIR}\n`)
  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
