import './globals.css'
import type { Metadata } from 'next'
import ConsentModal from '@/components/ConsentModal'

export const metadata: Metadata = {
  title: 'APEX - Navy Performance Evaluation eXchange',
  description: 'Next-gen web system for BUPERSINST 1610.10H EVAL validation.'
}

// Global layout wrapper for our app. Includes the Outfit font from Google CDN.
export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased min-h-screen bg-[#0b132b] text-[#f0f4f8]">
        <ConsentModal />
        {children}
      </body>
    </html>
  )
}
