import { google } from 'googleapis'

export async function getSubscriptions(accessToken) {
  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({ access_token: accessToken })
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client })

  const subscriptions = []
  let pageToken = undefined

  do {
    const res = await youtube.subscriptions.list({
      part: ['snippet'],
      mine: true,
      maxResults: 50,
      pageToken,
    })

    for (const item of res.data.items || []) {
      subscriptions.push({
        channel_id: item.snippet.resourceId.channelId,
        channel_title: item.snippet.title,
        channel_thumbnail: item.snippet.thumbnails?.default?.url || null,
      })
    }

    pageToken = res.data.nextPageToken
  } while (pageToken)

  return subscriptions
}

export async function getChannelDetails(channelIds) {
  const youtube = google.youtube({
    version: 'v3',
    auth: process.env.YOUTUBE_API_KEY,
  })

  const channels = []

  for (let i = 0; i < channelIds.length; i += 50) {
    const batch = channelIds.slice(i, i + 50)
    const res = await youtube.channels.list({
      part: ['snippet', 'statistics', 'topicDetails', 'brandingSettings'],
      id: batch,
      maxResults: 50,
    })

    for (const item of res.data.items || []) {
      const topicCategories = item.topicDetails?.topicCategories || []
      channels.push({
        channel_id: item.id,
        channel_title: item.snippet?.title,
        channel_thumbnail: item.snippet?.thumbnails?.default?.url || null,
        subscriber_count: parseInt(item.statistics?.subscriberCount || '0'),
        category: extractCategory(topicCategories),
        keywords: parseKeywords(item.brandingSettings?.channel?.keywords),
      })
    }
  }

  return channels
}

function extractCategory(topicCategories) {
  const categoryMap = {
    Music: '음악',
    Gaming: '게임',
    Sports: '스포츠',
    Entertainment: '코미디/예능',
    Lifestyle: '뷰티/패션',
    Society: '뉴스/시사',
    Technology: 'IT/개발',
    Food: '요리/자취',
    Travel: '여행/국내',
  }
  for (const url of topicCategories) {
    for (const [key, value] of Object.entries(categoryMap)) {
      if (url.includes(key)) return value
    }
  }
  return '기타'
}

function parseKeywords(raw) {
  if (!raw) return []
  return raw.split(/\s+/).filter(Boolean).slice(0, 20)
}
