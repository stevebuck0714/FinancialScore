import type { Metadata } from 'next'
// import './fonts.css' // CSS loader causing issues
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Corelytics - Financial Score Calculator',
  description: 'Professional financial health score calculator with P&L and Balance Sheet analysis',
  icons: {
    icon: '/corelytics-logo.jpg',
    apple: '/corelytics-logo.jpg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
        margin: 0,
        padding: 0,
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale'
      }}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}

