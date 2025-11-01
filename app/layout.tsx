import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import InactivityLogout from './components/InactivityLogout'

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
      <body>
        <Providers>
          <InactivityLogout />
          {children}
        </Providers>
      </body>
    </html>
  )
}

