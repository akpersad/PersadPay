import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { BRAND_COLOR } from './constants'
import { formatCurrency } from '@/lib/dates'
import type { W2, Settings, W2Copy } from '@/lib/types'

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 7, padding: 28, color: '#1a1a1a' },
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
  copyDesignation: { marginTop: 10, paddingTop: 6, borderTop: '1px solid #ccc' },
  copyTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: BRAND_COLOR, marginBottom: 2 },
  copyNote: { fontSize: 6.5, color: '#555' },
  worksheetBanner: { backgroundColor: '#ffeeee', border: '1px solid #cc0000', padding: '4 8', marginBottom: 8 },
  worksheetBannerText: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#cc0000', textAlign: 'center' },
  // Page title
  titleBar: { backgroundColor: BRAND_COLOR, padding: '4 8', marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleText: { color: '#fff', fontSize: 9, fontFamily: 'Helvetica-Bold' },
  titleYear: { color: '#fff', fontSize: 8 },
})

interface Props {
  w2: W2
  settings: Settings
  copy?: W2Copy
  sdiWithheld?: number
  pflWithheld?: number
}

export function W2Document({ w2, settings, copy = 'B', sdiWithheld = 0, pflWithheld = 0 }: Props) {
  const empFirst = settings.employee_name_first ?? ''
  const empMI = settings.employee_name_middle_initial ?? ''
  const empLast = settings.employee_name_last ?? ''
  const empNameSplit = [empFirst, empMI ? `${empMI}.` : '', empLast].filter(Boolean).join(' ')
  const empName = empNameSplit || settings.employee_name || '—'

  const COPY_INFO: Record<W2Copy, { title: string; note: string }> = {
    B: { title: 'Copy B — To Be Filed With Employee\'s Federal Tax Return', note: 'This information is being furnished to the Internal Revenue Service. If you are required to file a tax return, a negligence penalty or other sanction may be imposed on you if this income is taxable and you fail to report it.' },
    C: { title: 'Copy C — For Employee\'s Records', note: 'This copy should be kept with your records. Refer to it when preparing your tax return.' },
    '2': { title: 'Copy 2 — To Be Filed With Employee\'s State, City, or Local Income Tax Return', note: 'File this copy with your state, city, or local tax return.' },
    D: { title: 'Copy D — For Employer\'s Records', note: 'Keep this copy with your payroll records for at least 4 years.' },
    worksheet: { title: 'WORKSHEET — NOT A FILED FORM', note: 'This is a calculation worksheet only. Do not file with the IRS, SSA, or any tax authority. Hand-write SSN on Copies B, C, 2, and D before distributing. File Copy A electronically via SSA BSO (ssa.gov/bso).' },
  }
  const copyInfo = COPY_INFO[copy]
  const isWorksheet = copy === 'worksheet'

  const box14Lines: { label: string; amount: number }[] = []
  if (sdiWithheld > 0) box14Lines.push({ label: 'NY SDI', amount: sdiWithheld })
  if (pflWithheld > 0) box14Lines.push({ label: 'NYPFL', amount: pflWithheld })

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {isWorksheet && (
          <View style={styles.worksheetBanner}>
            <Text style={styles.worksheetBannerText}>WORKSHEET — NOT A FILED FORM — DO NOT FILE WITH IRS, SSA, OR STATE</Text>
          </View>
        )}

        <View style={styles.titleBar}>
          <Text style={styles.titleText}>W-2 Wage and Tax Statement — {w2.tax_year}</Text>
          <Text style={styles.titleYear}>Department of the Treasury — Internal Revenue Service</Text>
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

          {/* Right column: Boxes 1–11 in pairs */}
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
              <EmptyBox num={9} label="" />
              <WageBox num={10} label="Dependent care benefits" value={null} />
            </View>
            <View style={styles.twoCol}>
              <WageBox num={11} label="Nonqualified plans" value={null} />
              <CodeBox letter="a" />
            </View>
          </View>
        </View>

        {/* Boxes e, f (employee name + address) + boxes 12b-d + 13 */}
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <View style={[styles.box, { minHeight: 28 }]}>
              <Text style={styles.boxNum}>e</Text>
              <Text style={styles.boxLabel}>Employee&apos;s first name and initial / Last name</Text>
              <Text style={styles.boxValue}>{empName}</Text>
            </View>
            <View style={[styles.box, { minHeight: 28 }]}>
              <Text style={styles.boxNum}>f</Text>
              <Text style={styles.boxLabel}>Employee&apos;s address and ZIP code</Text>
              <Text style={styles.boxValue}>{settings.employee_address ?? ' '}</Text>
            </View>
          </View>
          <View style={{ width: '32%' }}>
            <CodeBox letter="b" />
            <CodeBox letter="c" />
            <CodeBox letter="d" />
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
          <Text style={styles.boxNum}>14 — Other</Text>
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
          <Text style={styles.copyNote}>{copyInfo.note}</Text>
          {!isWorksheet && (
            <Text style={[styles.copyNote, { marginTop: 4, color: '#888' }]}>
              Box a (SSN) must be hand-written on this copy before distribution. SSN is not stored in the app.
            </Text>
          )}
        </View>
      </Page>
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

function EmptyBox({ num, label }: { num: number; label: string }) {
  return (
    <View style={styles.boxHalf}>
      <Text style={styles.boxNum}>{num}</Text>
      {label ? <Text style={styles.boxLabel}>{label}</Text> : null}
      <Text style={styles.boxValue}> </Text>
    </View>
  )
}

function CodeBox({ letter }: { letter: string }) {
  return (
    <View style={styles.box}>
      <Text style={styles.boxNum}>12{letter}</Text>
      <Text style={styles.boxLabel}>Code __  Amount</Text>
      <Text style={styles.boxValue}> </Text>
    </View>
  )
}
