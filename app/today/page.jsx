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
