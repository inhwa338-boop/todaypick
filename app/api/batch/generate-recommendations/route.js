import { createAdminClient } from '../../../../lib/supabase'
import { scoreVideo, scoreShorts } from '../../../../lib/scoring'
import { generateRecommendations } from '../../../../lib/gemini'

const MAX_USERS = 240

export async function GET(request) {
  // 1. CRON_SECRET 검증
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // 2. 활성 유저 조회 (최근 7일, 최대 240명, taste_profile 있는 유저만)
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, taste_profile, shorts_taste_profile')
    .not('taste_profile', 'is', null)
    .gte('last_active_at', sevenDaysAgo)
    .limit(MAX_USERS)

  if (!users?.length) {
    return Response.json({ success: true, usersProcessed: 0 })
  }

  // 3. 오늘 video_pool 전체 로드
  const { data: pool } = await supabaseAdmin
    .from('video_pool')
    .select('*')
    .eq('collected_date', today)

  if (!pool?.length) {
    return Response.json({ success: false, error: 'No video pool for today' })
  }

  const videoPool = pool.filter((v) => v.type === 'video')
  const shortsPool = pool.filter((v) => v.type === 'shorts')

  let usersProcessed = 0

  // 4. 유저별 순차 처리
  for (const user of users) {
    try {
      const { id: userId, taste_profile, shorts_taste_profile } = user

      // a. 구독 채널 Set
      const { data: subs } = await supabaseAdmin
        .from('user_subscriptions')
        .select('channel_id')
        .eq('user_id', userId)
      const subscribedChannels = new Set((subs || []).map((s) => s.channel_id))

      // b. 최근 7일 이미 추천된 영상 Set
      const { data: recentRecs } = await supabaseAdmin
        .from('user_recommendations')
        .select('video_id')
        .eq('user_id', userId)
        .gte('created_at', sevenDaysAgo)
      const recommendedVideos = new Set((recentRecs || []).map((r) => r.video_id))

      // c. 필터: 미구독 채널 + 미추천 영상
      const filteredVideos = videoPool.filter(
        (v) => !subscribedChannels.has(v.channel_id) && !recommendedVideos.has(v.video_id)
      )
      const filteredShorts = shortsPool.filter(
        (v) => !subscribedChannels.has(v.channel_id) && !recommendedVideos.has(v.video_id)
      )

      if (filteredVideos.length === 0 && filteredShorts.length === 0) continue

      // d. 개인 점수 계산 + 정렬
      const scoredVideos = filteredVideos
        .map((v) => ({ ...v, personal_score: scoreVideo(v, taste_profile) }))
        .sort((a, b) => b.personal_score - a.personal_score)

      const scoredShorts = filteredShorts
        .map((v) => ({ ...v, personal_score: scoreShorts(v, taste_profile, shorts_taste_profile) }))
        .sort((a, b) => b.personal_score - a.personal_score)

      // e. 상위 추출: 영상 45개, 쇼츠 75개
      const topVideos = scoredVideos.slice(0, 45)
      const topShorts = scoredShorts.slice(0, 75)

      // f. Gemini 1회 호출
      const { data: subDetails } = await supabaseAdmin
        .from('user_subscriptions')
        .select('channel_title')
        .eq('user_id', userId)
        .limit(10)
      const topSubscriptions = (subDetails || []).map((s) => s.channel_title).join(', ')

      const geminiResult = await generateRecommendations(
        { videos: topVideos, shorts: topShorts },
        taste_profile,
        topSubscriptions
      )

      // g. user_recommendations INSERT (batch_index: 10개씩 그룹)
      const rows = []

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

      usersProcessed++
    } catch (err) {
      console.error(`User ${user.id} processing failed:`, err.message)
    }
  }

  return Response.json({ success: true, usersProcessed })
}
