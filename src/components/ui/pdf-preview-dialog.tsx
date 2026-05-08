'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Eye, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  url: string
  title: string
  buttonLabel?: string
  buttonVariant?: 'default' | 'outline' | 'secondary' | 'ghost'
  className?: string
  size?: 'default' | 'sm'
}

export function PdfPreviewDialog({
  url,
  title,
  buttonLabel = 'Preview',
  buttonVariant = 'outline',
  className,
  size = 'default',
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant={buttonVariant}
        size={size}
        className={cn(className)}
        onClick={() => setOpen(true)}
      >
        <Eye className="h-4 w-4 mr-2" />
        {buttonLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-3 shrink-0 border-b">
            <DialogTitle className="text-sm font-medium">{title}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0">
            <iframe
              src={url}
              className="w-full h-full border-0"
              title={title}
            />
          </div>

          <div className="px-4 py-2.5 border-t shrink-0">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit"
            >
              <ExternalLink className="h-3 w-3" />
              Open in new tab
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
