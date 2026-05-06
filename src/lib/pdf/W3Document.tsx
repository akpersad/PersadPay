import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { BRAND_COLOR, BRAND_COLOR_LIGHT } from './constants'
import { formatCurrency } from '@/lib/dates'
import type { W2, Settings } from '@/lib/types'

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 8, padding: 36, color: '#1a1a1a' },
  header: { backgroundColor: BRAND_COLOR, padding: '6 8', marginBottom: 12 },
  headerTitle: { color: '#fff', fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  headerText: { color: '#fff', fontSize: 8 },
  infoRow: { flexDirection: 'row', gap: 16, marginBottom: 12, backgroundColor: BRAND_COLOR_LIGHT, padding: 8 },
  infoBlock: { flex: 1 },
  infoLabel: { fontSize: 7, color: '#666', textTransform: 'uppercase', marginBottom: 2 },
  infoValue: { fontSize: 9 },
  sectionTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: BRAND_COLOR, marginBottom: 5, letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  box: { border: '1px solid #ccc', padding: '5 8', minWidth: 110, flex: 1 },
  boxLabel: { fontSize: 7, color: '#888', marginBottom: 3, textTransform: 'uppercase' },
  boxValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  callout: { backgroundColor: '#fef3c7', border: '1px solid #fde68a', padding: 8, marginBottom: 12 },
  calloutText: { fontSize: 8, color: '#7c2d12' },
  disclaimer: { fontSize: 7, color: '#888', marginTop: 20, borderTop: '0.5px solid #ccc', paddingTop: 8 },
})

interface Props {
  w2: W2
  settings: Settings
}

// W-3 Transmittal of Wage and Tax Statements. Filed with SSA alongside W-2
// Copy A. For this employer with one household employee, all line totals
// equal the corresponding W-2 line. Box b is set to "Hshld. emp." per
// IRS Pub 926 + W-3 instructions.
export function W3Document({ w2, settings }: Props) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>W-3 Transmittal of Wage and Tax Statements</Text>
          <Text style={styles.headerText}>Tax Year {w2.tax_year} · Hshld. emp.</Text>
        </View>

        <View style={styles.callout}>
          <Text style={styles.calloutText}>
            File with SSA alongside W-2 Copy A. Box b checked &quot;Hshld. emp.&quot; per IRS Pub 926.
            For paper filing, mail to SSA per the W-3 instructions. For electronic filing, BSO
            (Business Services Online) generates a W-3 automatically from your W-2 upload — paper
            W-3 not required when filing through BSO.
          </Text>
        </View>

        {/* Employer info */}
        <Text style={styles.sectionTitle}>Employer</Text>
        <View style={styles.infoRow}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Box a · EIN</Text>
            <Text style={styles.infoValue}>{settings.employer_ein ?? '—'}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Box b · Kind of payer</Text>
            <Text style={styles.infoValue}>Hshld. emp.</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Box c · No. of W-2s</Text>
            <Text style={styles.infoValue}>1</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Box e · Employer name</Text>
            <Text style={styles.infoValue}>{settings.employer_name ?? '—'}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Box f · Address</Text>
            <Text style={styles.infoValue}>{settings.employer_address ?? '—'}</Text>
          </View>
        </View>

        {settings.employer_phone && (
          <View style={styles.infoRow}>
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Contact phone</Text>
              <Text style={styles.infoValue}>{settings.employer_phone}</Text>
            </View>
          </View>
        )}

        {/* Box totals — same as the single W-2 since there's only one employee */}
        <Text style={styles.sectionTitle}>Box totals</Text>
        <View style={styles.grid}>
          <View style={styles.box}>
            <Text style={styles.boxLabel}>Box 1 · Wages, tips, other</Text>
            <Text style={styles.boxValue}>{formatCurrency(w2.wages_tips)}</Text>
          </View>
          <View style={styles.box}>
            <Text style={styles.boxLabel}>Box 2 · Federal income tax withheld</Text>
            <Text style={styles.boxValue}>{formatCurrency(w2.federal_tax_withheld)}</Text>
          </View>
          <View style={styles.box}>
            <Text style={styles.boxLabel}>Box 3 · Social security wages</Text>
            <Text style={styles.boxValue}>{formatCurrency(w2.ss_wages)}</Text>
          </View>
          <View style={styles.box}>
            <Text style={styles.boxLabel}>Box 4 · Social security tax withheld</Text>
            <Text style={styles.boxValue}>{formatCurrency(w2.ss_tax_withheld)}</Text>
          </View>
          <View style={styles.box}>
            <Text style={styles.boxLabel}>Box 5 · Medicare wages</Text>
            <Text style={styles.boxValue}>{formatCurrency(w2.medicare_wages)}</Text>
          </View>
          <View style={styles.box}>
            <Text style={styles.boxLabel}>Box 6 · Medicare tax withheld</Text>
            <Text style={styles.boxValue}>{formatCurrency(w2.medicare_tax_withheld)}</Text>
          </View>
          <View style={styles.box}>
            <Text style={styles.boxLabel}>Box 16 · State wages (NY)</Text>
            <Text style={styles.boxValue}>{formatCurrency(w2.state_wages)}</Text>
          </View>
          <View style={styles.box}>
            <Text style={styles.boxLabel}>Box 17 · State income tax (NY)</Text>
            <Text style={styles.boxValue}>{formatCurrency(w2.state_tax_withheld)}</Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          Generated by PersadPay. This is a working facsimile — for official paper filing, transcribe
          values onto an SSA-supplied red-ink Copy A or use BSO (https://www.ssa.gov/bso/bsowelcome.htm)
          for electronic submission, which generates the W-3 from your W-2 upload automatically.
        </Text>
      </Page>
    </Document>
  )
}
