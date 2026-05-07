import { Inter } from 'next/font/google'
import Providers from './providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata = {
  title: '오늘은 이거다',
  description: '유명하지만 나만 몰랐던 유튜브, 오늘 발견하세요',
  themeColor: '#08090a',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '오늘은 이거다',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className={`${inter.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
