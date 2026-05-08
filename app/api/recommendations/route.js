import { getServerSession } from 'next-auth'
import { authOptions } from '../../../lib/auth'
import { createAdminClient } from '../../../lib/supabase'
import { scoreVideo, scoreShorts } from '../../../lib/scoring'
import { generateRecommendations } from '../../../lib/gemini'
import { passesPoolQualityFilter, applyDiversityQuotaToPool } from '../../../lib/recommendation-engine'

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
  // 1. 세션 인증
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const supabaseAdmin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  // 2. last_active_at 업데이트 (새벽 배치 대상 판단용)
  await supabaseAdmin
    .from('users')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', userId)

  // 3. 오늘 캐시 체크
  const { data: cachedRecs } = await supabaseAdmin
    .from('user_recommendations')
    .select('*')
    .eq('user_id', userId)
    .eq('recommended_date', today)
    .eq('is_dismissed', false)
    .order('batch_index')

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

  // 4b. 캐시 미스 → 실시간 생성
  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('taste_profile, shorts_taste_profile')
    .eq('id', userId)
    .single()

  if (!userRow?.taste_profile) {
    return Response.json({ error: 'No taste profile' }, { status: 400 })
  }

  const { taste_profile, shorts_taste_profile } = userRow

  // video_pool 오늘 데이터 로드
  const { data: pool } = await supabaseAdmin
    .from('video_pool')
    .select('*')
    .eq('collected_date', today)

  if (!pool?.length) {
    return Response.json({ error: 'No video pool for today' }, { status: 404 })
  }

  const videoPool = pool.filter((v) => v.type === 'video')
  const shortsPool = pool.filter((v) => v.type === 'shorts')
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // 구독 채널 Set
  const { data: subs } = await supabaseAdmin
    .from('user_subscriptions')
    .select('channel_id')
    .eq('user_id', userId)
  const subscribedChannels = new Set((subs || []).map((s) => s.channel_id))

  // 최근 7일 추천된 영상 Set
  const { data: recentRecs } = await supabaseAdmin
    .from('user_recommendations')
    .select('video_id')
    .eq('user_id', userId)
    .gte('created_at', sevenDaysAgo)
  const recommendedVideos = new Set((recentRecs || []).map((r) => r.video_id))

  // 필터: 미구독 채널 + 미추천 영상 + 품질 필터
  const filteredVideos = videoPool.filter(
    (v) => !subscribedChannels.has(v.channel_id) && !recommendedVideos.has(v.video_id) && passesPoolQualityFilter(v)
  )
  const filteredShorts = shortsPool.filter(
    (v) => !subscribedChannels.has(v.channel_id) && !recommendedVideos.has(v.video_id) && passesPoolQualityFilter(v)
  )

  // 점수 계산 + 정렬
  const scoredVideos = filteredVideos
    .map((v) => ({ ...v, personal_score: scoreVideo(v, taste_profile) }))
    .sort((a, b) => b.personal_score - a.personal_score)

  const scoredShorts = filteredShorts
    .map((v) => ({ ...v, personal_score: scoreShorts(v, taste_profile, shorts_taste_profile) }))
    .sort((a, b) => b.personal_score - a.personal_score)

  // 다양성 쿼터 적용 후 후보 추출
  const topVideos = applyDiversityQuotaToPool(scoredVideos, 45, taste_profile)
  const topShorts = applyDiversityQuotaToPool(scoredShorts, 75, shorts_taste_profile || taste_profile)

  // 대표 구독 채널 (Gemini 프롬프트용)
  const { data: subDetails } = await supabaseAdmin
    .from('user_subscriptions')
    .select('channel_title')
    .eq('user_id', userId)
    .limit(10)
  const topSubscriptions = (subDetails || []).map((s) => s.channel_title).join(', ')

  // Gemini 1회 호출 + INSERT (실패 시 500)
  let rows = []
  const generatedAt = new Date().toISOString()
  try {
    const geminiResult = await generateRecommendations(
      { videos: topVideos, shorts: topShorts },
      taste_profile,
      topSubscriptions
    )

    ;(geminiResult.videos || []).slice(0, 30).forEach((item, idx) => {
      const video = topVideos.find((v) => v.video_id === item.video_id)
      if (!video) return
      rows.push({
        user_id: userId,
        video_id: item.video_id,
        type: 'video',
        personal_score: video.personal_score,
        recommendation_reason: item.recommendation_reason,
        hook_message: item.hook_message,
        vibe_tag: item.vibe_tag,
        recommended_date: today,
        batch_index: Math.floor(idx / 10),
      })
    })

    ;(geminiResult.shorts || []).slice(0, 50).forEach((item, idx) => {
      const video = topShorts.find((v) => v.video_id === item.video_id)
      if (!video) return
      rows.push({
        user_id: userId,
        video_id: item.video_id,
        type: 'shorts',
        personal_score: video.personal_score,
        recommendation_reason: item.recommendation_reason,
        hook_message: item.hook_message,
        vibe_tag: item.vibe_tag,
        recommended_date: today,
        batch_index: Math.floor(idx / 10),
      })
    })

    if (rows.length > 0) {
      await supabaseAdmin.from('user_recommendations').insert(rows)
    }
  } catch (err) {
    console.error('Recommendation generation failed:', err.message)
    return Response.json({ error: 'Failed to generate recommendations' }, { status: 500 })
  }

  const enriched = await enrichWithMetadata(rows, supabaseAdmin)
  return Response.json({
    cached: false,
    videos: enriched.filter((r) => r.type === 'video'),
    shorts: enriched.filter((r) => r.type === 'shorts'),
    generated_at: generatedAt,
  })
}
