# STEP 11: /profile 설정 페이지 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 유저가 AI 취향 프로파일을 확인하고, 쇼츠 취향을 수정하고, 로그아웃할 수 있는 /profile 설정 페이지를 구현한다.

**Architecture:** 새 `GET /api/profile` 엔드포인트가 taste_profile + shorts_taste_profile을 반환하고, `app/profile/page.jsx` Client Component가 전체 UI를 담당한다. 쇼츠 취향 저장은 기존 `PATCH /api/complete-onboarding`을 재사용한다. `app/today/page.jsx`의 아바타를 /profile Link로 수정해 진입점을 연결한다.

**Tech Stack:** next-auth/react (useSession, signOut), next/navigation (useRouter), next/link (Link), React useState/useEffect

---

## 파일 구조

```
app/api/profile/route.js    # Create: GET 핸들러 (새 파일)
app/profile/page.jsx         # Create: 프로필 UI Client Component (새 파일)
app/today/page.jsx           # Modify: 아바타 → Link /profile 연결
```

---

## Task 1: app/api/profile/route.js 구현

**Files:**
- Create: `app/api/profile/route.js`

- [ ] **Step 1: route.js 생성**

`/Users/inhwa/todaypick/app/api/profile/route.js`를 아래 내용으로 생성:

```js
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../lib/auth'
import { createAdminClient } from '../../../lib/supabase'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = createAdminClient()
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('taste_profile, shorts_taste_profile')
    .eq('id', session.user.id)
    .single()

  return Response.json({
    taste_profile: user?.taste_profile || null,
    shorts_taste_profile: user?.shorts_taste_profile || null,
  })
}
```

- [ ] **Step 2: 비인증 → 401 확인**

```bash
cd /Users/inhwa/todaypick && npm run dev -- -p 3020 > /tmp/nextjs.log 2>&1 &
echo $! > /tmp/nextjs.pid
sleep 10
grep -E "Ready|error" /tmp/nextjs.log | head -5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3020/api/profile
```

Expected: `Ready in` + `401`

- [ ] **Step 3: 서버 종료 + 커밋**

```bash
kill $(cat /tmp/nextjs.pid) 2>/dev/null || pkill -f "next dev" || true
cd /Users/inhwa/todaypick && \
  git add app/api/profile/route.js && \
  git commit -m "feat: STEP 11 - profile GET API"
```

---

## Task 2: app/today/page.jsx — 아바타 Link 연결

**Files:**
- Modify: `app/today/page.jsx`

- [ ] **Step 1: Link import 추가**

`/Users/inhwa/todaypick/app/today/page.jsx` 3번째 줄 이후에 Link import 추가.

old_string:
```
import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
```

new_string:
```
import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
```

- [ ] **Step 2: 아바타 div를 Link로 래핑**

old_string:
```jsx
        <div
          aria-label={session?.user?.name || '사용자'}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            backgroundColor: '#23252a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 600,
            color: '#8a8f98',
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
```

new_string:
```jsx
        <Link href="/profile" style={{ textDecoration: 'none' }}>
          <div
            aria-label={session?.user?.name || '사용자'}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              backgroundColor: '#23252a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 600,
              color: '#8a8f98',
              flexShrink: 0,
            }}
          >
            {initial}
          </div>
        </Link>
```

- [ ] **Step 3: 서버 시작 확인**

```bash
cd /Users/inhwa/todaypick && npm run dev -- -p 3020 > /tmp/nextjs.log 2>&1 &
echo $! > /tmp/nextjs.pid
sleep 10
grep -E "Ready|Error" /tmp/nextjs.log | head -5
```

Expected: `Ready in` 메시지

- [ ] **Step 4: 서버 종료 + 커밋**

```bash
kill $(cat /tmp/nextjs.pid) 2>/dev/null || pkill -f "next dev" || true
cd /Users/inhwa/todaypick && \
  git add app/today/page.jsx && \
  git commit -m "feat: STEP 11 - today 아바타 /profile 링크 연결"
```

---

## Task 3: app/profile/page.jsx 구현

**Files:**
- Create: `app/profile/page.jsx`

- [ ] **Step 1: page.jsx 생성**

`/Users/inhwa/todaypick/app/profile/page.jsx`를 아래 내용으로 생성:

```jsx
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
          ←
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
```

- [ ] **Step 2: 서버 시작 확인**

```bash
cd /Users/inhwa/todaypick && npm run dev -- -p 3020 > /tmp/nextjs.log 2>&1 &
echo $! > /tmp/nextjs.pid
sleep 10
grep -E "Ready|Error|SyntaxError" /tmp/nextjs.log | head -10
```

Expected: `Ready in` 메시지 (에러 없음)

- [ ] **Step 3: 서버 종료 + 커밋**

```bash
kill $(cat /tmp/nextjs.pid) 2>/dev/null || pkill -f "next dev" || true
cd /Users/inhwa/todaypick && \
  git add app/profile/page.jsx && \
  git commit -m "feat: STEP 11 - /profile 설정 페이지 UI"
```

---

## STEP 11 완료 기준

- [ ] `app/api/profile/route.js` 구현, 비인증 → 401
- [ ] `app/today/page.jsx` 아바타 → /profile Link 연결
- [ ] `app/profile/page.jsx` 구현 — 취향 프로파일 카드(막대 바 진입 애니메이션+키워드 칩), 쇼츠 취향 재설문, 로그아웃
- [ ] 서버 에러 없이 시작

---

## 다음 단계: STEP 12

랜딩 페이지 (`app/page.jsx`) — 비로그인 유저 진입점, Google 로그인 버튼, `pages.signIn: '/'` 복원
