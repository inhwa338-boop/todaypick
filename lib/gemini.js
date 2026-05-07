import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

export async function generateTasteProfile(subscriptions) {
  // 카테고리 가중치 계산
  const rawWeights = {}
  for (const sub of subscriptions) {
    const cat = sub.category || '기타'
    rawWeights[cat] = (rawWeights[cat] || 0) + 1
  }
  const total = Object.values(rawWeights).reduce((a, b) => a + b, 0)
  const categoryWeights = {}
  for (const [cat, count] of Object.entries(rawWeights)) {
    categoryWeights[cat] = Math.round((count / total) * 100) / 100
  }

  const channelInfo = subscriptions
    .slice(0, 100)
    .map((s) => `${s.channel_title} (${s.category}, 구독자: ${s.subscriber_count})`)
    .join('\n')

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `다음은 유저가 구독하는 YouTube 채널 목록이야.
이 채널들을 분석해서 유저의 콘텐츠 취향을 파악해줘.

[구독 채널 목록]
${channelInfo}

아래 JSON 형식으로만 응답해. 설명 없이 JSON만.
{
  "primary_interests": ["주요 관심사 3개"],
  "secondary_interests": ["부가 관심사 2개"],
  "content_style": ["콘텐츠 스타일 2-3개 (예: vlog, 튜토리얼, 리뷰)"],
  "preferred_scale": "대형 또는 중형 또는 소형",
  "language_preference": "한국어 또는 영어 또는 혼합",
  "search_keywords": ["추천 검색 키워드 10개"]
}`

  const result = await model.generateContent(prompt)
  const text = result.response.text()

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Gemini 응답 JSON 파싱 실패')

  const geminiProfile = JSON.parse(jsonMatch[0])

  return { category_weights: categoryWeights, ...geminiProfile }
}

export async function generateRecommendations(candidates, tasteProfile, topSubscriptions) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const candidatesJson = JSON.stringify({
    videos: candidates.videos.map((v) => ({
      video_id: v.video_id,
      title: v.title,
      channel_name: v.channel_name,
      category: v.category,
      view_count: v.view_count,
      personal_score: v.personal_score,
    })),
    shorts: candidates.shorts.map((v) => ({
      video_id: v.video_id,
      title: v.title,
      channel_name: v.channel_name,
      category: v.category,
      view_count: v.view_count,
      personal_score: v.personal_score,
    })),
  })

  const prompt = `너는 유튜브 콘텐츠 큐레이터야.
유저의 취향과 후보 영상 목록을 분석해서
일반 영상 30개, 쇼츠 50개를 최종 선별하고 각각 추천 문구를 작성해줘.

[유저 취향]
주요 관심사: ${(tasteProfile?.primary_interests || []).join(', ')}
콘텐츠 스타일: ${(tasteProfile?.content_style || []).join(', ')}
대표 구독 채널: ${topSubscriptions}

[후보 영상 목록]
${candidatesJson}

[응답 형식 - JSON만, 설명 없이]
{
  "videos": [
    {
      "video_id": "영상ID",
      "recommendation_reason": "구독 채널과 연결된 구체적 추천 이유 2~3문장",
      "hook_message": "스크롤 멈추게 할 한 마디 (20자 이내)",
      "vibe_tag": "분위기 태그 (예: 🔥꿀정보, 😂웃김, 😌힐링, 🤯충격)"
    }
  ],
  "shorts": [
    {
      "video_id": "영상ID",
      "recommendation_reason": "취향 기반 추천 이유 1문장",
      "hook_message": "15자 이내 임팩트 문구",
      "vibe_tag": "분위기 태그"
    }
  ]
}

추천 이유는 반드시 유저의 실제 구독 채널을 언급하며 작성해.
"이 채널도 좋아하실 것 같아요" 같은 뻔한 말은 절대 쓰지 마.`

  const result = await model.generateContent(prompt)
  const text = result.response.text()

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Gemini recommendations 응답 JSON 파싱 실패')

  return JSON.parse(jsonMatch[0])
}
