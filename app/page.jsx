'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'

const TAGLINE = '유명하지만 나만 몰랐던 유튜브, 오늘 발견하세요'

function GoogleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.29-8.16 2.29-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

export default function LandingPage() {
  const [displayText, setDisplayText] = useState('')
  const [typingDone, setTypingDone] = useState(false)
  const [cursorVisible, setCursorVisible] = useState(true)

  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      i++
      setDisplayText(TAGLINE.slice(0, i))
      if (i >= TAGLINE.length) {
        clearInterval(id)
        setTypingDone(true)
      }
    }, 50)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (typingDone) return
    const id = setInterval(() => setCursorVisible((v) => !v), 500)
    return () => clearInterval(id)
  }, [typingDone])

  return (
    <div
      style={{
        backgroundColor: '#08090a',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <h1
          style={{
            fontSize: '28px',
            fontWeight: 700,
            color: '#e4f222',
            letterSpacing: '-0.22px',
            margin: '0 0 12px',
          }}
        >
          오늘은 이거다
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: '#8a8f98',
            letterSpacing: '-0.13px',
            lineHeight: 1.6,
            textAlign: 'center',
            margin: '0 0 48px',
            minHeight: '46px',
          }}
        >
          {displayText}
          {!typingDone && (
            <span
              style={{
                opacity: cursorVisible ? 1 : 0,
                color: '#e4f222',
                fontWeight: 300,
                transition: 'opacity 0.1s',
              }}
            >
              |
            </span>
          )}
        </p>
        <button
          onClick={() => signIn('google', { callbackUrl: '/today' })}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            width: '100%',
            padding: '12px 24px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: '#e4f222',
            color: '#08090a',
            fontSize: '15px',
            fontWeight: 600,
            letterSpacing: '-0.13px',
          }}
        >
          <GoogleIcon />
          Google로 시작하기
        </button>
      </div>
    </div>
  )
}
