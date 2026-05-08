'use client'

import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Props {
  years: number[]
  selected: string
}

export function StubYearFilter({ years, selected }: Props) {
  const router = useRouter()

  return (
    <Select value={selected} onValueChange={y => router.push(`/stubs?year=${y}`)}>
      <SelectTrigger className="w-28 h-8 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All years</SelectItem>
        {years.map(y => (
          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
