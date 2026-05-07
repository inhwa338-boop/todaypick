# STEP 10: /today 메인 페이지 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 유저가 오늘의 추천 영상/쇼츠를 피드 형태로 확인하고 인라인으로 재생할 수 있는 /today 메인 페이지를 구현한다.

**Architecture:** Client Component 단일 파일(`app/today/page.jsx`)이 `/api/recommendations` GET을 호출해 영상/쇼츠 데이터를 받고, 탭 전환·10개씩 더보기·카드 클릭 YouTube iframe 인라인 재생을 useState로 관리한다. recommendations API는 기존 user_recommendations 행에 video_pool 메타데이터(title, thumbnail_url, channel_name, view_count)를 병합해 반환하도록 수정한다.

**Tech Stack:** next-auth/react (useSession), React useState/useEffect, YouTube iframe embed API, Tailwind CSS (globals.css shimmer), 포트 3020

---

## 파일 구조

```
app/globals.css                        # Modify: @keyframes shimmer 추가
app/api/recommendations/route.js       # Modify: enrichWithMetadata 함수 + 두 반환 경로 적용
app/today/page.jsx                     # Create: 추천 피드 Client Component
```

---

## Task 1: globals.css — shimmer 애니메이션 추가

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: shimmer keyframes 추가**

`/Users/inhwa/todaypick/app/globals.css` 파일 맨 아래에 아래 내용 추가:

```css
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
```

- [ ] **Step 2: 커밋**

```bash
cd /Users/inhwa/todaypick && \
  git add app/globals.css && \
  git commit -m "feat: STEP 10 - shimmer 애니메이션 추가"
```

---

## Task 2: app/api/recommendations/route.js 수정

**Files:**
- Modify: `app/api/recommendations/route.js`

캐시 히트·미스 양쪽 반환 경로에 video_pool 메타데이터를 병합한다. `enrichWithMetadata` 헬퍼를 추가하고 두 곳의 `return Response.json(...)` 을 수정한다.

- [ ] **Step 1: enrichWithMetadata 함수 삽입**

`/Users/inhwa/todaypick/app/api/recommendations/route.js` 에서 `export async function GET()` 바로 앞에 아래 함수를 삽입한다 (Edit 도구 사용):

old_string:
```
export async function GET() {
```

new_string:
```
async function enrichWithMetadata(recs, supabaseAdmin) {
  if (!recs || !recs.length) return recs || []
  const today = new Date().toISOString().split('T')[0]
  const ids = recs.map((r) => r.video_id)
  const { data: pool } = await supabaseAdmin
    .from('video_pool')
    .select('video_id, title, channel_name, thumbnail_url, duration_sec, view_count')
    .in('video_id', ids)
    .eq('collected_date', today)
  const meta = Object.fromEntries((pool || []).map((v) => [v.video_id, v]))
  return recs.map((r) => ({ ...r, ...meta[r.video_id] }))
}

export async function GET() {
```

- [ ] **Step 2: 캐시 히트 반환 경로 수정**

old_string:
```
  // 4a. 캐시 히트 → 즉시 반환
  if (cachedRecs?.length > 0) {
    return Response.json({
      cached: true,
      videos: cachedRecs.filter((r) => r.type === 'video'),
      shorts: cachedRecs.filter((r) => r.type === 'shorts'),
      generated_at: cachedRecs[0].created_at,
    })
  }
```

new_string:
```
  // 4a. 캐시 히트 → 즉시 반환
  if (cachedRecs?.length > 0) {
    const enriched = await enrichWithMetadata(cachedRecs, supabaseAdmin)
    return Response.json({
      cached: true,
      videos: enriched.filter((r) => r.type === 'video'),
      shorts: enriched.filter((r) => r.type === 'shorts'),
      generated_at: cachedRecs[0].created_at,
    })
  }
```

- [ ] **Step 3: 캐시 미스 반환 경로 수정**

old_string:
```
  return Response.json({
    cached: false,
    videos: rows.filter((r) => r.type === 'video'),
    shorts: rows.filter((r) => r.type === 'shorts'),
    generated_at: generatedAt,
  })
```

new_string:
```
  const enriched = await enrichWithMetadata(rows, supabaseAdmin)
  return Response.json({
    cached: false,
    videos: enriched.filter((r) => r.type === 'video'),
    shorts: enriched.filter((r) => r.type === 'shorts'),
    generated_at: generatedAt,
  })
```

- [ ] **Step 4: 서버 시작 + 401 확인**

```bash
cd /Users/inhwa/todaypick && npm run dev -- -p 3020 > /tmp/nextjs.log 2>&1 &
echo $! > /tmp/nextjs.pid
sleep 10
grep -E "Ready|error" /tmp/nextjs.log | head -5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3020/api/recommendations
```

Expected: `Ready in` 메시지 + `401`

- [ ] **Step 5: 서버 종료 + 커밋**

```bash
kill $(cat /tmp/nextjs.pid) 2>/dev/null || pkill -f "next dev" || true
cd /Users/inhwa/todaypick && \
  git add app/api/recommendations/route.js && \
  git commit -m "feat: STEP 10 - recommendations API video_pool 메타데이터 병합"
```

---

## Task 3: app/today/page.jsx 구현

**Files:**
- Create: `app/today/page.jsx`

- [ ] **Step 1: page.jsx 생성**

`/Users/inhwa/todaypick/app/today/page.jsx`를 아래 내용으로 생성:

```jsx
'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

function formatViews(n) {
  if (!n) return ''
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`
  if (n >= 10000) return `${Math.floor(n / 10000)}만`
  return n.toLocaleString()
}

function formatDuration(sec) {
  if (!sec) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

const skelLine = (width) => ({
  height: '10px',
  borderRadius: '4px',
  width,
  background: 'linear-gradient(90deg, #161718 25%, #23252a 50%, #161718 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.4s infinite',
})

function SkeletonCard() {
  return (
    <div
      style={{
        backgroundColor: '#0f1011',
        borderRadius: '6px',
        overflow: 'hidden',
        border: '1px solid #23252a',
      }}
    >
      <div
        style={{
          paddingTop: '56.25%',
          background: 'linear-gradient(90deg, #161718 25%, #23252a 50%, #161718 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s infinite',
        }}
      />
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={skelLine('85%')} />
        <div style={skelLine('55%')} />
        <div style={skelLine('70%')} />
      </div>
    </div>
  )
}

function VideoCard({ item, isPlaying, onPlay, onClose }) {
  return (
    <div
      style={{
        backgroundColor: '#0f1011',
        borderRadius: '6px',
        overflow: 'hidden',
        border: isPlaying ? '1px solid #e4f222' : '1px solid #23252a',
        boxShadow: 'rgba(0,0,0,0.4) 0px 2px 4px 0px',
      }}
    >
      {isPlaying ? (
        <div style={{ position: 'relative', paddingTop: '56.25%', background: '#000' }}>
          <iframe
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 'none',
            }}
            src={`https://www.youtube.com/embed/${item.video_id}?autoplay=1`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <button
          onClick={onPlay}
          style={{
            display: 'block',
            width: '100%',
            padding: 0,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              position: 'relative',
              paddingTop: '56.25%',
              background: '#161718',
              overflow: 'hidden',
            }}
          >
            {item.thumbnail_url && (
              <img
                src={item.thumbnail_url}
                alt={item.title || ''}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            )}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.15)',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.65)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ color: '#f7f8f8', fontSize: '16px', marginLeft: '3px' }}>▶</span>
              </div>
            </div>
            {item.duration_sec > 0 && (
              <span
                style={{
                  position: 'absolute',
                  bottom: 6,
                  right: 8,
                  background: 'rgba(0,0,0,0.8)',
                  color: '#f7f8f8',
                  fontSize: '11px',
                  padding: '1px 5px',
                  borderRadius: '2px',
                  letterSpacing: '0.02em',
                }}
              >
                {formatDuration(item.duration_sec)}
              </span>
            )}
          </div>
        </button>
      )}
      <div style={{ padding: '10px 12px' }}>
        <p
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#f7f8f8',
            margin: '0 0 4px',
            lineHeight: 1.35,
            letterSpacing: '-0.13px',
          }}
        >
          {item.title || item.video_id}
        </p>
        <p
          style={{
            fontSize: '12px',
            color: '#8a8f98',
            margin: '0 0 6px',
            letterSpacing: '-0.13px',
          }}
        >
          {item.channel_name}
          {item.view_count ? ` · 조회 ${formatViews(item.view_count)}` : ''}
        </p>
        {item.hook_message && (
          <p
            style={{
              fontSize: '13px',
              color: '#e4f222',
              margin: '0 0 8px',
              letterSpacing: '-0.13px',
              lineHeight: 1.4,
            }}
          >
            {item.hook_message}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {item.vibe_tag ? (
            <span
              style={{
                display: 'inline-block',
                background: '#23252a',
                color: '#8a8f98',
                borderRadius: '2px',
                fontSize: '11px',
                padding: '2px 7px',
                letterSpacing: '-0.1px',
              }}
            >
              #{item.vibe_tag}
            </span>
          ) : (
            <span />
          )}
          {isPlaying && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#62666d',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '0 4px',
                letterSpacing: '-0.1px',
              }}
            >
              닫기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TodayPage() {
  const { data: session } = useSession()
  const [videos, setVideos] = useState([])
  const [shorts, setShorts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('video')
  const [videoPage, setVideoPage] = useState(1)
  const [shortsPage, setShortsPage] = useState(1)
  const [playingId, setPlayingId] = useState(null)

  function loadData() {
    setLoading(true)
    setError(null)
    fetch('/api/recommendations')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setVideos(data.videos || [])
        setShorts(data.shorts || [])
        setLoading(false)
      })
      .catch(() => {
        setError('추천을 불러오지 못했어요. 잠시 후 다시 시도해주세요.')
        setLoading(false)
      })
  }

  useEffect(() => {
    loadData()
  }, [])

  function handleTabChange(tab) {
    setActiveTab(tab)
    setPlayingId(null)
  }

  function handlePlay(videoId) {
    setPlayingId((prev) => (prev === videoId ? null : videoId))
  }

  const currentList = activeTab === 'video' ? videos : shorts
  const currentPage = activeTab === 'video' ? videoPage : shortsPage
  const setCurrentPage = activeTab === 'video' ? setVideoPage : setShortsPage
  const visibleItems = currentList.slice(0, currentPage * 10)
  const remaining = currentList.length - visibleItems.length

  const initial = session?.user?.name?.[0]?.toUpperCase() || '?'

  return (
    <div
      style={{
        backgroundColor: '#08090a',
        minHeight: '100vh',
        fontFamily: 'var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif',
        color: '#f7f8f8',
        maxWidth: '480px',
        margin: '0 auto',
      }}
    >
      {/* 헤더 */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          backgroundColor: '#08090a',
          borderBottom: '1px solid #23252a',
        }}
      >
        <span
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: '#e4f222',
            letterSpacing: '-0.13px',
          }}
        >
          오늘은 이거다
        </span>
        <div
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
      </header>

      {/* 탭 바 */}
      <div
        style={{
          position: 'sticky',
          top: '53px',
          zIndex: 9,
          display: 'flex',
          backgroundColor: '#08090a',
          borderBottom: '1px solid #23252a',
        }}
      >
        {['video', 'shorts'].map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            style={{
              flex: 1,
              padding: '10px 0',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #e4f222' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? '#e4f222' : '#8a8f98',
              letterSpacing: '-0.13px',
              transition: 'color 0.15s',
            }}
          >
            {tab === 'video' ? '영상' : '쇼츠'}
          </button>
        ))}
      </div>

      {/* 피드 */}
      <main style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loading && Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}

        {!loading && error && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <p
              style={{
                fontSize: '14px',
                color: '#8a8f98',
                marginBottom: '16px',
                letterSpacing: '-0.13px',
              }}
            >
              {error}
            </p>
            <button
              onClick={loadData}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                border: '1px solid #23252a',
                background: 'transparent',
                color: '#f7f8f8',
                fontSize: '13px',
                cursor: 'pointer',
                letterSpacing: '-0.13px',
              }}
            >
              다시 시도
            </button>
          </div>
        )}

        {!loading && !error && currentList.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <p style={{ fontSize: '14px', color: '#8a8f98', letterSpacing: '-0.13px' }}>
              아직 오늘의 추천이 준비 중이에요 🌙
            </p>
          </div>
        )}

        {!loading &&
          !error &&
          visibleItems.map((item) => (
            <VideoCard
              key={item.video_id}
              item={item}
              isPlaying={playingId === item.video_id}
              onPlay={() => handlePlay(item.video_id)}
              onClose={() => setPlayingId(null)}
            />
          ))}

        {!loading && !error && remaining > 0 && (
          <button
            onClick={() => setCurrentPage((p) => p + 1)}
            style={{
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid #23252a',
              background: 'transparent',
              color: '#8a8f98',
              fontSize: '13px',
              cursor: 'pointer',
              letterSpacing: '-0.13px',
              width: '100%',
            }}
          >
            더 보기 ({remaining}개 남음)
          </button>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: 서버 시작 확인**

```bash
cd /Users/inhwa/todaypick && npm run dev -- -p 3020 > /tmp/nextjs.log 2>&1 &
echo $! > /tmp/nextjs.pid
sleep 10
grep -E "Ready|Error|error" /tmp/nextjs.log | head -10
```

Expected: `Ready in` 메시지 (에러 없음)

- [ ] **Step 3: 서버 종료**

```bash
kill $(cat /tmp/nextjs.pid) 2>/dev/null || pkill -f "next dev" || true
```

- [ ] **Step 4: 커밋**

```bash
cd /Users/inhwa/todaypick && \
  git add app/today/page.jsx && \
  git commit -m "feat: STEP 10 - /today 메인 페이지 추천 피드 UI"
```

---

## STEP 10 완료 기준

- [ ] `app/globals.css` shimmer 애니메이션 추가
- [ ] `app/api/recommendations/route.js` enrichWithMetadata 적용, 비인증 → 401
- [ ] `app/today/page.jsx` 구현 — 스켈레톤, 카드, 탭, 더보기, iframe 재생
- [ ] 서버(`npm run dev -- -p 3020`) 에러 없이 시작
- [ ] 브라우저에서 로그인 후 /today 접속 → 피드 확인

---

## 다음 단계: STEP 11

/profile 설정 페이지 (취향 프로파일 표시, 쇼츠 취향 재설문, 계정 관리)
