import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import React from 'react'
import { PaystubDocument } from './PaystubDocument'
import { W2Document } from './W2Document'
import { W3Document } from './W3Document'
import { YearEndPacketDocument } from './YearEndPacketDocument'
import type { PaystubWithYTD, Settings, W2, PaystubLineItem, Paystub, W2Copy } from '@/lib/types'

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

export async function generateW2PDF(
  w2: W2,
  settings: Settings,
  copy: W2Copy = 'B',
  sdiWithheld = 0,
  pflWithheld = 0,
): Promise<Buffer> {
  const doc = React.createElement(W2Document, { w2, settings, copy, sdiWithheld, pflWithheld }) as React.ReactElement<DocumentProps>
  return Buffer.from(await renderToBuffer(doc))
}

export async function generateW3PDF(w2: W2, settings: Settings): Promise<Buffer> {
  const doc = React.createElement(W3Document, { w2, settings }) as React.ReactElement<DocumentProps>
  return Buffer.from(await renderToBuffer(doc))
}

export interface YearEndPacketArgs {
  year: number
  settings: Settings
  stubs: Paystub[]
  w2: W2 | null
  scheduleH: {
    ss_wages: number
    ss_tax: number
    medicare_wages: number
    medicare_tax: number
    fed_income_tax_withheld: number
    futa_wages: number
    futa_tax: number
    total_household_employment_taxes: number
  }
}

export async function generateYearEndPacketPDF(args: YearEndPacketArgs): Promise<Buffer> {
  const doc = React.createElement(YearEndPacketDocument, args) as React.ReactElement<DocumentProps>
  return Buffer.from(await renderToBuffer(doc))
}
