import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import React from 'react'
import { PaystubDocument } from './PaystubDocument'
import { W2Document } from './W2Document'
import type { PaystubWithYTD, Settings, W2, PaystubLineItem } from '@/lib/types'

export async function generateStubPDF(
  stub: PaystubWithYTD,
  settings: Settings,
  variant: 'admin' | 'employee',
  lineItems: PaystubLineItem[] = [],
  ytdByLineType: Record<string, number> = {},
): Promise<Buffer> {
  const doc = React.createElement(PaystubDocument, { stub, settings, variant, lineItems, ytdByLineType }) as React.ReactElement<DocumentProps>
  return Buffer.from(await renderToBuffer(doc))
}

export async function generateW2PDF(w2: W2, settings: Settings): Promise<Buffer> {
  const doc = React.createElement(W2Document, { w2, settings }) as React.ReactElement<DocumentProps>
  return Buffer.from(await renderToBuffer(doc))
}
