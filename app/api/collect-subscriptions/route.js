import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '../../../lib/auth'
import { createAdminClient } from '../../../lib/supabase'
import { getSubscriptions, getChannelDetails } from '../../../lib/youtube'
import { generateTasteProfile } from '../../../lib/gemini'

export async function POST(request) {
  // 1. 세션 인증 확인
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const supabaseAdmin = createAdminClient()

  // 2. 중복 체크 (최초 1회만 수집)
  const { count } = await supabaseAdmin
    .from('user_subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (count > 0) {
    return Response.json({ cached: true, count })
  }

  // 3. JWT에서 accessToken 추출
  const token = await getToken({ req: request })
  const accessToken = token?.accessToken

  if (!accessToken) {
    return Response.json({ error: 'No access token' }, { status: 401 })
  }

  // 4. YouTube 구독 수집
  const rawSubscriptions = await getSubscriptions(accessToken)

  // 5. 채널 상세 조회 (50개 배치)
  const channelIds = rawSubscriptions.map((s) => s.channel_id)
  const channelDetails = await getChannelDetails(channelIds)

  const detailMap = {}
  for (const detail of channelDetails) {
    detailMap[detail.channel_id] = detail
  }

  const subscriptions = rawSubscriptions.map((sub) => ({
    user_id: userId,
    channel_id: sub.channel_id,
    channel_title: detailMap[sub.channel_id]?.channel_title || sub.channel_title,
    channel_thumbnail: detailMap[sub.channel_id]?.channel_thumbnail || sub.channel_thumbnail,
    subscriber_count: detailMap[sub.channel_id]?.subscriber_count || 0,
    category: detailMap[sub.channel_id]?.category || '기타',
    keywords: detailMap[sub.channel_id]?.keywords || [],
  }))

  // 6. user_subscriptions 저장
  await supabaseAdmin.from('user_subscriptions').insert(subscriptions)

  // 7. Gemini 취향 프로파일 생성
  const tasteProfile = await generateTasteProfile(subscriptions)

  // 8. users 테이블 taste_profile 업데이트
  await supabaseAdmin
    .from('users')
    .update({ taste_profile: tasteProfile })
    .eq('id', userId)

  return Response.json({ success: true, count: subscriptions.length })
}
