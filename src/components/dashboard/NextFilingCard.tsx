import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, FileText } from 'lucide-react'
import { formatDate, formatCurrency, daysUntil, shiftedDeadline } from '@/lib/dates'

interface Props {
  year: number
  quarter: number
  dueDate: string
  stubCount: number
  grossPay: number
  filed: boolean
}

// Surfaces the next non-filed NYS-45 quarter so the admin sees, at a glance,
// whether they're ready to file and how soon. Hidden when nothing's pending.
export function NextFilingCard({ year, quarter, dueDate, stubCount, grossPay, filed }: Props) {
  if (filed) return null

  // Weekend/holiday deadlines shift to the next business day, and a filing
  // is only overdue the day AFTER the (shifted) deadline.
  const days = daysUntil(shiftedDeadline(dueDate).effective)
  const overdue = days < 0
  const ready = stubCount > 0

  return (
    <Link href={`/filings/nys-45/${year}/${quarter}`} className="block">
      <Card className="hover:bg-muted/50 transition-colors">
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Q{quarter} {year} NYS-45</p>
              {overdue
                ? <Badge variant="destructive">Overdue</Badge>
                : days === 0
                  ? <Badge variant="destructive">Due today</Badge>
                  : days <= 20
                    ? <Badge variant="secondary">{days}d</Badge>
                    : null
              }
              {ready && !overdue && days > 20 && (
                <Badge variant="outline">Data ready</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Due {formatDate(dueDate)} · {stubCount} stubs · {formatCurrency(grossPay)}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </CardContent>
      </Card>
    </Link>
  )
}
