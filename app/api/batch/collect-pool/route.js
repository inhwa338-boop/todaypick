import { google } from 'googleapis'
import { createAdminClient } from '../../../../lib/supabase'

const CATEGORIES = [
  '요리/자취', 'IT/개발', '여행/국내', '운동/헬스', '뷰티/패션',
  '게임', '음악', '영화/드라마', '독서/공부', '재테크',
  '반려동물', '인테리어', '자동차', '스포츠', '코미디/예능',
  '뉴스/시사', '육아', '캠핑/아웃도어', '패션/스타일', '과학/지식',
]

function parseDurationSec(isoDuration) {
  const match = isoDuration?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  return (parseInt(match[1] || '0') * 3600) +
         (parseInt(match[2] || '0') * 60) +
         parseInt(match[3] || '0')
}

function isPortraitThumbnail(thumbnails) {
  const thumb = thumbnails?.maxres || thumbnails?.high || thumbnails?.medium
  if (!thumb?.height || !thumb?.width) return false
  return thumb.height > thumb.width
}

export async function GET(request) {
  // 1. CRON_SECRET 검증
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const youtube = google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY })
  const supabaseAdmin = createAdminClient()

  const videoIds = new Set()
  const shortIds = new Set()
  const categoryMap = {}

  // 2. 20개 카테고리 순차 처리
  for (const category of CATEGORIES) {
    // 일반 영상 (medium: 4~20분)
    const videoRes = await youtube.search.list({
      part: ['id'],
      type: ['video'],
      q: category,
      videoDuration: 'medium',
      order: 'viewCount',
      maxResults: 15,
      regionCode: 'KR',
      relevanceLanguage: 'ko',
    })
    for (const item of videoRes.data.items || []) {
      const id = item.id.videoId
      videoIds.add(id)
      if (!categoryMap[id]) categoryMap[id] = category
    }

    // 쇼츠 (short: 4분 미만)
    const shortsRes = await youtube.search.list({
      part: ['id'],
      type: ['video'],
      q: category,
      videoDuration: 'short',
      order: 'viewCount',
      maxResults: 25,
      regionCode: 'KR',
      relevanceLanguage: 'ko',
    })
    for (const item of shortsRes.data.items || []) {
      const id = item.id.videoId
      videoIds.add(id)
      shortIds.add(id)
      if (!categoryMap[id]) categoryMap[id] = category
    }
  }

  // 3. videos.list 배치 조회 (50개씩)
  const allIds = [...videoIds]
  const videoDetails = []

  for (let i = 0; i < allIds.length; i += 50) {
    const batch = allIds.slice(i, i + 50)
    const res = await youtube.videos.list({
      part: ['snippet', 'statistics', 'contentDetails'],
      id: batch,
    })
    videoDetails.push(...(res.data.items || []))
  }

  // 4. 쇼츠 판별 (3중 조건 중 2개 이상 → shorts)
  const poolData = videoDetails.map((item) => {
    const durationSec = parseDurationSec(item.contentDetails?.duration)
    const isShortDuration = durationSec > 0 && durationSec <= 180
    const isShortSearch = shortIds.has(item.id)
    const isPortrait = isPortraitThumbnail(item.snippet?.thumbnails)

    const shortScore = [isShortDuration, isShortSearch, isPortrait].filter(Boolean).length
    const type = shortScore >= 2 ? 'shorts' : 'video'

    return {
      video_id: item.id,
      type,
      title: item.snippet?.title,
      channel_id: item.snippet?.channelId,
      channel_name: item.snippet?.channelTitle,
      thumbnail_url:
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.default?.url,
      duration_sec: durationSec,
      view_count: parseInt(item.statistics?.viewCount || '0'),
      like_count: parseInt(item.statistics?.likeCount || '0'),
      comment_count: parseInt(item.statistics?.commentCount || '0'),
      category: categoryMap[item.id] || null,
      tags: item.snippet?.tags?.slice(0, 10) || [],
      published_at: item.snippet?.publishedAt,
      raw_score: 0,
    }
  })

  // 5. video_pool upsert
  if (poolData.length > 0) {
    await supabaseAdmin
      .from('video_pool')
      .upsert(poolData, { onConflict: 'video_id,collected_date' })
  }

  const videoCount = poolData.filter((v) => v.type === 'video').length
  const shortsCount = poolData.filter((v) => v.type === 'shorts').length

  return Response.json({ success: true, videoCount, shortsCount, total: poolData.length })
}
