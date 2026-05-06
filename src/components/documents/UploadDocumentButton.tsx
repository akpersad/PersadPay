'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { SignedDocumentType } from '@/lib/types'

interface Props {
  documentType: SignedDocumentType
  hasExisting: boolean
  uploaderId: string
}

const ACCEPTED = '.pdf,.png,.jpg,.jpeg'
const MAX_BYTES = 10 * 1024 * 1024  // 10 MB — sane ceiling for scans

export function UploadDocumentButton({ documentType, hasExisting, uploaderId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)

  function pick() {
    inputRef.current?.click()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_BYTES) {
      toast.error(`File too large (max ${MAX_BYTES / 1024 / 1024} MB).`)
      return
    }

    setUploading(true)
    const supabase = createClient()

    // Stable path keyed on document_type so re-upload overwrites cleanly.
    const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase()
    const path = `${documentType}.${ext}`

    const { error: uploadErr } = await supabase
      .storage
      .from('signed-documents')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadErr) {
      toast.error(`Upload failed: ${uploadErr.message}`)
      setUploading(false)
      e.target.value = ''
      return
    }

    // Upsert the signed_documents row. Keyed on document_type which is unique
    // so this replaces any prior version's metadata in lockstep with the file.
    const { error: dbErr } = await supabase
      .from('signed_documents')
      .upsert(
        {
          document_type: documentType,
          file_path: path,
          file_name: file.name,
          file_size_bytes: file.size,
          mime_type: file.type || null,
          uploaded_at: new Date().toISOString(),
          uploaded_by: uploaderId,
        },
        { onConflict: 'document_type' },
      )

    if (dbErr) {
      toast.error(`Saved file but record failed: ${dbErr.message}`)
      setUploading(false)
      e.target.value = ''
      return
    }

    toast.success('Signed copy uploaded.')
    setUploading(false)
    e.target.value = ''
    startTransition(() => router.refresh())
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={handleFile}
      />
      <Button
        variant={hasExisting ? 'outline' : 'default'}
        size="sm"
        disabled={uploading}
        onClick={pick}
      >
        <Upload className="h-3.5 w-3.5 mr-1.5" />
        {uploading ? 'Uploading…' : hasExisting ? 'Replace' : 'Upload signed copy'}
      </Button>
    </>
  )
}
