'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const CATEGORIES = [
  '웃긴 영상/밈', '요리/레시피', '운동/헬스',
  '뷰티/패션', '지식/정보', '동물/힐링',
  '음악/댄스', '게임', '패션/스타일',
  '여행', '재테크', '스포츠',
]

const VIBES = [
  '웃기고 가벼운 것',
  '유익하고 배우는 것',
  '감성적이고 힐링되는 것',
]

export default function OnboardingPage() {
  const { update } = useSession()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [selectedCategories, setSelectedCategories] = useState([])
  const [selectedVibe, setSelectedVibe] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => {
    let prog = 0
    const interval = setInterval(() => {
      prog = prog < 90 ? prog + (90 - prog) * 0.03 : prog
      setProgress(Math.min(prog, 90))
    }, 200)

    fetch('/api/collect-subscriptions', { method: 'POST' })
      .then(() => {
        clearInterval(interval)
        setProgress(100)
        setTimeout(() => setStep(2), 600)
      })
      .catch(() => {
        clearInterval(interval)
        setError('구독 채널 수집에 실패했어요. 새로고침 후 다시 시도해주세요.')
      })

    return () => clearInterval(interval)
  }, [])

  function toggleCategory(cat) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    )
  }

  async function handleComplete(skip = false) {
    const profile = skip
      ? {}
      : { categories: selectedCategories, vibe: selectedVibe }

    try {
      await fetch('/api/complete-onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shorts_taste_profile: profile }),
      })
      await update({ onboarding_completed: true })
    } catch {
      // 오류가 있어도 step 3으로 진행
    }
    setStep(3)
  }

  useEffect(() => {
    if (step !== 3) return
    const timer = setTimeout(() => router.push('/today'), 3000)
    return () => clearTimeout(timer)
  }, [step, router])

  const containerStyle = {
    backgroundColor: '#08090a',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif',
    color: '#f7f8f8',
    padding: '24px',
  }

  const cardStyle = {
    backgroundColor: '#0f1011',
    borderRadius: '6px',
    padding: '32px',
    width: '100%',
    maxWidth: '480px',
    boxShadow: 'rgba(0, 0, 0, 0.4) 0px 2px 4px 0px',
  }

  if (step === 1) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', maxWidth: '480px', width: '100%' }}>
          <p
            style={{
              fontSize: '20px',
              fontWeight: 510,
              color: '#f7f8f8',
              marginBottom: '8px',
              letterSpacing: '-0.13px',
            }}
          >
            취향을 분석하고 있어요 ✨
          </p>
          <p
            style={{
              fontSize: '14px',
              color: '#8a8f98',
              marginBottom: '32px',
              letterSpacing: '-0.13px',
            }}
          >
            구독 채널을 기반으로 취향을 파악하고 있어요
          </p>
          <div
            style={{
              backgroundColor: '#23252a',
              borderRadius: '9999px',
              height: '6px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                backgroundColor: '#e4f222',
                borderRadius: '9999px',
                width: `${progress}%`,
                transition: 'width 0.3s ease-in-out',
              }}
            />
          </div>
          {error && (
            <p
              style={{
                color: '#eb5757',
                fontSize: '13px',
                marginTop: '16px',
                letterSpacing: '-0.13px',
              }}
            >
              {error}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <p
            style={{
              fontSize: '15px',
              fontWeight: 510,
              marginBottom: '4px',
              letterSpacing: '-0.13px',
            }}
          >
            주로 보는 쇼츠 유형은?
          </p>
          <p
            style={{
              fontSize: '13px',
              color: '#8a8f98',
              marginBottom: '16px',
              letterSpacing: '-0.13px',
            }}
          >
            복수 선택 가능
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              marginBottom: '24px',
            }}
          >
            {CATEGORIES.map((cat) => {
              const selected = selectedCategories.includes(cat)
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 400,
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: selected ? '#e4f222' : '#383b3f',
                    color: selected ? '#08090a' : '#f7f8f8',
                    letterSpacing: '-0.13px',
                    transition: 'background-color 0.15s, color 0.15s',
                  }}
                >
                  {cat}
                </button>
              )
            })}
          </div>

          <p
            style={{
              fontSize: '15px',
              fontWeight: 510,
              marginBottom: '4px',
              letterSpacing: '-0.13px',
            }}
          >
            선호하는 분위기는?
          </p>
          <p
            style={{
              fontSize: '13px',
              color: '#8a8f98',
              marginBottom: '16px',
              letterSpacing: '-0.13px',
            }}
          >
            단일 선택
          </p>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginBottom: '32px',
            }}
          >
            {VIBES.map((vibe) => {
              const selected = selectedVibe === vibe
              return (
                <button
                  key={vibe}
                  onClick={() => setSelectedVibe(vibe)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 400,
                    border: selected
                      ? '1px solid #e4f222'
                      : '1px solid #23252a',
                    cursor: 'pointer',
                    backgroundColor: selected
                      ? 'rgba(228, 242, 34, 0.08)'
                      : 'transparent',
                    color: selected ? '#e4f222' : '#f7f8f8',
                    textAlign: 'left',
                    letterSpacing: '-0.13px',
                    transition:
                      'background-color 0.15s, border-color 0.15s, color 0.15s',
                  }}
                >
                  {vibe}
                </button>
              )
            })}
          </div>

          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
            }}
          >
            <button
              onClick={() => handleComplete(true)}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 400,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: 'transparent',
                color: '#d0d6e0',
                letterSpacing: '-0.13px',
              }}
            >
              나중에 할게요
            </button>
            <button
              onClick={() => handleComplete(false)}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 590,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: '#e4f222',
                color: '#08090a',
                letterSpacing: '-0.13px',
              }}
            >
              완료!
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={{ textAlign: 'center' }}>
        <p
          style={{
            fontSize: '24px',
            fontWeight: 590,
            color: '#f7f8f8',
            letterSpacing: '-0.22px',
            marginBottom: '8px',
          }}
        >
          준비됐어요! 🎬
        </p>
        <p
          style={{
            fontSize: '14px',
            color: '#8a8f98',
            letterSpacing: '-0.13px',
          }}
        >
          오늘의 추천을 볼게요
        </p>
      </div>
    </div>
  )
}
