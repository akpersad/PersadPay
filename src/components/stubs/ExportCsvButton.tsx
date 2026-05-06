'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Download } from 'lucide-react'

interface Props {
  availableYears: number[]
  defaultYear: number
}

export function ExportCsvButton({ availableYears, defaultYear }: Props) {
  const [year, setYear] = useState(String(defaultYear))

  function download() {
    window.open(`/api/stubs/export?year=${year}`, '_blank')
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={year} onValueChange={v => v && setYear(v)}>
        <SelectTrigger className="h-8 w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableYears.map(y => (
            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" onClick={download}>
        <Download className="h-3.5 w-3.5 mr-1.5" />
        Export CSV
      </Button>
    </div>
  )
}
