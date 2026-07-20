import { describe, it, expect } from 'vitest'
import { rollForwardReminder } from './reminders'

function roll(title: string, due_date: string) {
  return rollForwardReminder({ title, due_date, description: 'desc' })
}

describe('rollForwardReminder', () => {
  it('advances due date one calendar year, keeping month-day', () => {
    expect(roll('NYS-45 Q2 2026', '2026-07-31').due_date).toBe('2027-07-31')
  })

  it('increments the title year when it matches the due year', () => {
    expect(roll('NYS-45 Q2 2026', '2026-07-31').title).toBe('NYS-45 Q2 2027')
  })

  it('increments the title tax year, not the due year (Schedule H)', () => {
    const next = roll('Schedule H 2026', '2027-04-15')
    expect(next.title).toBe('Schedule H 2027')
    expect(next.due_date).toBe('2028-04-15')
  })

  it('handles NYS-45 Q4 whose title carries the prior tax year', () => {
    const next = roll('NYS-45 Q4 2026', '2027-01-31')
    expect(next.title).toBe('NYS-45 Q4 2027')
    expect(next.due_date).toBe('2028-01-31')
  })

  it('handles 1040-ES Q4 whose title carries the prior tax year', () => {
    const next = roll('Federal Estimated Tax Q4 2026', '2027-01-15')
    expect(next.title).toBe('Federal Estimated Tax Q4 2027')
    expect(next.due_date).toBe('2028-01-15')
  })

  it('handles the W-2/W-3 reminder (statutory Jan 31 stays month-day stable)', () => {
    const next = roll('W-2 / W-3 to employee + SSA 2026', '2027-01-31')
    expect(next.title).toBe('W-2 / W-3 to employee + SSA 2027')
    expect(next.due_date).toBe('2028-01-31')
  })

  it('handles a title year mid-string (Verify tax rates)', () => {
    const next = roll('Verify 2027 tax rates', '2026-12-01')
    expect(next.title).toBe('Verify 2028 tax rates')
    expect(next.due_date).toBe('2027-12-01')
  })

  it('leaves a title without a year unchanged', () => {
    expect(roll('File something important', '2026-06-01').title).toBe('File something important')
  })

  it('resets dismissed and email_sent flags', () => {
    const next = roll('NYS-45 Q3 2026', '2026-10-31')
    expect(next.dismissed).toBe(false)
    expect(next.email_sent).toBe(false)
  })

  it('carries a year-free description through verbatim', () => {
    expect(roll('NYS-45 Q3 2026', '2026-10-31').description).toBe('desc')
  })

  it('bumps every year token in the description', () => {
    const next = rollForwardReminder({
      title: 'Schedule H 2025',
      due_date: '2026-04-15',
      description: 'Covers household employment taxes for wages paid in 2025. File by Apr 15, 2026.',
    })
    expect(next.description).toBe(
      'Covers household employment taxes for wages paid in 2026. File by Apr 15, 2027.'
    )
  })

  it('leaves non-year numbers in the description untouched', () => {
    const next = rollForwardReminder({
      title: 'W-2 / W-3 to employee + SSA 2026',
      due_date: '2027-01-31',
      description: 'File via Business Services Online (https://www.ssa.gov/bso/bsowelcome.htm) by Jan 31, 2027. Late penalty $60 per form.',
    })
    expect(next.description).toBe(
      'File via Business Services Online (https://www.ssa.gov/bso/bsowelcome.htm) by Jan 31, 2028. Late penalty $60 per form.'
    )
  })
})
