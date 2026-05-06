'use client'

import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  current: number
  available: number[]
}

export function YearPicker({ current, available }: Props) {
  const router = useRouter()
  return (
    <Select
      value={String(current)}
      onValueChange={v => v && router.push(`/documents/sick-leave-summary?year=${v}`)}
    >
      <SelectTrigger className="h-8 w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {available.map(y => (
          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
