import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { BRAND_COLOR, BRAND_COLOR_LIGHT } from './constants'
import { formatCurrency } from '@/lib/dates'
import type { W2, Settings } from '@/lib/types'

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 8, padding: 36, color: '#1a1a1a' },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: BRAND_COLOR, marginBottom: 4 },
  subtitle: { fontSize: 9, color: '#555', marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  box: { border: '1px solid #ccc', padding: '5 8', minWidth: 120, flex: 1 },
  boxLabel: { fontSize: 7, color: '#888', marginBottom: 3, textTransform: 'uppercase' },
  boxValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  header: { backgroundColor: BRAND_COLOR, padding: '6 8', marginBottom: 12 },
  headerText: { color: '#fff', fontSize: 8 },
  headerTitle: { color: '#fff', fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: BRAND_COLOR, marginBottom: 5, letterSpacing: 0.5 },
  infoRow: { flexDirection: 'row', gap: 16, marginBottom: 12, backgroundColor: BRAND_COLOR_LIGHT, padding: 8 },
  infoBlock: { flex: 1 },
  infoLabel: { fontSize: 7, color: '#666', textTransform: 'uppercase', marginBottom: 2 },
  infoValue: { fontSize: 9 },
  disclaimer: { fontSize: 7, color: '#888', marginTop: 20, borderTop: '0.5px solid #ccc', paddingTop: 8 },
})

interface Props {
  w2: W2
  settings: Settings
}

export function W2Document({ w2, settings }: Props) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>W-2 Wage and Tax Statement</Text>
          <Text style={styles.headerText}>Tax Year {w2.tax_year}</Text>
        </View>

        {/* Employer / Employee info */}
        <View style={styles.infoRow}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Employer</Text>
            <Text style={styles.infoValue}>{settings.employer_name ?? '—'}</Text>
            <Text style={[styles.infoValue, { marginTop: 2 }]}>EIN: {settings.employer_ein ?? '—'}</Text>
            <Text style={[styles.infoValue, { marginTop: 2 }]}>{settings.employer_address ?? ''}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Employee</Text>
            <Text style={styles.infoValue}>{settings.employee_name ?? '—'}</Text>
          </View>
        </View>

        {/* Wage & Tax Boxes */}
        <Text style={styles.sectionTitle}>Federal</Text>
        <View style={styles.grid}>
          <BoxItem num={1} label="Wages, tips, other comp." value={w2.wages_tips} />
          <BoxItem num={2} label="Federal income tax withheld" value={w2.federal_tax_withheld} />
        </View>
        <View style={styles.grid}>
          <BoxItem num={3} label="Social security wages" value={w2.ss_wages} />
          <BoxItem num={4} label="Social security tax withheld" value={w2.ss_tax_withheld} />
        </View>
        <View style={styles.grid}>
          <BoxItem num={5} label="Medicare wages and tips" value={w2.medicare_wages} />
          <BoxItem num={6} label="Medicare tax withheld" value={w2.medicare_tax_withheld} />
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 10 }]}>New York State</Text>
        <View style={styles.grid}>
          <BoxItem num={15} label="State (NY)" value={null} text="NY" />
          <BoxItem num={16} label="State wages, tips, etc." value={w2.state_wages} />
          <BoxItem num={17} label="State income tax" value={w2.state_tax_withheld} />
        </View>

        <Text style={styles.disclaimer}>
          This is a computer-generated earnings statement for household payroll purposes. Verify all figures
          before filing. Consult a tax professional for guidance on Schedule H and related forms.
        </Text>
      </Page>
    </Document>
  )
}

function BoxItem({ num, label, value, text }: { num: number; label: string; value: number | null; text?: string }) {
  return (
    <View style={styles.box}>
      <Text style={styles.boxLabel}>Box {num} — {label}</Text>
      <Text style={styles.boxValue}>
        {text ?? (value !== null ? formatCurrency(value) : '—')}
      </Text>
    </View>
  )
}
