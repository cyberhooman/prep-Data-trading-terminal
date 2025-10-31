import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Alphalabs Data Trading - Live Currency & Event Dashboard',
  description: 'Real-time currency strength analysis and high-impact forex event countdown timers for professional traders.',
  keywords: 'forex, trading, currency strength, economic calendar, forex factory',
  authors: [{ name: 'Alphalabs' }],
  openGraph: {
    title: 'Alphalabs Data Trading',
    description: 'Live currency strength snapshot and high-impact event timers',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
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
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
