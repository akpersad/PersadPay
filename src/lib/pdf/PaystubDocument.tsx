import React from 'react'
import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'
import { BRAND_COLOR, BRAND_COLOR_LIGHT } from './constants'
import { formatDate, formatDateRange, formatCurrency } from '@/lib/dates'
import type { PaystubWithYTD, Settings, PaystubLineItem } from '@/lib/types'

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, padding: 36, color: '#1a1a1a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 10, borderBottom: `2px solid ${BRAND_COLOR}` },
  headerLeft: { flex: 1 },
  headerRight: { alignItems: 'flex-end' },
  companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: BRAND_COLOR, marginBottom: 3 },
  label: { fontSize: 7, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 },
  stubTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: BRAND_COLOR },
  stubNumber: { fontSize: 9, color: '#666' },
  infoRow: { flexDirection: 'row', gap: 20, marginBottom: 14, padding: 8, backgroundColor: BRAND_COLOR_LIGHT },
  infoItem: { flex: 1 },
  infoLabel: { fontSize: 7, color: '#666', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 },
  infoValue: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  table: { marginBottom: 14 },
  tableHeader: { flexDirection: 'row', backgroundColor: BRAND_COLOR, padding: '5 8', color: '#fff' },
  tableRow: { flexDirection: 'row', padding: '4 8', borderBottom: '0.5px solid #e0e0e0' },
  tableRowAlt: { flexDirection: 'row', padding: '4 8', borderBottom: '0.5px solid #e0e0e0', backgroundColor: '#fafafa' },
  col1: { flex: 3 },
  col2: { flex: 1, textAlign: 'right' },
  col3: { flex: 1, textAlign: 'right' },
  colHdr: { fontFamily: 'Helvetica-Bold', fontSize: 8 },
  sectionLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: BRAND_COLOR, marginTop: 10, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  footer: { flexDirection: 'row', borderTop: `2px solid ${BRAND_COLOR}`, paddingTop: 8, marginTop: 4, gap: 10 },
  footerItem: { flex: 1, alignItems: 'center' },
  footerLabel: { fontSize: 7, color: '#666', textTransform: 'uppercase', marginBottom: 2 },
  footerValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BRAND_COLOR },
})

interface Props {
  stub: PaystubWithYTD
  settings: Settings
  variant: 'admin' | 'employee'
  lineItems?: PaystubLineItem[]
  ytdByLineType?: Record<string, number>
}

export function PaystubDocument({ stub, settings, variant, lineItems = [], ytdByLineType = {} }: Props) {
  const isAdmin = variant === 'admin'
  const pflWaived = settings.pfl_waived

  const ytdTaxes = stub.ytd_total_employee_taxes

  const taxableLineItems = lineItems.filter(i =>
    !i.informational_only && (i.taxable_fed || i.taxable_fica || i.taxable_ny || i.w2_box1)
  )
  const reimbursementLineItems = lineItems.filter(i =>
    !i.informational_only && !i.taxable_fed && !i.taxable_fica && !i.taxable_ny && !i.w2_box1
  )
  const informationalLineItems = lineItems.filter(i => i.informational_only)
  const reimbursementsTotal = reimbursementLineItems.reduce((sum, i) => sum + Number(i.amount), 0)
  const givenSeparatelyItems = lineItems.filter(i => !i.informational_only && i.given_separately)
  const givenSeparatelyTotal = givenSeparatelyItems.reduce((sum, i) => sum + Number(i.amount), 0)
  const cashToZelle = Math.round((Number(stub.net_pay) - givenSeparatelyTotal) * 100) / 100

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.companyName}>{settings.employer_name ?? 'Employer'}</Text>
            <Text style={{ fontSize: 8, color: '#555', marginBottom: 1 }}>EIN: {settings.employer_ein ?? '—'}</Text>
            <Text style={{ fontSize: 8, color: '#555', marginBottom: 1 }}>{settings.employer_address ?? ''}</Text>
            {settings.employer_phone && (
              <Text style={{ fontSize: 8, color: '#555' }}>Phone: {settings.employer_phone}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.stubTitle}>Earnings Statement</Text>
            <Text style={styles.stubNumber}>Stub #{stub.stub_number}</Text>
          </View>
        </View>

        {/* Employee info row */}
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Employee</Text>
            <Text style={styles.infoValue}>{settings.employee_name ?? '—'}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Pay Schedule</Text>
            <Text style={styles.infoValue}>Weekly</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Pay Period</Text>
            <Text style={styles.infoValue}>{formatDateRange(stub.pay_period_start, stub.pay_period_end)}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Pay Date</Text>
            <Text style={styles.infoValue}>{formatDate(stub.pay_date)}</Text>
          </View>
        </View>

        {/* Earnings table — NY § 195(3) requires regular rate, OT rate, regular hours, OT hours
            for non-exempt employees, even when OT hours = 0. */}
        <Text style={styles.sectionLabel}>Earnings</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.col1, styles.colHdr]}>Description</Text>
            <Text style={[styles.col2, styles.colHdr]}>Rate</Text>
            <Text style={[styles.col2, styles.colHdr]}>Hours</Text>
            <Text style={[styles.col2, styles.colHdr]}>Current</Text>
            <Text style={[styles.col3, styles.colHdr]}>YTD</Text>
          </View>
          {stub.hours_worked === 0 && taxableLineItems.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={styles.col1}>No Hours — Week Off</Text>
              <Text style={styles.col2}>—</Text>
              <Text style={styles.col2}>—</Text>
              <Text style={styles.col2}>{formatCurrency(0)}</Text>
              <Text style={styles.col3}>{formatCurrency(stub.ytd_gross)}</Text>
            </View>
          ) : (
            <>
              {stub.hours_worked > 0 && (
                <View style={styles.tableRow}>
                  <Text style={styles.col1}>Regular Earnings</Text>
                  <Text style={styles.col2}>{formatCurrency(Number(stub.hourly_rate))}</Text>
                  <Text style={styles.col2}>{stub.hours_worked}</Text>
                  <Text style={styles.col2}>{formatCurrency(Number(stub.hours_worked) * Number(stub.hourly_rate))}</Text>
                  <Text style={styles.col3}>{formatCurrency(stub.ytd_regular_wages)}</Text>
                </View>
              )}
              {/* OT row intentionally omitted until Phase 3 adds overtime_hours.
                  NY § 195(3) lists OT rate/hours for non-exempt employees; once
                  the field exists, render the row conditionally on
                  overtime_hours > 0. */}
              {taxableLineItems.map((item, idx) => (
                <View key={item.id} style={(idx + (stub.hours_worked > 0 ? 2 : 0)) % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <Text style={styles.col1}>{item.label}</Text>
                  <Text style={styles.col2}>—</Text>
                  <Text style={styles.col2}>—</Text>
                  <Text style={styles.col2}>{formatCurrency(Number(item.amount))}</Text>
                  <Text style={styles.col3}>{formatCurrency(ytdByLineType[item.line_type] ?? Number(item.amount))}</Text>
                </View>
              ))}
              {taxableLineItems.length > 0 && (
                <View style={styles.tableRowAlt}>
                  <Text style={[styles.col1, { fontFamily: 'Helvetica-Bold' }]}>Total taxable wages</Text>
                  <Text style={styles.col2}>—</Text>
                  <Text style={styles.col2}>—</Text>
                  <Text style={[styles.col2, { fontFamily: 'Helvetica-Bold' }]}>{formatCurrency(Number(stub.gross_pay))}</Text>
                  <Text style={styles.col3}>{formatCurrency(stub.ytd_gross)}</Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Deductions table */}
        <Text style={styles.sectionLabel}>Employee Deductions</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.col1, styles.colHdr]}>Description</Text>
            <Text style={[styles.col2, styles.colHdr]}>Current</Text>
            <Text style={[styles.col3, styles.colHdr]}>YTD</Text>
          </View>
          <TaxRow label="Federal Income Tax Withheld" current={stub.federal_withholding} ytd={stub.ytd_federal_withholding} alt />
          <TaxRow label="FICA — Social Security" current={stub.fica_social_security} ytd={stub.ytd_fica_social_security} />
          <TaxRow label="FICA — Medicare" current={stub.fica_medicare} ytd={stub.ytd_fica_medicare} alt />
          <TaxRow label="NY State Income Tax Withheld" current={stub.state_withholding} ytd={stub.ytd_state_withholding} />
          <TaxRow label="NY SDI" current={stub.sdi} ytd={stub.ytd_sdi} alt />
          {!pflWaived && <TaxRow label="NY PFL" current={stub.pfl} ytd={stub.ytd_pfl} />}
        </View>

        {/* Payment summary — only when something was given outside the Zelle payment */}
        {givenSeparatelyItems.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Payment</Text>
            <View style={styles.table}>
              <View style={styles.tableRow}>
                <Text style={styles.col1}>Net Pay (total compensation)</Text>
                <Text style={styles.col2}>{formatCurrency(Number(stub.net_pay))}</Text>
                <Text style={styles.col3}></Text>
              </View>
              {givenSeparatelyItems.map((item, idx) => (
                <View key={item.id} style={idx % 2 === 0 ? styles.tableRowAlt : styles.tableRow}>
                  <Text style={styles.col1}>Already given: {item.label}</Text>
                  <Text style={styles.col2}>−{formatCurrency(Number(item.amount))}</Text>
                  <Text style={styles.col3}></Text>
                </View>
              ))}
              <View style={styles.tableRowAlt}>
                <Text style={[styles.col1, { fontFamily: 'Helvetica-Bold' }]}>Cash to Zelle</Text>
                <Text style={[styles.col2, { fontFamily: 'Helvetica-Bold' }]}>{formatCurrency(cashToZelle)}</Text>
                <Text style={styles.col3}></Text>
              </View>
            </View>
          </>
        )}

        {/* Non-taxable reimbursements */}
        {reimbursementLineItems.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Non-taxable Reimbursements</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.col1, styles.colHdr]}>Description</Text>
                <Text style={[styles.col2, styles.colHdr]}>Current</Text>
                <Text style={[styles.col3, styles.colHdr]}>YTD</Text>
              </View>
              {reimbursementLineItems.map((item, idx) => (
                <View key={item.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <Text style={styles.col1}>{item.label}</Text>
                  <Text style={styles.col2}>{formatCurrency(Number(item.amount))}</Text>
                  <Text style={styles.col3}>{formatCurrency(ytdByLineType[item.line_type] ?? Number(item.amount))}</Text>
                </View>
              ))}
              <View style={styles.tableRowAlt}>
                <Text style={[styles.col1, { fontFamily: 'Helvetica-Bold' }]}>Total reimbursements</Text>
                <Text style={[styles.col2, { fontFamily: 'Helvetica-Bold' }]}>{formatCurrency(reimbursementsTotal)}</Text>
                <Text style={styles.col3}></Text>
              </View>
            </View>
          </>
        )}

        {/* Informational only — admin only, never on employee variant */}
        {isAdmin && informationalLineItems.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Informational (not paid)</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.col1, styles.colHdr]}>Description</Text>
                <Text style={[styles.col2, styles.colHdr]}>Current</Text>
                <Text style={[styles.col3, styles.colHdr]}>YTD</Text>
              </View>
              {informationalLineItems.map((item, idx) => (
                <View key={item.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <Text style={styles.col1}>{item.label}</Text>
                  <Text style={styles.col2}>{formatCurrency(Number(item.amount))}</Text>
                  <Text style={styles.col3}>{formatCurrency(ytdByLineType[item.line_type] ?? Number(item.amount))}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Employer taxes — admin only */}
        {isAdmin && (
          <>
            <Text style={styles.sectionLabel}>Employer Taxes (not withheld from employee)</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.col1, styles.colHdr]}>Description</Text>
                <Text style={[styles.col2, styles.colHdr]}>Current</Text>
                <Text style={[styles.col3, styles.colHdr]}>YTD</Text>
              </View>
              <TaxRow label="Employer FICA — Social Security" current={stub.employer_fica_ss} ytd={stub.ytd_employer_fica_ss} alt />
              <TaxRow label="Employer FICA — Medicare" current={stub.employer_fica_medicare} ytd={stub.ytd_employer_fica_medicare} />
              <TaxRow label="FUTA" current={stub.futa} ytd={stub.ytd_futa} alt />
              <TaxRow label="SUTA (NY)" current={stub.suta} ytd={stub.ytd_suta} />
            </View>
          </>
        )}

        {/* Footer summary */}
        <View style={styles.footer}>
          <View style={styles.footerItem}>
            <Text style={styles.footerLabel}>YTD Gross</Text>
            <Text style={styles.footerValue}>{formatCurrency(stub.ytd_gross)}</Text>
          </View>
          <View style={styles.footerItem}>
            <Text style={styles.footerLabel}>YTD Deductions</Text>
            <Text style={styles.footerValue}>{formatCurrency(ytdTaxes)}</Text>
          </View>
          <View style={styles.footerItem}>
            <Text style={styles.footerLabel}>YTD Net Pay</Text>
            <Text style={styles.footerValue}>{formatCurrency(stub.ytd_net_pay)}</Text>
          </View>
          <View style={styles.footerItem}>
            <Text style={styles.footerLabel}>Gross</Text>
            <Text style={styles.footerValue}>{formatCurrency(Number(stub.gross_pay))}</Text>
          </View>
          <View style={styles.footerItem}>
            <Text style={styles.footerLabel}>Deductions</Text>
            <Text style={styles.footerValue}>{formatCurrency(stub.total_employee_taxes)}</Text>
          </View>
          <View style={styles.footerItem}>
            <Text style={styles.footerLabel}>Net Pay</Text>
            <Text style={[styles.footerValue, { fontSize: 12 }]}>{formatCurrency(Number(stub.net_pay))}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

function TaxRow({ label, current, ytd, alt }: { label: string; current: number; ytd: number; alt?: boolean }) {
  return (
    <View style={alt ? styles.tableRowAlt : styles.tableRow}>
      <Text style={styles.col1}>{label}</Text>
      <Text style={styles.col2}>{formatCurrency(Number(current))}</Text>
      <Text style={styles.col3}>{formatCurrency(Number(ytd))}</Text>
    </View>
  )
}
