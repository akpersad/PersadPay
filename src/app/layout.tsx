import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'Persad Pay',
  description: 'Household payroll for the Persad family',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Persad Pay',
  },
  icons: {
    apple: '/icon-192.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1a1a2e',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="min-h-screen bg-background font-sans antialiased" suppressHydrationWarning>
        <ServiceWorkerRegistration />
        {children}
        <Toaster />
      </body>
    </html>
  )
}
