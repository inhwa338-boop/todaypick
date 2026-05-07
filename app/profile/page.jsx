'use client'

import { useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
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

export default function ProfilePage() {
  const router = useRouter()
  const [tasteProfile, setTasteProfile] = useState(null)
  const [shortsCategories, setShortsCategories] = useState([])
  const [shortsVibe, setShortsVibe] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((data) => {
        setTasteProfile(data.taste_profile || null)
        setShortsCategories(data.shorts_taste_profile?.categories || [])
        setShortsVibe(data.shorts_taste_profile?.vibe || '')
        setLoading(false)
        setTimeout(() => setAnimated(true), 50)
      })
      .catch((err) => {
        console.error('Failed to load profile:', err)
        setLoading(false)
      })
  }, [])

  function toggleCategory(cat) {
    setShortsCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    )
  }

  async function handleSave() {
    setSaving(true)
    try {
      await fetch('/api/complete-onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shorts_taste_profile: { categories: shortsCategories, vibe: shortsVibe },
        }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (err) {
      console.error('Failed to save shorts preference:', err)
    } finally {
      setSaving(false)
    }
  }

  const categoryEntries = tasteProfile?.category_weights
    ? Object.entries(tasteProfile.category_weights)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    : []
  const maxWeight = categoryEntries[0]?.[1] || 1

  const containerStyle = {
    backgroundColor: '#08090a',
    minHeight: '100vh',
    fontFamily: 'var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif',
    color: '#f7f8f8',
    maxWidth: '480px',
    margin: '0 auto',
  }

  const cardStyle = {
    backgroundColor: '#0f1011',
    borderRadius: '6px',
    padding: '16px',
    border: '1px solid #23252a',
    boxShadow: 'rgba(0,0,0,0.4) 0px 2px 4px 0px',
  }

  const sectionTitleStyle = {
    fontSize: '15px',
    fontWeight: 600,
    color: '#f7f8f8',
    margin: '0 0 4px',
    letterSpacing: '-0.13px',
  }

  const descStyle = {
    fontSize: '12px',
    color: '#8a8f98',
    margin: '0 0 16px',
    letterSpacing: '-0.13px',
    lineHeight: 1.5,
  }

  return (
    <div style={containerStyle}>
      {/* 헤더 */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          backgroundColor: '#08090a',
          borderBottom: '1px solid #23252a',
        }}
      >
        <button
          onClick={() => router.back()}
          aria-label="뒤로 가기"
          style={{
            background: 'none',
            border: 'none',
            color: '#8a8f98',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '0 4px 0 0',
            display: 'flex',
            alignItems: 'center',
            lineHeight: 1,
          }}
        >
          ← 뒤로
        </button>
        <span
          style={{
            fontSize: '15px',
            fontWeight: 600,
            color: '#f7f8f8',
            letterSpacing: '-0.13px',
          }}
        >
          프로필
        </span>
      </header>

      {loading ? (
        <div style={{ padding: '48px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: '#8a8f98', letterSpacing: '-0.13px' }}>
            불러오는 중...
          </p>
        </div>
      ) : (
        <main
          style={{
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* 취향 프로파일 카드 */}
          <div style={cardStyle}>
            <p style={sectionTitleStyle}>내 취향 카테고리</p>
            <p style={descStyle}>구독 채널을 분석해 AI가 파악한 취향이에요</p>

            {!tasteProfile ? (
              <p
                style={{
                  fontSize: '13px',
                  color: '#62666d',
                  letterSpacing: '-0.13px',
                }}
              >
                아직 취향 분석이 완료되지 않았어요
              </p>
            ) : (
              <>
                {/* 막대 바 */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    marginBottom: '20px',
                  }}
                >
                  {categoryEntries.map(([label, value]) => {
                    const barPct = (value / maxWeight) * 100
                    const displayPct = Math.round(value * 100)
                    return (
                      <div
                        key={label}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                      >
                        <span
                          style={{
                            fontSize: '12px',
                            color: '#f7f8f8',
                            width: '64px',
                            flexShrink: 0,
                            letterSpacing: '-0.13px',
                          }}
                        >
                          {label}
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: '5px',
                            backgroundColor: '#23252a',
                            borderRadius: '9999px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              backgroundColor: '#e4f222',
                              borderRadius: '9999px',
                              width: animated ? `${barPct}%` : '0%',
                              transition: 'width 0.6s ease-out',
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#8a8f98',
                            width: '32px',
                            textAlign: 'right',
                            flexShrink: 0,
                            letterSpacing: '-0.1px',
                          }}
                        >
                          {displayPct}%
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* 키워드 칩 */}
                {tasteProfile.search_keywords?.length > 0 && (
                  <>
                    <p
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#8a8f98',
                        margin: '0 0 8px',
                        letterSpacing: '0.3px',
                        textTransform: 'uppercase',
                      }}
                    >
                      키워드
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {tasteProfile.search_keywords.slice(0, 10).map((kw) => (
                        <span
                          key={kw}
                          style={{
                            display: 'inline-block',
                            background: '#23252a',
                            color: '#8a8f98',
                            borderRadius: '2px',
                            fontSize: '12px',
                            padding: '3px 8px',
                            letterSpacing: '-0.1px',
                          }}
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* 쇼츠 취향 카드 */}
          <div style={cardStyle}>
            <p style={sectionTitleStyle}>쇼츠 취향 설정</p>
            <p style={{ ...descStyle, marginBottom: '12px' }}>
              주로 보는 쇼츠 유형은?{' '}
              <span style={{ fontWeight: 400 }}>(복수 선택)</span>
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                marginBottom: '20px',
              }}
            >
              {CATEGORIES.map((cat) => {
                const selected = shortsCategories.includes(cat)
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
                      backgroundColor: selected ? '#e4f222' : '#23252a',
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

            <p style={{ ...descStyle, marginBottom: '12px' }}>
              선호하는 분위기는?{' '}
              <span style={{ fontWeight: 400 }}>(단일 선택)</span>
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginBottom: '20px',
              }}
            >
              {VIBES.map((vibe) => {
                const selected = shortsVibe === vibe
                return (
                  <button
                    key={vibe}
                    onClick={() => setShortsVibe(vibe)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 400,
                      border: selected ? '1px solid #e4f222' : '1px solid #23252a',
                      cursor: 'pointer',
                      backgroundColor: selected
                        ? 'rgba(228,242,34,0.08)'
                        : '#23252a',
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

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 590,
                border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                backgroundColor: saved ? '#23252a' : '#e4f222',
                color: saved ? '#e4f222' : '#08090a',
                letterSpacing: '-0.13px',
                transition: 'background-color 0.2s, color 0.2s',
              }}
            >
              {saved ? '저장됨 ✓' : saving ? '저장 중...' : '저장'}
            </button>
          </div>

          {/* 계정 관리 카드 */}
          <div style={cardStyle}>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 400,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: '#23252a',
                color: '#eb5757',
                letterSpacing: '-0.13px',
              }}
            >
              로그아웃
            </button>
          </div>
        </main>
      )}
    </div>
  )
}
