export function scoreVideo(video, tasteProfile) {
  const categoryWeights = tasteProfile?.category_weights || {}
  const searchKeywords = tasteProfile?.search_keywords || []

  const now = new Date()
  const publishedAt = video.published_at ? new Date(video.published_at) : null
  const daysSince = publishedAt
    ? Math.max((now - publishedAt) / (1000 * 60 * 60 * 24), 1)
    : 365

  let score = 0

  // 취향 일치도 25점
  score += Math.min((categoryWeights[video.category] || 0) * 25, 25)

  // 조회수 15점
  score += Math.min((video.view_count || 0) / 1_000_000, 1) * 15

  // 바이럴 속도 15점
  score += Math.min((video.view_count || 0) / daysSince / 100_000, 1) * 15

  // 댓글율 15점 (평균 0.5%)
  const commentRate = (video.comment_count || 0) / Math.max(video.view_count || 1, 1)
  score += Math.min(commentRate / 0.005, 1) * 15

  // 좋아요율 10점 (평균 5%)
  const likeRate = (video.like_count || 0) / Math.max(video.view_count || 1, 1)
  score += Math.min(likeRate / 0.05, 1) * 10

  // 신선도 10점
  if (daysSince <= 7) score += 10
  else if (daysSince <= 30) score += 7
  else if (daysSince <= 90) score += 3

  // 키워드 일치 10점
  const titleAndTags = [
    (video.title || '').toLowerCase(),
    ...(video.tags || []).map((t) => t.toLowerCase()),
  ].join(' ')
  const matchCount = searchKeywords.filter((kw) =>
    titleAndTags.includes(kw.toLowerCase())
  ).length
  score += Math.min(matchCount / 3, 1) * 10

  return Math.round(score)
}

export function scoreShorts(video, tasteProfile, shortsTasteProfile) {
  const categoryWeights = tasteProfile?.category_weights || {}
  const shortCategories = shortsTasteProfile?.categories || []

  const now = new Date()
  const publishedAt = video.published_at ? new Date(video.published_at) : null
  const daysSince = publishedAt
    ? Math.max((now - publishedAt) / (1000 * 60 * 60 * 24), 1)
    : 365

  let score = 0

  // 조회수 20점
  score += Math.min((video.view_count || 0) / 5_000_000, 1) * 20

  // 바이럴 속도 20점
  score += Math.min((video.view_count || 0) / daysSince / 500_000, 1) * 20

  // 취향 일치도 15점
  score += Math.min((categoryWeights[video.category] || 0) * 15, 15)

  // 댓글율 15점 (쇼츠 평균 0.1%)
  const commentRate = (video.comment_count || 0) / Math.max(video.view_count || 1, 1)
  score += Math.min(commentRate / 0.001, 1) * 15

  // 좋아요율 10점 (쇼츠 평균 2%)
  const likeRate = (video.like_count || 0) / Math.max(video.view_count || 1, 1)
  score += Math.min(likeRate / 0.02, 1) * 10

  // 신선도 10점
  if (daysSince <= 7) score += 10
  else if (daysSince <= 30) score += 7
  else if (daysSince <= 90) score += 3

  // 분위기 일치 10점
  if (shortCategories.includes(video.category)) score += 10

  return Math.round(score)
}
