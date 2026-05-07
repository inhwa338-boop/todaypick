'use client'

import { useEffect } from 'react'
import { SessionProvider } from 'next-auth/react'

export default function Providers({ children }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error)
    }
  }, [])

  return <SessionProvider>{children}</SessionProvider>
}
