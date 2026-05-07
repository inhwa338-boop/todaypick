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
