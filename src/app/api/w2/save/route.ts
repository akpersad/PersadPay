import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { computeW2Boxes, w2ErrorResponse } from '@/lib/w2'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { generated_by, tax_year } = body

  const yearInt = parseInt(String(tax_year))
  if (!Number.isInteger(yearInt)) {
    return NextResponse.json({ error: 'tax_year must be an integer' }, { status: 400 })
  }

  // Box values are re-derived here rather than taken from the request body.
  // This is a filed IRS document, so a stale or tampered client payload must
  // not be persisted verbatim; the client's numbers are only a preview.
  const result = await computeW2Boxes(supabase, createAdminClient(), yearInt)
  if (!result.ok) {
    const { error, status } = w2ErrorResponse(result.error)
    return NextResponse.json({ error }, { status })
  }
  const w2Data = result.boxes

  // Regenerating over a W-2 already filed with the SSA must not keep showing
  // "Filed with SSA" on numbers the SSA never received. If any box value
  // changed, flag it as needing a Form W-2c; the flag clears on the next
  // Mark Filed w/ SSA.
  const { data: existing } = await supabase
    .from('w2s')
    .select('*')
    .eq('employee_id', w2Data.employee_id)
    .eq('tax_year', w2Data.tax_year)
    .maybeSingle()

  const BOX_FIELDS = [
    'wages_tips', 'federal_tax_withheld', 'ss_wages', 'ss_tax_withheld',
    'medicare_wages', 'medicare_tax_withheld', 'state_wages', 'state_tax_withheld',
  ] as const
  const amountsChanged = existing
    ? BOX_FIELDS.some(f => Number(existing[f]) !== Number(w2Data[f]))
    : false
  const needs_w2c = existing?.filed_with_ssa
    ? (existing.needs_w2c || amountsChanged)
    : false

  const { data, error } = await supabase
    .from('w2s')
    .upsert(
      { ...w2Data, needs_w2c, generated_by: generated_by ?? user.id, generated_at: new Date().toISOString() },
      { onConflict: 'employee_id,tax_year' }
    )
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
