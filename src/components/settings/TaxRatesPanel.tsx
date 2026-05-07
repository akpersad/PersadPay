import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { TaxRates } from '@/lib/tax'

interface Props {
  rates: TaxRates | null
  requestedYear: number
}

export function TaxRatesPanel({ rates, requestedYear }: Props) {
  if (!rates) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">Tax Rates</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <p className="text-sm text-yellow-700">
            No tax rates seeded for {requestedYear}. Apply the latest migration or seed the
            tax_rates table before generating stubs.
          </p>
        </CardContent>
      </Card>
    )
  }

  const fallback = rates.effective_year !== requestedYear

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Tax Rates — {rates.effective_year}</span>
          {fallback && (
            <span className="text-[10px] uppercase tracking-wide font-normal text-yellow-700">
              Fallback
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 space-y-1.5">
        {fallback && (
          <p className="text-xs text-yellow-700 mb-2">
            No row seeded for {requestedYear}; using {rates.effective_year} until next year&apos;s
            rates are added.
          </p>
        )}
        <Row label="FICA — Social Security" value={`${pct(rates.fica_ss_rate)} (employee + employer)`} />
        <Row label="FICA — Medicare" value={`${pct(rates.fica_medicare_rate)} (employee + employer)`} />
        <Row label="SS wage base" value={dollars(rates.ss_wage_base)} />
        <Row label="FUTA rate" value={pct(rates.futa_rate)} />
        <Row label="FUTA wage base" value={dollars(rates.futa_wage_base)} />
        <Row label="NY SUTA wage base" value={dollars(rates.suta_wage_base)} />
        <Row label="NY SDI rate" value={`${pct(rates.sdi_rate)} (cap ${money(rates.sdi_weekly_cap)}/wk)`} />
        <Row label="NY PFL rate" value={`${pct(rates.pfl_rate)} (annual cap ${money(rates.pfl_annual_cap)})`} />
        <Row label="IRS standard mileage" value={`${money(rates.irs_mileage_rate)} / mi`} />
        <p className="text-[11px] text-muted-foreground pt-2 leading-relaxed">
          Read-only. To change rates, add or update a row in the tax_rates table via migration —
          never edit values inline. Re-verify each January from primary sources.
        </p>
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function pct(n: number): string {
  return `${(Number(n) * 100).toFixed(3).replace(/\.?0+$/, '')}%`
}

function dollars(n: number): string {
  return `$${Number(n).toLocaleString('en-US')}`
}

function money(n: number): string {
  return `$${Number(n).toFixed(2)}`
}
