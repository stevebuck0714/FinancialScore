import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Corelytics - Financial Score Calculator',
  description: 'Professional financial health score calculator with P&L and Balance Sheet analysis',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

