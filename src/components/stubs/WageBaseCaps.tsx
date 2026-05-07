import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/dates'
import type { TaxRates } from '@/lib/tax'

interface Props {
  ytdGrossBefore: number
  taxRates: TaxRates
}

interface CapRow {
  label: string
  ytd: number
  cap: number
  hint?: string
}

// Surfaces year-to-date wage-base progress so the admin knows when caps will
// stop affecting employer taxes. Hidden when YTD is $0 — nothing useful yet.
// Admin-only context (this component is only rendered inside NewStubForm).
export function WageBaseCaps({ ytdGrossBefore, taxRates }: Props) {
  if (ytdGrossBefore <= 0) return null

  const rows: CapRow[] = [
    {
      label: 'FUTA',
      ytd: ytdGrossBefore,
      cap: Number(taxRates.futa_wage_base),
      hint: 'Once gross hits this cap, no further FUTA owed for the year.',
    },
    {
      label: 'NY SUTA',
      ytd: ytdGrossBefore,
      cap: Number(taxRates.suta_wage_base),
      hint: 'NY UI tax stops once cap is reached.',
    },
    {
      label: 'Social Security',
      ytd: ytdGrossBefore,
      cap: Number(taxRates.ss_wage_base),
    },
  ]

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm">Wage base progress (YTD before this stub)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 pb-4">
        {rows.map(row => {
          const pct = row.cap > 0 ? Math.min(100, Math.round((row.ytd / row.cap) * 100)) : 0
          const reached = row.ytd >= row.cap
          const near = pct >= 80 && !reached
          return (
            <div key={row.label} className="space-y-1">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium">{row.label}</span>
                <span className={reached ? 'text-green-700' : near ? 'text-yellow-700' : 'text-muted-foreground'}>
                  {formatCurrency(row.ytd)} / {formatCurrency(row.cap)}
                  {reached && ' · cap reached'}
                  {near && ' · approaching cap'}
                </span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full ${reached ? 'bg-green-600' : near ? 'bg-yellow-500' : 'bg-primary/40'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {row.hint && reached && (
                <p className="text-[11px] text-muted-foreground">{row.hint}</p>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
