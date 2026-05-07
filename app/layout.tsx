import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VKMotion — Live Counter',
  description: 'Real-time people counter dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-grafana-bg antialiased">
        {children}
      </body>
    </html>
  )
}
