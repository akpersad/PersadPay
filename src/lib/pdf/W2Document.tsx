import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { BRAND_COLOR } from './constants'
import { formatCurrency } from '@/lib/dates'
import type { W2, Settings, W2Copy } from '@/lib/types'

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 7, padding: 36, color: '#1a1a1a' },
  // Top-level two-column layout: left identifiers | right wage boxes
  topRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  leftCol: { width: '42%' },
  rightCol: { flex: 1 },
  // Individual boxes
  box: { border: '0.5px solid #999', padding: '3 5', marginBottom: 3 },
  boxFull: { border: '0.5px solid #999', padding: '3 5', marginBottom: 3, flex: 1 },
  boxHalf: { border: '0.5px solid #999', padding: '3 5', flex: 1 },
  boxNum: { fontSize: 6, color: '#888', marginBottom: 1 },
  boxLabel: { fontSize: 6, color: '#555', marginBottom: 2 },
  boxValue: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  boxBlank: { fontSize: 8, color: '#bbb', letterSpacing: 1 },
  // Rows of two equal boxes
  twoCol: { flexDirection: 'row', gap: 4, marginBottom: 3 },
  // Rows of three equal boxes
  threeCol: { flexDirection: 'row', gap: 4, marginBottom: 3 },
  // Section heading
  sectionHead: { fontSize: 6, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: BRAND_COLOR, marginBottom: 3, marginTop: 4, letterSpacing: 0.5 },
  // Box 13 checkboxes
  checkRow: { flexDirection: 'row', gap: 10, marginBottom: 3, padding: '3 5', border: '0.5px solid #999' },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  checkbox: { width: 8, height: 8, border: '0.5px solid #555' },
  checkLabel: { fontSize: 6.5 },
  // Box 14 other
  box14: { border: '0.5px solid #999', padding: '3 5', marginBottom: 3, minHeight: 24 },
  box14Row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  // Copy designation + disclaimer
  copyDesignation: { marginTop: 8, paddingTop: 6, borderTop: '1px solid #ccc' },
  copyTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: BRAND_COLOR, marginBottom: 3 },
  copyNote: { fontSize: 6, color: '#555', lineHeight: 1.4 },
  worksheetBanner: { backgroundColor: '#ffeeee', border: '1px solid #cc0000', padding: '4 8', marginBottom: 8 },
  worksheetBannerText: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#cc0000', textAlign: 'center' },
  // Page title
  titleBar: { backgroundColor: BRAND_COLOR, padding: '4 8', marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleText: { color: '#fff', fontSize: 9, fontFamily: 'Helvetica-Bold' },
  titleYear: { color: '#fff', fontSize: 8 },
  // Box 12 — 2×2 grid below Box 11
  codeGrid: { flexDirection: 'row', gap: 4, marginBottom: 3 },
})

// Full IRS Pub 1141 §4 "Notice to Employee" text required on Copy B.
// Year comes from the W-2 being rendered, never the clock. The two dollar
// figures are year-specific: max SS/Tier 1 tax = 6.2% × SS wage base
// ($184,500 × 0.062 = $11,439.00 for 2026) and the Tier 2 RRTA max. Verify
// both when the December "Verify tax rates" reminder fires.
const MAX_SS_TAX_BY_YEAR: Record<number, string> = { 2026: '$11,439.00' }
const MAX_TIER2_RRTA_BY_YEAR: Record<number, string> = { 2026: '$6,844.80' }

function noticeToEmployee(taxYear: number): string[] {
  const maxSs = MAX_SS_TAX_BY_YEAR[taxYear] ?? MAX_SS_TAX_BY_YEAR[2026]
  const maxTier2 = MAX_TIER2_RRTA_BY_YEAR[taxYear] ?? MAX_TIER2_RRTA_BY_YEAR[2026]
  return [
    'Do you have to file? Refer to the Instructions for Forms 1040 and 1040-SR to determine if you are required to file a tax return. Even if you do not have to file a tax return, you may be eligible for a refund if box 2 shows an amount or if you are eligible for any credit.',
    `Earned income credit (EIC). You may be able to take the EIC for ${taxYear} if your adjusted gross income (AGI) is less than a certain amount. The amount of the credit is based on income and family size. Workers without children could qualify for a smaller credit. You and any qualifying children must have valid Social Security numbers (SSNs). You can't take the EIC if your investment income is more than the specified amount for ${taxYear} or if income is earned for services provided while you were an inmate at a penal institution.`,
    'Corrections. If your name, SSN, or address is incorrect, correct Copies B, C, and 2 and ask your employer to correct your employment record. Be sure to ask the employer to file Form W-2c, Corrected Wage and Tax Statement, with the Social Security Administration (SSA) to correct any name, SSN, or money amount error reported to the SSA on Form W-2. Be sure to get your copies of Form W-2c from your employer for all corrections made so you may correct your other tax returns, if necessary. In addition, if your incorrect SSN has been reported to the SSA, contact the SSA at 1-800-772-1213.',
    'Cost of employer-sponsored health coverage (if such cost is provided by the employer). The reporting in box 12, using code DD, of the cost of employer-sponsored health coverage is for your information only. The amount reported with code DD is not taxable.',
    `Credit for excess taxes. If you had more than one employer in ${taxYear} and more than ${maxSs} in social security and/or Tier 1 railroad retirement (RRTA) taxes were withheld, you may be able to claim a credit for the excess against your federal income tax. If you had more than one railroad employer and more than ${maxTier2} in Tier 2 RRTA tax was withheld, you also may be able to claim a credit. See your Form 1040 or 1040-SR instructions and Pub. 505, Tax Withholding and Estimated Tax.`,
  ]
}

interface Props {
  w2: W2
  settings: Settings
  copy?: W2Copy
  sdiWithheld?: number
  pflWithheld?: number
}

const COPY_INFO: Record<W2Copy, { title: string; note: string }> = {
  B: { title: "Copy B: To Be Filed With Employee's Federal Tax Return", note: '' },
  C: { title: "Copy C: For Employee's Records", note: 'Keep this copy with your records. Refer to it when preparing your tax return.' },
  '2': { title: "Copy 2: To Be Filed With Employee's State, City, or Local Income Tax Return", note: 'File this copy with your state, city, or local tax return.' },
  D: { title: "Copy D: For Employer's Records", note: 'Keep this copy with your payroll records for at least 4 years.' },
  worksheet: { title: 'WORKSHEET: NOT A FILED FORM', note: 'This is a calculation worksheet only. Do not file with the IRS, SSA, or any tax authority. Hand-write SSN on Copies B, C, 2, and D before distributing. File Copy A electronically via SSA BSO (ssa.gov/bso).' },
}

function W2PageContent({ w2, settings, copy, sdiWithheld, pflWithheld }: Required<Props>) {
  const empFirst = settings.employee_name_first ?? ''
  const empMI = settings.employee_name_middle_initial ?? ''
  const empLast = settings.employee_name_last ?? ''
  const empNameSplit = [empFirst, empMI ? `${empMI}.` : '', empLast].filter(Boolean).join(' ')
  const empName = empNameSplit || settings.employee_name || '—'

  const copyInfo = COPY_INFO[copy]
  const isWorksheet = copy === 'worksheet'
  const isCopyB = copy === 'B'

  const box14Lines: { label: string; amount: number }[] = []
  if (sdiWithheld > 0) box14Lines.push({ label: 'NY SDI', amount: sdiWithheld })
  if (pflWithheld > 0) box14Lines.push({ label: 'NYPFL', amount: pflWithheld })

  return (
    <>
      {isWorksheet && (
        <View style={styles.worksheetBanner}>
          <Text style={styles.worksheetBannerText}>WORKSHEET: NOT A FILED FORM. DO NOT FILE WITH IRS, SSA, OR STATE</Text>
        </View>
      )}

      <View style={styles.titleBar}>
        <Text style={styles.titleText}>W-2 Wage and Tax Statement: {w2.tax_year}</Text>
        <Text style={styles.titleYear}>Department of the Treasury, Internal Revenue Service</Text>
      </View>

      {/* Top section: left identifiers + right wage boxes */}
      <View style={styles.topRow}>
        {/* Left column: Boxes a, b, c, d */}
        <View style={styles.leftCol}>
          <View style={styles.box}>
            <Text style={styles.boxNum}>a</Text>
            <Text style={styles.boxLabel}>Employee&apos;s social security number</Text>
            <Text style={styles.boxBlank}>___  -  __  -  ____</Text>
          </View>
          <View style={styles.box}>
            <Text style={styles.boxNum}>b</Text>
            <Text style={styles.boxLabel}>Employer identification number (EIN)</Text>
            <Text style={styles.boxValue}>{settings.employer_ein ?? '—'}</Text>
          </View>
          <View style={[styles.box, { minHeight: 40 }]}>
            <Text style={styles.boxNum}>c</Text>
            <Text style={styles.boxLabel}>Employer&apos;s name, address, and ZIP code</Text>
            <Text style={styles.boxValue}>{settings.employer_name ?? '—'}</Text>
            {settings.employer_address ? <Text style={{ fontSize: 7, marginTop: 2 }}>{settings.employer_address}</Text> : null}
          </View>
          <View style={styles.box}>
            <Text style={styles.boxNum}>d</Text>
            <Text style={styles.boxLabel}>Control number</Text>
            <Text style={styles.boxValue}> </Text>
          </View>
        </View>

        {/* Right column: Boxes 1–11, then 12a–d contiguous block */}
        <View style={styles.rightCol}>
          <View style={styles.twoCol}>
            <WageBox num={1} label="Wages, tips, other compensation" value={w2.wages_tips} />
            <WageBox num={2} label="Federal income tax withheld" value={w2.federal_tax_withheld} />
          </View>
          <View style={styles.twoCol}>
            <WageBox num={3} label="Social security wages" value={w2.ss_wages} />
            <WageBox num={4} label="Social security tax withheld" value={w2.ss_tax_withheld} />
          </View>
          <View style={styles.twoCol}>
            <WageBox num={5} label="Medicare wages and tips" value={w2.medicare_wages} />
            <WageBox num={6} label="Medicare tax withheld" value={w2.medicare_tax_withheld} />
          </View>
          <View style={styles.twoCol}>
            <WageBox num={7} label="Social security tips" value={null} />
            <WageBox num={8} label="Allocated tips" value={null} />
          </View>
          <View style={styles.twoCol}>
            <EmptyBox num={9} />
            <WageBox num={10} label="Dependent care benefits" value={null} />
          </View>
          {/* Box 11 full-width, then 12a–d as a 2×2 grid below */}
          <View style={[styles.box, { marginBottom: 3 }]}>
            <Text style={styles.boxNum}>11</Text>
            <Text style={styles.boxLabel}>Nonqualified plans</Text>
            <Text style={styles.boxValue}>—</Text>
          </View>
          <View style={styles.codeGrid}>
            <CodeBox letter="a" />
            <CodeBox letter="b" />
          </View>
          <View style={styles.codeGrid}>
            <CodeBox letter="c" />
            <CodeBox letter="d" />
          </View>
        </View>
      </View>

      {/* Boxes e, f (employee name + address) — full width below top section */}
      <View style={[styles.twoCol, { marginBottom: 3 }]}>
        <View style={[styles.box, { flex: 1, minHeight: 28 }]}>
          <Text style={styles.boxNum}>e</Text>
          <Text style={styles.boxLabel}>Employee&apos;s first name and initial / Last name</Text>
          <Text style={styles.boxValue}>{empName}</Text>
        </View>
        <View style={[styles.box, { flex: 1, minHeight: 28 }]}>
          <Text style={styles.boxNum}>f</Text>
          <Text style={styles.boxLabel}>Employee&apos;s address and ZIP code</Text>
          <Text style={styles.boxValue}>{settings.employee_address ?? ' '}</Text>
        </View>
      </View>

      {/* Box 13 checkboxes */}
      <View style={styles.checkRow}>
        <Text style={[styles.boxNum, { marginRight: 4 }]}>13</Text>
        <View style={styles.checkItem}>
          <View style={styles.checkbox} />
          <Text style={styles.checkLabel}>Statutory employee</Text>
        </View>
        <View style={styles.checkItem}>
          <View style={styles.checkbox} />
          <Text style={styles.checkLabel}>Retirement plan</Text>
        </View>
        <View style={styles.checkItem}>
          <View style={styles.checkbox} />
          <Text style={styles.checkLabel}>Third-party sick pay</Text>
        </View>
      </View>

      {/* Box 14 — Other (SDI, PFL) */}
      <View style={styles.box14}>
        <Text style={styles.boxNum}>14 Other</Text>
        {box14Lines.length > 0
          ? box14Lines.map(({ label, amount }) => (
              <View key={label} style={styles.box14Row}>
                <Text style={{ fontSize: 7 }}>{label}</Text>
                <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold' }}>{formatCurrency(amount)}</Text>
              </View>
            ))
          : <Text style={{ fontSize: 6.5, color: '#aaa', marginTop: 2 }}>—</Text>
        }
      </View>

      {/* State/local section */}
      <Text style={styles.sectionHead}>State and Local</Text>
      <View style={styles.threeCol}>
        <View style={styles.boxHalf}>
          <Text style={styles.boxNum}>15</Text>
          <Text style={styles.boxLabel}>State / Employer&apos;s state ID number</Text>
          <Text style={styles.boxValue}>NY  {settings.employer_ny_state_id ?? '—'}</Text>
        </View>
        <WageBox num={16} label="State wages, tips, etc." value={w2.state_wages} />
        <WageBox num={17} label="State income tax" value={w2.state_tax_withheld} />
      </View>
      <View style={styles.threeCol}>
        <WageBox num={18} label="Local wages, tips, etc." value={null} />
        <WageBox num={19} label="Local income tax" value={null} />
        <View style={styles.boxHalf}>
          <Text style={styles.boxNum}>20</Text>
          <Text style={styles.boxLabel}>Locality name</Text>
          <Text style={{ fontSize: 7 }}> </Text>
        </View>
      </View>

      {/* Copy designation + disclaimer */}
      <View style={styles.copyDesignation}>
        <Text style={styles.copyTitle}>{copyInfo.title}</Text>
        {isCopyB ? (
          // Full IRS Pub 1141 §4 Notice to Employee required on Copy B
          noticeToEmployee(w2.tax_year).map((para, i) => (
            <Text key={i} style={[styles.copyNote, { marginBottom: 3 }]}>{para}</Text>
          ))
        ) : (
          <Text style={styles.copyNote}>{copyInfo.note}</Text>
        )}
        {!isWorksheet && (
          <Text style={[styles.copyNote, { marginTop: 4, color: '#888' }]}>
            Box a (SSN) must be hand-written on this copy before distribution. SSN is not stored in the app.
          </Text>
        )}
      </View>
    </>
  )
}

export function W2Document({ w2, settings, copy = 'B', sdiWithheld = 0, pflWithheld = 0 }: Props) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <W2PageContent w2={w2} settings={settings} copy={copy} sdiWithheld={sdiWithheld} pflWithheld={pflWithheld} />
      </Page>
    </Document>
  )
}

// Multi-copy packet: Copy B + Copy C + Copy 2 in a single PDF for employee distribution
export function W2PacketDocument({ w2, settings, sdiWithheld = 0, pflWithheld = 0 }: Omit<Props, 'copy'>) {
  const copies: W2Copy[] = ['B', 'C', '2']
  return (
    <Document>
      {copies.map(copy => (
        <Page key={copy} size="LETTER" style={styles.page}>
          <W2PageContent w2={w2} settings={settings} copy={copy} sdiWithheld={sdiWithheld} pflWithheld={pflWithheld} />
        </Page>
      ))}
    </Document>
  )
}

function WageBox({ num, label, value }: { num: number; label: string; value: number | null }) {
  return (
    <View style={styles.boxHalf}>
      <Text style={styles.boxNum}>{num}</Text>
      <Text style={styles.boxLabel}>{label}</Text>
      <Text style={styles.boxValue}>
        {value !== null ? formatCurrency(value) : '—'}
      </Text>
    </View>
  )
}

function EmptyBox({ num }: { num: number }) {
  return (
    <View style={styles.boxHalf}>
      <Text style={styles.boxNum}>{num}</Text>
      <Text style={styles.boxValue}> </Text>
    </View>
  )
}

function CodeBox({ letter }: { letter: string }) {
  return (
    <View style={[styles.boxHalf, { marginBottom: 0 }]}>
      <Text style={styles.boxNum}>12{letter}</Text>
      <Text style={styles.boxLabel}>Code __  Amount</Text>
      <Text style={styles.boxValue}> </Text>
    </View>
  )
}
