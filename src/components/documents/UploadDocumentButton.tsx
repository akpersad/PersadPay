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
  uploadLabel?: string
  successLabel?: string
  multi?: boolean
}

const ACCEPTED = '.pdf,.png,.jpg,.jpeg'
const MAX_BYTES = 10 * 1024 * 1024

export function UploadDocumentButton({
  documentType,
  hasExisting,
  uploaderId,
  uploadLabel = 'Upload signed copy',
  successLabel = 'Signed copy uploaded.',
  multi = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)

  function pick() { inputRef.current?.click() }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_BYTES) {
      toast.error(`File too large (max ${MAX_BYTES / 1024 / 1024} MB).`)
      return
    }

    setUploading(true)
    const supabase = createClient()
    const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase()

    if (multi) {
      // Each upload is a distinct file — never overwrites a previous one.
      const uid = crypto.randomUUID()
      const path = `${documentType}/${uid}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('signed-documents')
        .upload(path, file, { contentType: file.type })

      if (uploadErr) {
        toast.error(`Upload failed: ${uploadErr.message}`)
        setUploading(false)
        e.target.value = ''
        return
      }

      const { error: dbErr } = await supabase.from('signed_documents').insert({
        document_type: documentType,
        file_path: path,
        file_name: file.name,
        file_size_bytes: file.size,
        mime_type: file.type || null,
        uploaded_at: new Date().toISOString(),
        uploaded_by: uploaderId,
      })

      if (dbErr) {
        toast.error(`Saved file but record failed: ${dbErr.message}`)
        setUploading(false)
        e.target.value = ''
        return
      }
    } else {
      // Single-copy: delete old record + file, then insert fresh.
      const path = `${documentType}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('signed-documents')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (uploadErr) {
        toast.error(`Upload failed: ${uploadErr.message}`)
        setUploading(false)
        e.target.value = ''
        return
      }

      await supabase.from('signed_documents').delete().eq('document_type', documentType)

      const { error: dbErr } = await supabase.from('signed_documents').insert({
        document_type: documentType,
        file_path: path,
        file_name: file.name,
        file_size_bytes: file.size,
        mime_type: file.type || null,
        uploaded_at: new Date().toISOString(),
        uploaded_by: uploaderId,
      })

      if (dbErr) {
        toast.error(`Saved file but record failed: ${dbErr.message}`)
        setUploading(false)
        e.target.value = ''
        return
      }
    }

    toast.success(successLabel)
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
        variant={hasExisting && !multi ? 'outline' : 'default'}
        size="sm"
        disabled={uploading}
        onClick={pick}
      >
        <Upload className="h-3.5 w-3.5 mr-1.5" />
        {uploading ? 'Uploading…' : hasExisting && !multi ? 'Replace' : uploadLabel}
      </Button>
    </>
  )
}
