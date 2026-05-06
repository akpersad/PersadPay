import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { BRAND_COLOR, BRAND_COLOR_LIGHT } from './constants'
import { formatCurrency, formatDate } from '@/lib/dates'
import type { Settings, Paystub, W2 } from '@/lib/types'

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, padding: 36, color: '#1a1a1a' },
  cover: { paddingTop: 80, paddingBottom: 40 },
  coverTitle: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: BRAND_COLOR, marginBottom: 8, textAlign: 'center' },
  coverYear: { fontSize: 32, fontFamily: 'Helvetica-Bold', color: BRAND_COLOR, marginBottom: 24, textAlign: 'center' },
  coverInfo: { fontSize: 11, color: '#444', textAlign: 'center', marginBottom: 4 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BRAND_COLOR, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryRow: { flexDirection: 'row', backgroundColor: BRAND_COLOR_LIGHT, padding: 10, marginBottom: 12, gap: 16 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 7, color: '#666', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 },
  summaryValue: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: BRAND_COLOR },
  tableHeader: { flexDirection: 'row', backgroundColor: BRAND_COLOR, padding: '5 8', color: '#fff' },
  tableRow: { flexDirection: 'row', padding: '4 8', borderBottom: '0.5px solid #e0e0e0' },
  tableRowAlt: { flexDirection: 'row', padding: '4 8', borderBottom: '0.5px solid #e0e0e0', backgroundColor: '#fafafa' },
  tableTotalRow: { flexDirection: 'row', padding: '5 8', borderTop: `2px solid ${BRAND_COLOR}`, fontFamily: 'Helvetica-Bold' },
  col_num: { flex: 0.6 },
  col_date: { flex: 1.2 },
  col_hrs: { flex: 0.6, textAlign: 'right' },
  col_gross: { flex: 1, textAlign: 'right' },
  col_taxes: { flex: 1, textAlign: 'right' },
  col_net: { flex: 1, textAlign: 'right' },
  colHdr: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  taxBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  taxItem: { border: '1px solid #ccc', padding: '6 8', minWidth: 120, flex: 1 },
  taxLabel: { fontSize: 7, color: '#888', textTransform: 'uppercase', marginBottom: 2 },
  taxValue: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  footnote: { fontSize: 7, color: '#888', marginTop: 16, paddingTop: 8, borderTop: '0.5px solid #ccc' },
})

interface Props {
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

// One-PDF year summary for accountant handoff. Not a literal merge of every
// per-stub PDF — that would require pdf-lib. Instead a narrative summary
// with a per-stub table, year totals, Schedule H worksheet, and W-2/W-3
// reference. Detail PDFs can be downloaded separately from /stubs and /w2.
export function YearEndPacketDocument({ year, settings, stubs, w2, scheduleH }: Props) {
  const totalGross = stubs.reduce((sum, s) => sum + Number(s.gross_pay), 0)
  const totalNet = stubs.reduce((sum, s) => sum + Number(s.net_pay), 0)
  const totalEmployeeTaxes = stubs.reduce((sum, s) =>
    sum +
    Number(s.federal_withholding) + Number(s.fica_social_security) + Number(s.fica_medicare) +
    Number(s.state_withholding) + Number(s.sdi) + Number(s.pfl), 0)
  const totalEmployerTaxes = stubs.reduce((sum, s) =>
    sum + Number(s.employer_fica_ss) + Number(s.employer_fica_medicare) + Number(s.futa) + Number(s.suta), 0)

  return (
    <Document>
      {/* Cover */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.cover}>
          <Text style={styles.coverTitle}>Year-end Payroll Packet</Text>
          <Text style={styles.coverYear}>{year}</Text>
          <Text style={styles.coverInfo}>{settings.employer_name ?? 'Employer'}</Text>
          <Text style={styles.coverInfo}>EIN: {settings.employer_ein ?? '—'}</Text>
          <Text style={styles.coverInfo}>{settings.employer_address ?? ''}</Text>
          {settings.employer_phone && <Text style={styles.coverInfo}>Phone: {settings.employer_phone}</Text>}
          <Text style={[styles.coverInfo, { marginTop: 16 }]}>Employee: {settings.employee_name ?? '—'}</Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Stubs</Text>
            <Text style={styles.summaryValue}>{stubs.length}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Gross Wages</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totalGross)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Net Pay</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totalNet)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Federal Schedule H</Text>
        <View style={styles.taxBox}>
          <View style={styles.taxItem}>
            <Text style={styles.taxLabel}>Line 1a SS wages</Text>
            <Text style={styles.taxValue}>{formatCurrency(scheduleH.ss_wages)}</Text>
          </View>
          <View style={styles.taxItem}>
            <Text style={styles.taxLabel}>Line 1b SS tax (12.4%)</Text>
            <Text style={styles.taxValue}>{formatCurrency(scheduleH.ss_tax)}</Text>
          </View>
          <View style={styles.taxItem}>
            <Text style={styles.taxLabel}>Line 2a Medicare wages</Text>
            <Text style={styles.taxValue}>{formatCurrency(scheduleH.medicare_wages)}</Text>
          </View>
          <View style={styles.taxItem}>
            <Text style={styles.taxLabel}>Line 2b Medicare tax (2.9%)</Text>
            <Text style={styles.taxValue}>{formatCurrency(scheduleH.medicare_tax)}</Text>
          </View>
          <View style={styles.taxItem}>
            <Text style={styles.taxLabel}>Line 5 federal withheld</Text>
            <Text style={styles.taxValue}>{formatCurrency(scheduleH.fed_income_tax_withheld)}</Text>
          </View>
          <View style={styles.taxItem}>
            <Text style={styles.taxLabel}>Line 7 FUTA wages</Text>
            <Text style={styles.taxValue}>{formatCurrency(scheduleH.futa_wages)}</Text>
          </View>
          <View style={styles.taxItem}>
            <Text style={styles.taxLabel}>Line 8 FUTA tax (0.6%)</Text>
            <Text style={styles.taxValue}>{formatCurrency(scheduleH.futa_tax)}</Text>
          </View>
          <View style={styles.taxItem}>
            <Text style={styles.taxLabel}>Line 9 Total household tax</Text>
            <Text style={styles.taxValue}>{formatCurrency(scheduleH.total_household_employment_taxes)}</Text>
          </View>
        </View>

        {w2 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>W-2 Box Totals</Text>
            <View style={styles.taxBox}>
              <View style={styles.taxItem}>
                <Text style={styles.taxLabel}>Box 1 wages</Text>
                <Text style={styles.taxValue}>{formatCurrency(w2.wages_tips)}</Text>
              </View>
              <View style={styles.taxItem}>
                <Text style={styles.taxLabel}>Box 2 fed withheld</Text>
                <Text style={styles.taxValue}>{formatCurrency(w2.federal_tax_withheld)}</Text>
              </View>
              <View style={styles.taxItem}>
                <Text style={styles.taxLabel}>Box 16 NY wages</Text>
                <Text style={styles.taxValue}>{formatCurrency(w2.state_wages)}</Text>
              </View>
              <View style={styles.taxItem}>
                <Text style={styles.taxLabel}>Box 17 NY withheld</Text>
                <Text style={styles.taxValue}>{formatCurrency(w2.state_tax_withheld)}</Text>
              </View>
            </View>
          </>
        )}

        <Text style={styles.footnote}>
          Per-stub PDFs available individually at /stubs/[id] in the app.
          W-2 + W-3 PDFs available at /w2. Schedule H worksheet detail at
          /filings/schedule-h/{year}.
        </Text>
      </Page>

      {/* Stub table — one or more pages depending on stub count */}
      <Page size="LETTER" style={styles.page} wrap>
        <Text style={styles.sectionTitle}>All Paystubs · {year}</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.col_num, styles.colHdr]}>#</Text>
          <Text style={[styles.col_date, styles.colHdr]}>Pay Date</Text>
          <Text style={[styles.col_hrs, styles.colHdr]}>Hrs</Text>
          <Text style={[styles.col_gross, styles.colHdr]}>Gross</Text>
          <Text style={[styles.col_taxes, styles.colHdr]}>Deductions</Text>
          <Text style={[styles.col_net, styles.colHdr]}>Net</Text>
        </View>
        {stubs.map((s, idx) => {
          const empTax =
            Number(s.federal_withholding) + Number(s.fica_social_security) + Number(s.fica_medicare) +
            Number(s.state_withholding) + Number(s.sdi) + Number(s.pfl)
          return (
            <View key={s.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={styles.col_num}>{s.stub_number}</Text>
              <Text style={styles.col_date}>{formatDate(s.pay_date)}</Text>
              <Text style={styles.col_hrs}>{Number(s.hours_worked)}</Text>
              <Text style={styles.col_gross}>{formatCurrency(Number(s.gross_pay))}</Text>
              <Text style={styles.col_taxes}>{formatCurrency(empTax)}</Text>
              <Text style={styles.col_net}>{formatCurrency(Number(s.net_pay))}</Text>
            </View>
          )
        })}
        <View style={styles.tableTotalRow}>
          <Text style={styles.col_num}></Text>
          <Text style={styles.col_date}>Year totals</Text>
          <Text style={styles.col_hrs}></Text>
          <Text style={styles.col_gross}>{formatCurrency(totalGross)}</Text>
          <Text style={styles.col_taxes}>{formatCurrency(totalEmployeeTaxes)}</Text>
          <Text style={styles.col_net}>{formatCurrency(totalNet)}</Text>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Employer Tax Liability</Text>
        <Text style={styles.footnote}>
          Employer-side taxes (not withheld from employee): {formatCurrency(totalEmployerTaxes)}.
          Composed of employer FICA SS + Medicare matching, FUTA, and NY SUTA.
          Combined with employee-side withholdings, this is the total amount
          that flowed through the HYSA to the IRS / NY State across {year}.
        </Text>
      </Page>
    </Document>
  )
}
