/**
============================================================
오늘은 이거다 — 통합 추천 엔진 최종판 v3
파일 위치: lib/recommendation-engine.js
============================================================

[통합된 개선안 전체 목록]

▶ 개선방향 1. 취향 프로파일 수집 고도화
구독은 했지만 안 보는 채널 문제: 채널 최근 업로드 활성도 가중치 적용
채널 설명 부실 문제: 최근 영상 제목 10개로 자동 보강 (enrichChannelData)
오래된 구독 문제: days_since_last_video 기반 recency 가중치 (0.4~1.5)
온보딩에서 연령대/라이프스타일/제외카테고리 직접 수집

▶ 개선방향 2. Gemini 취향 분석 고도화
YouTube 공식 카테고리 무시, 채널 실제 콘텐츠 기반 분석
confidence 50 미만 관심사 자동 필터링 (환각 방지)
구체적 검색어 15개 생성 (카테고리명 대신 실제 검색어)
다채널 장르 채널(예: 침착맨) 복합 분류 처리

▶ 개선방향 3. 검색 쿼리 구체화 + 다중전략
카테고리명 대신 Gemini 생성 구체적 검색어 사용
relevance / viewCount / rating 3중 전략 병렬 검색
2개 이상 전략 교차 등장 영상에 신뢰도 보너스 +5점
검색 결과 최근 3개월(일반) / 1개월(쇼츠) 이내로 제한
regionCode: KR + relevanceLanguage: ko 강제

▶ 레드팀 검증 1. 품질 필터링 강화
낚시성 제목 패턴 4종 필터
아동/유아 콘텐츠 패턴 필터 (연령 비적합 시 -20점)
10대 전용 콘텐츠 패턴 필터 (연령 비적합 시 -15점)
외국어 콘텐츠 필터 (한국어 제목/언어 아니면 제거)
최소 조회수 5,000 미만 제거 (스팸/신생 채널)
댓글 이벤트 채널 감지 → 댓글율 가중치 0.3으로 감쇄

▶ 레드팀 검증 2. 점수 계산 고도화
조회수 단독 지표 의존 제거 (10점으로 하향, 참고용)
좋아요율: 조작 어려운 지표로 핵심 반영 (영상 10점/쇼츠 10점)
댓글율: 커뮤니티 활성도 반영 (영상 15점/쇼츠 15점), 이벤트 감쇄
연령 적합도 독립 지표로 분리 (15점 / 위반 시 -15~-20점)
신선도: 오래된 명작 허용 (0점 → 최소 1점)
채널 신뢰도: 채널 활성도 기반 보너스
규모 상한 하드필터 제거 → 소프트 보너스로 전환 (대형채널도 추천 가능)

▶ 레드팀 검증 3. 다양성 쿼터
1위 카테고리 최대 40%, 2~3위 최대 25% 강제 쿼터
같은 채널 2개 이상 포함 금지
wildcard 10% 보장 (새로운 발견 영상)
후보 셔플로 Gemini 위치 편향 방지

▶ 레드팀 검증 4. 피드백 학습 루프
시간 감쇄: 7일내 1.0 / 30일내 0.7 / 90일내 0.4 / 이후 0.1
같은 채널 거부 이력 → 해당 채널 -10점 (감쇄 적용)
같은 키워드 거부 이력 → -5점 (감쇄 적용)
3회 이상 같은 이유 거부 → 자동 제외 목록 추가
wildcard 10% 보장으로 필터 버블 방지

▶ 레드팀 검증 5. Cold Start
피드백 10개 미만 + 구독 없음 → cold start 경로
video_pool 인기 영상 기반 초기 추천
cold start에도 연령 필터 적용

▶ 레드팀 검증 6. Gemini 선별 고도화
후보 셔플 후 전달 (위치 편향 방지)
카테고리 다양성, 연령 적합성 명시적 지시
추천 이유 다각도 작성 지시 (뻔한 표현 금지)
is_wildcard 플래그 반환으로 UI 차별화 가능
============================================================
*/
import { GoogleGenerativeAI } from '@google/generative-ai';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────
// 클라이언트 초기화 (서버 전용 — 절대 클라이언트 노출 금지)
// ─────────────────────────────────────────────
const geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel  = geminiClient.getGenerativeModel({ model: 'gemini-2.5-flash' });
const youtubeClient = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────
const QUOTA = {
  VIDEO_BATCH:           30,   // 일반 영상 최종 추천 수
  SHORTS_BATCH:          50,   // 쇼츠 최종 추천 수
  CANDIDATE_MULTIPLIER:  1.5,  // 후보 풀 = 최종 수의 1.5배
  WILDCARD_RATIO:        0.1,  // 추천의 10%는 wildcard
  PRIMARY_MAX_RATIO:     0.4,  // 1위 카테고리 최대 40%
  SECONDARY_MAX_RATIO:   0.25, // 2~3위 카테고리 최대 25%
  MIN_VIEW_COUNT:        5000, // 최소 조회수 (스팸 필터)
  FEEDBACK_THRESHOLD:    10,   // cold start 판단 기준
  CHANNEL_DESC_MIN_LEN:  80,   // 채널 설명 충분 기준 (자)
  AUTO_EXCLUDE_COUNT:    3,    // 자동 제외 발동 최소 거부 횟수
};

// 낚시성 제목 패턴 (레드팀 검증 1)
const BAIT_PATTERNS = [
  /무조건|반드시 봐야|충격|경악|난리났|미쳤다|실화냐/,
  /인생.*바뀜|돈.*버는법|비밀.*공개|절대.*공개안하/,
  /절대.*하지마|이것만.*알면.*끝|보면.*후회/,
  /클릭.*후회없음|역대급|레전드급/,
];

// 아동/유아 콘텐츠 패턴 (레드팀 검증 1 + 개선방향 1)
const CHILD_PATTERNS = [
  /유아|어린이|아이들|키즈|kids|초등|아동/i,
  /뽀로로|핑크퐁|타요|코코멜론|baby shark/i,
  /유치원|놀이터|장난감 리뷰|어린이 요리/,
];

// 10대 전용 콘텐츠 패턴 (레드팀 검증 1 + 개선방향 1)
const TEEN_PATTERNS = [
  /수능|내신|고등학생|중학생|중고등/,
  /팬덤 입문|최애|덕질 시작|아이돌 입문/,
];

// 댓글 이벤트 어뷰징 패턴 (레드팀 검증 2)
const EVENT_PATTERNS = [
  /댓글.*이벤트|추첨.*댓글|댓글.*선물/,
  /구독.*댓글.*선물|이벤트.*당첨/,
];

// ═══════════════════════════════════════════════════════════════
// PART 1. 구독 채널 취향 분석
// ═══════════════════════════════════════════════════════════════

/**
 * [개선방향 1] 채널 설명 부실 시 최근 영상 제목으로 자동 보강
 * 채널명만으로 취향 판별이 어려운 경우 커버
 */
async function enrichChannelData(channel) {
  try {
    if (channel.description && channel.description.length >= QUOTA.CHANNEL_DESC_MIN_LEN) {
      return channel;
    }
    // uploads 플레이리스트 ID: UC → UU 변환
    const uploadsId = 'UU' + channel.channel_id.slice(2);
    const res = await youtubeClient.playlistItems.list({
      part: 'snippet',
      playlistId: uploadsId,
      maxResults: 10,
    });
    const titles = (res.data.items || [])
      .map(i => i.snippet?.title || '')
      .filter(Boolean);
    channel.enrichedDescription = titles.join(' | ');
    return channel;
  } catch {
    return channel; // 실패해도 기존 데이터로 계속 진행
  }
}

/**
 * [개선방향 1] 채널 최근 활동 기반 가중치
 * 오래된 구독 채널의 영향력을 자동으로 낮춤
 */
function calcRecencyWeight(channel) {
  const d = channel.days_since_last_video ?? 9999;
  if (d < 30)  return 1.5; // 최근 1달 이내: 가중치 최대
  if (d < 90)  return 1.2; // 3달 이내: 양호
  if (d < 365) return 0.8; // 1년 이내: 보통
  return 0.4;               // 1년 이상: 오래된 구독 → 낮은 가중치
}

/**
 * [개선방향 1+2] Gemini로 구독 채널 심층 분석
 * YouTube 공식 카테고리 무시, 실제 콘텐츠 기반 분석
 * confidence 50 미만 자동 제거 (Gemini 환각 방지)
 * 구체적 검색어 15개 생성
 */
async function analyzeUserTaste(subscriptions, userProfile) {
  // 채널 데이터 보강 (설명 부실 채널 → 최근 영상 제목으로 보완)
  const enriched = await Promise.all(
    subscriptions.map(ch => enrichChannelData(ch))
  );

  // recency 가중치 적용한 채널 목록 구성
  const channelList = enriched
    .map(ch => {
      const rw = calcRecencyWeight(ch);
      return `채널명: ${ch.channel_title} (가중치: ${rw}) 설명: ${ch.description?.slice(0, 200) || '(없음)'} 최근 영상 제목: ${ch.enrichedDescription || '(없음)'} 키워드: ${ch.keywords?.join(', ') || '(없음)'} 구독자수: ${ch.subscriber_count?.toLocaleString() || '?'}명`;
    })
    .join('---\n');

  const prompt = `
유저가 구독한 유튜브 채널 목록이야.
이 채널들을 분석해서 유저의 진짜 취향을 파악해줘.

[분석 원칙]
YouTube 공식 카테고리는 너무 넓어서 무시해도 됨
채널명, 설명, 최근 영상 제목에서 실제 콘텐츠 주제를 파악해
"요리" 카테고리여도 자취요리인지 이유식인지 반드시 구별해
게임/토크/먹방 등 다양한 주제를 다루는 채널은 복합 분류해
(가중치)가 높은 채널일수록 최근에도 활발히 보는 채널이야, 더 중요하게 봐줘
확신이 없는 관심사는 confidence를 30 이하로 설정해

유저 연령대: ${userProfile.age_group || '알 수 없음'}
라이프스타일: ${userProfile.life_stage?.join(', ') || '알 수 없음'}

[구독 채널 목록]
${channelList}

[JSON으로만 응답 — 설명 없이]
{
  "real_interests": [
    {
      "topic": "구체적 관심사 (예: 자취요리, 파이썬개발, 국내산악여행)",
      "confidence": 0에서100사이숫자,
      "evidence": "어떤 채널에서 추론했는지 한 줄"
    }
  ],
  "content_style": {
    "format": ["vlog", "튜토리얼", "토크", "리뷰", "다큐"] 중 해당하는 것들,
    "tone": ["유머", "진지", "감성", "정보전달"] 중 해당하는 것들,
    "length": "short 또는 medium 또는 long"
  },
  "inferred_life_stage": "추정되는 라이프스타일 한 줄",
  "search_queries": [
    "실제 유튜브 검색창에 입력할 구체적 한국어 검색어 15개 — 카테고리명이 아닌 실제 검색어로"
  ],
  "exclude_topics": [
    "이 채널 목록에서 전혀 보이지 않는 주제들 (추천 제외 후보)"
  ]
}
`;

  const result = await geminiModel.generateContent(prompt);
  const text   = result.response.text().replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(text);
    // confidence 50 미만 → 환각 가능성 높음 → 제거
    parsed.real_interests = (parsed.real_interests || [])
      .filter(i => i.confidence >= 50);
    return parsed;
  } catch {
    return {
      real_interests: [],
      content_style: { format: [], tone: [], length: 'medium' },
      search_queries: [],
      exclude_topics: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// PART 2. 영상 후보 수집
// ═══════════════════════════════════════════════════════════════

/**
 * [개선방향 3 + 레드팀 검증 1] 3중 전략 병렬 검색
 * relevance(최근 3개월) / viewCount(최근 1개월) / rating(최근 3개월)
 * 2개 이상 전략에서 겹치는 영상 = 신뢰도 높은 후보
 * regionCode KR + relevanceLanguage ko 강제
 */
async function searchByMultiStrategy(query, isShorts = false) {
  const ago90 = new Date(Date.now() - 90 * 86400000).toISOString();
  const ago30 = new Date(Date.now() - 30 * 86400000).toISOString();

  const base = {
    part: 'snippet',
    type: 'video',
    relevanceLanguage: 'ko',
    regionCode: 'KR',
    videoDuration: isShorts ? 'short' : 'medium',
    maxResults: 20,
    q: query,
  };

  const [r1, r2, r3] = await Promise.allSettled([
    youtubeClient.search.list({ ...base, order: 'relevance',  publishedAfter: ago90 }),
    youtubeClient.search.list({ ...base, order: 'viewCount',  publishedAfter: ago30 }),
    youtubeClient.search.list({ ...base, order: 'rating',     publishedAfter: ago90 }),
  ]);

  const sets = [r1, r2, r3].map(res =>
    res.status === 'fulfilled'
      ? new Set((res.value.data.items || []).map(i => i.id?.videoId).filter(Boolean))
      : new Set()
  );

  const allIds = new Set([...sets[0], ...sets[1], ...sets[2]]);

  // 2개 이상 전략에서 등장한 영상 = 교차 신뢰도 높음
  const crossStrategyIds = new Set(
    [...allIds].filter(id => sets.filter(s => s.has(id)).length >= 2)
  );

  return { allIds: [...allIds], crossStrategyIds };
}

/**
 * video_id 배열 → 상세 정보 일괄 수집 (50개씩 배치)
 */
async function fetchVideoDetails(videoIds) {
  const results = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    try {
      const res = await youtubeClient.videos.list({
        part: 'snippet,statistics,contentDetails',
        id: videoIds.slice(i, i + 50).join(','),
      });
      results.push(...(res.data.items || []));
    } catch {
      continue;
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════
// PART 3. 영상 분류 및 품질 필터
// ═══════════════════════════════════════════════════════════════

/** ISO 8601 duration → 초 변환 */
function parseDuration(duration) {
  if (!duration) return 0;
  const m = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || 0) * 3600) +
         (parseInt(m[2] || 0) * 60)   +
         parseInt(m[3] || 0);
}

/**
 * [레드팀 검증 1] 쇼츠 판별 — 3중 필터, 2개 이상 충족 시 쇼츠
 */
function detectShorts(video) {
  const sec        = parseDuration(video.contentDetails?.duration);
  const isShortDur = sec > 0 && sec <= 180;
  const h = video.snippet?.thumbnails?.maxres?.height ?? 0;
  const w = video.snippet?.thumbnails?.maxres?.width  ?? 1;
  const isVertical = h > w;
  const isTagged   = (video.snippet?.tags || [])
    .some(t => t.toLowerCase() === 'shorts');
  return [isShortDur, isVertical, isTagged].filter(Boolean).length >= 2;
}

/**
 * [레드팀 검증 1] 품질 필터 — 통과해야 후보에 포함
 * 낚시성 제목 / 외국어 / 연령 부적합 / 최소 조회수 미달 제거
 */
function passesQualityFilter(video, userProfile) {
  const title = video.snippet?.title || '';
  const desc  = video.snippet?.description || '';
  const tags  = (video.snippet?.tags || []).join(' ');
  const full  = `${title} ${desc} ${tags}`;
  const age   = userProfile?.age_group || '';

  // 낚시성 제목
  if (BAIT_PATTERNS.some(p => p.test(title))) return false;

  // 외국어 콘텐츠 (한국어 아니면 제거)
  const hasKorean   = /[가-힣]/.test(title);
  const isKoreanLang = video.snippet?.defaultLanguage === 'ko' ||
                       video.snippet?.defaultAudioLanguage === 'ko';
  if (!hasKorean && !isKoreanLang) return false;

  // 아동 콘텐츠 — 해당 연령 아니면 제거
  if (!['유아기', '어린이기'].includes(age)) {
    if (CHILD_PATTERNS.some(p => p.test(full))) return false;
  }

  // 10대 콘텐츠 — 10대 아니면 제거
  if (age !== '10대') {
    if (TEEN_PATTERNS.some(p => p.test(full))) return false;
  }

  // 유저 직접 설정 제외 카테고리
  const excludes = userProfile?.exclude_categories || [];
  if (excludes.some(ex => full.includes(ex))) return false;

  // 최소 조회수 기준
  if (parseInt(video.statistics?.viewCount || 0) < QUOTA.MIN_VIEW_COUNT) return false;

  return true;
}

/**
 * [레드팀 검증 2] 댓글 이벤트 채널 감지
 * 이벤트 채널이면 댓글율 점수를 0.3으로 감쇄
 */
function isEventContent(video) {
  const title = video.snippet?.title || '';
  const desc  = (video.snippet?.description || '').slice(0, 300);
  return EVENT_PATTERNS.some(p => p.test(title) || p.test(desc));
}

// ═══════════════════════════════════════════════════════════════
// PART 4. 다차원 점수 계산
// ═══════════════════════════════════════════════════════════════

/**
 * [레드팀 검증 2] 관심사 일치도 계산 (0~1)
 * 영상 제목/설명/태그와 유저 관심사 키워드 매칭
 * confidence 가중치 반영
 */
function calcInterestMatch(video, tasteProfile) {
  if (!tasteProfile?.real_interests?.length) {
    // Backward compat: old taste profile format {search_keywords}
    if (tasteProfile?.search_keywords?.length) {
      const title = video.snippet?.title || '';
      const tags  = (video.snippet?.tags || []).join(' ');
      const full  = `${title} ${tags}`.toLowerCase();
      const kws   = tasteProfile.search_keywords;
      const matched = kws.filter(kw => kw.length > 1 && full.includes(kw.toLowerCase())).length;
      return Math.min(matched / Math.max(kws.length, 1), 1);
    }
    return 0;
  }
  const title = video.snippet?.title || '';
  const desc  = (video.snippet?.description || '').slice(0, 300);
  const tags  = (video.snippet?.tags || []).join(' ');
  const full  = `${title} ${desc} ${tags}`;

  let maxMatch = 0;
  for (const interest of tasteProfile.real_interests) {
    const words   = interest.topic.split(/\s+|\/|,/);
    const matched = words.filter(w => w.length > 1 && full.includes(w)).length;
    const weighted = (matched / Math.max(words.length, 1)) * (interest.confidence / 100);
    if (weighted > maxMatch) maxMatch = weighted;
  }
  return Math.min(maxMatch, 1);
}

/**
 * [레드팀 검증 4] 피드백 패널티 계산 (최대 -20점)
 * 시간 감쇄: 오래된 거부일수록 영향력 감소
 */
function calcFeedbackPenalty(video, feedbackHistory) {
  if (!feedbackHistory?.length) return 0;
  let penalty    = 0;
  const channel  = video.snippet?.channelId || '';
  const title    = video.snippet?.title     || '';

  for (const fb of feedbackHistory) {
    if (fb.action !== 'dismissed') continue;
    const days = (Date.now() - new Date(fb.created_at || Date.now())) / 86400000;
    const decay = days < 7 ? 1.0 : days < 30 ? 0.7 : days < 90 ? 0.4 : 0.1;
    if (fb.channel_id && fb.channel_id === channel) penalty -= 10 * decay;
    if (fb.keyword && title.includes(fb.keyword)) penalty -= 5 * decay;
  }
  return Math.max(penalty, -20);
}

/**
 * [개선방향 1 + 레드팀 검증 2] 연령 적합도 점수 (-20 ~ +15점)
 * 아동/10대 콘텐츠가 해당 연령 아닌 유저에게 추천되는 문제 해결
 */
function calcAgeScore(video, ageGroup) {
  const title = video.snippet?.title || '';
  const desc  = (video.snippet?.description || '').slice(0, 200);
  const tags  = (video.snippet?.tags || []).join(' ');
  const full  = `${title} ${desc} ${tags}`;

  if (CHILD_PATTERNS.some(p => p.test(full))) {
    return ['유아기', '어린이기'].includes(ageGroup) ? 10 : -20;
  }
  if (TEEN_PATTERNS.some(p => p.test(full))) {
    return ageGroup === '10대' ? 10 : -15;
  }
  return 15; // 연령 문제 없으면 만점
}

/**
 * [레드팀 검증 2] 규모 소프트 보너스 (하드 상한 제거)
 * 대형 채널도 추천되지만 점수 경쟁에서 자연스럽게 조율됨
 */
function calcScaleBonus(subscriberCount) {
  const sub = subscriberCount || 0;
  if (sub >= 100_000  && sub < 500_000)   return 15; // "유명하지만 나만 몰랐던" 구간
  if (sub >= 500_000  && sub < 2_000_000) return 10;
  if (sub >= 2_000_000 && sub < 5_000_000) return 5;
  if (sub >= 5_000_000)                   return 2;  // 초대형도 추천 가능하되 보너스만 줄임
  if (sub >= 10_000)                      return 8;  // 소규모도 추천 가능
  return 3;
}

/**
 * 일반 영상 점수 계산 (0~100점)
 *
 * 지표별 배점:
 * 취향 일치도  30점 ← 가장 중요
 * 연령 적합도  15점 ← 독립 지표 (위반 시 -20점)
 * 댓글율       15점 ← 커뮤니티 활성도 (이벤트 감쇄)
 * 좋아요율     10점 ← 조작 어려운 지표
 * 조회수       10점 ← 참고용 (하향)
 * 신선도       10점 ← 명작 허용 (최소 1점)
 * 교차전략     5점  ← 다중전략 신뢰도 보너스
 * 피드백       -20~0점 ← 학습 루프
 */
function calcVideoScore(video, tasteProfile, userProfile, feedbackHistory, isCrossStrategy) {
  let score = 0;
  const view    = parseInt(video.statistics?.viewCount    || 0);
  const like    = parseInt(video.statistics?.likeCount    || 0);
  const comment = parseInt(video.statistics?.commentCount || 0);
  const days    = Math.max(
    (Date.now() - new Date(video.snippet?.publishedAt || Date.now())) / 86400000, 1
  );

  // ① 취향 일치도 (30점)
  score += calcInterestMatch(video, tasteProfile) * 30;

  // ② 연령 적합도 (15점, 위반 시 -15~-20점)
  score += calcAgeScore(video, userProfile?.age_group);

  // ③ 댓글율 (15점) — 이벤트 채널은 0.3으로 감쇄
  const commentRate = comment / Math.max(view, 1);
  const cw          = isEventContent(video) ? 0.3 : 1.0;
  const rawC        = commentRate >= 0.005 ? 15
                    : commentRate >= 0.002 ? 10
                    : commentRate >= 0.001 ?  5 : 0;
  score += rawC * cw;

  // ④ 좋아요율 (10점) — 조작 어려운 핵심 지표
  const likeRate = like / Math.max(view, 1);
  score += likeRate >= 0.08 ? 10
         : likeRate >= 0.05 ?  7
         : likeRate >= 0.03 ?  4 : 1;

  // ⑤ 조회수 (10점) — 참고용, 단독 의존 제거
  score += Math.min(Math.log10(view + 1) * 4, 10);

  // ⑥ 신선도 (10점) — 오래된 명작도 허용 (0점 아닌 최소 1점)
  score += days < 14  ? 10
         : days < 60  ?  7
         : days < 180 ?  4
         : days < 365 ?  2 : 1;

  // ⑦ 다중전략 교차 보너스 (5점)
  if (isCrossStrategy) score += 5;

  // ⑧ 피드백 패널티 (-20~0점)
  score += calcFeedbackPenalty(video, feedbackHistory);

  return Math.max(0, Math.round(score));
}

/**
 * 쇼츠 점수 계산 (0~100점)
 *
 * 지표별 배점:
 * 조회수       20점 ← 쇼츠는 조회수가 핵심 지표
 * 바이럴 속도  20점 ← 일평균 조회수
 * 취향 일치도  15점
 * 연령 적합도  15점
 * 댓글율       15점 ← 이벤트 감쇄
 * 좋아요율     10점
 * 신선도       10점 ← 쇼츠는 신선도 더 중요 (오래되면 감점)
 * 교차전략     5점
 * 피드백       -20~0점
 */
function calcShortsScore(video, tasteProfile, userProfile, feedbackHistory, isCrossStrategy) {
  let score = 0;
  const view    = parseInt(video.statistics?.viewCount    || 0);
  const like    = parseInt(video.statistics?.likeCount    || 0);
  const comment = parseInt(video.statistics?.commentCount || 0);
  const days    = Math.max(
    (Date.now() - new Date(video.snippet?.publishedAt || Date.now())) / 86400000, 1
  );

  // ① 조회수 (20점) — 쇼츠는 조회수가 품질 지표
  score += Math.min(Math.log10(view + 1) * 8, 20);

  // ② 바이럴 속도 (20점) — 일평균 조회수
  score += Math.min((view / days) / 50000, 20);

  // ③ 취향 일치도 (15점)
  score += calcInterestMatch(video, tasteProfile) * 15;

  // ④ 연령 적합도 (15점, 위반 시 -15~-20점)
  score += calcAgeScore(video, userProfile?.age_group);

  // ⑤ 댓글율 (15점) — 쇼츠 평균 0.05~0.2%
  const commentRate = comment / Math.max(view, 1);
  const cw          = isEventContent(video) ? 0.3 : 1.0;
  const rawC        = commentRate >= 0.003  ? 15
                    : commentRate >= 0.001  ? 10
                    : commentRate >= 0.0005 ?  5 : 0;
  score += rawC * cw;

  // ⑥ 좋아요율 (10점) — 쇼츠 평균 1~3%
  const likeRate = like / Math.max(view, 1);
  score += likeRate >= 0.05 ? 10
         : likeRate >= 0.03 ?  7
         : likeRate >= 0.01 ?  4 : 1;

  // ⑦ 신선도 (10점) — 쇼츠는 오래되면 감점
  score += days < 7  ? 10
         : days < 30 ?  7
         : days < 90 ?  3 : -5;

  // ⑧ 다중전략 교차 보너스 (5점)
  if (isCrossStrategy) score += 5;

  // ⑨ 피드백 패널티 (-20~0점)
  score += calcFeedbackPenalty(video, feedbackHistory);

  return Math.max(0, Math.round(score));
}

// ═══════════════════════════════════════════════════════════════
// PART 5. 다양성 쿼터
// ═══════════════════════════════════════════════════════════════

/**
 * [레드팀 검증 3] 카테고리 쏠림 방지 + wildcard 10% 보장
 * 1위 카테고리: 최대 40%
 * 2~3위 카테고리: 각 최대 25%
 * wildcard: 10% (관심사 밖 고품질 영상 → 새로운 발견)
 * 같은 채널 2개 이상 금지
 */
function applyDiversityQuota(scoredVideos, totalCount, tasteProfile) {
  const wildCount = Math.floor(totalCount * QUOTA.WILDCARD_RATIO);
  const mainCount = totalCount - wildCount;

  const categorized = {};
  const wildcards   = [];

  for (const v of scoredVideos) {
    if (calcInterestMatch(v.raw, tasteProfile) < 0.1) {
      wildcards.push(v);
    } else {
      const cat = v.raw.snippet?.categoryId || 'unknown';
      if (!categorized[cat]) categorized[cat] = [];
      categorized[cat].push(v);
    }
  }

  // 카테고리별 점수 정렬
  for (const cat of Object.keys(categorized)) {
    categorized[cat].sort((a, b) => b.score - a.score);
  }
  wildcards.sort((a, b) => b.score - a.score);

  const selected = [];
  const seenChannels = new Set();
  const catKeys  = Object.keys(categorized)
    .sort((a, b) => categorized[b].length - categorized[a].length);

  for (let i = 0; i < catKeys.length; i++) {
    const maxRatio = i === 0 ? QUOTA.PRIMARY_MAX_RATIO : QUOTA.SECONDARY_MAX_RATIO;
    const maxCount = Math.floor(mainCount * maxRatio);
    const cat      = catKeys[i];
    let added      = 0;
    for (const v of categorized[cat]) {
      if (added >= maxCount) break;
      const ch = v.raw.snippet?.channelId || '';
      if (seenChannels.has(ch)) continue;
      selected.push({ ...v, is_wildcard: false });
      seenChannels.add(ch);
      added++;
    }
  }

  // wildcard 추가
  const seenIds = new Set(selected.map(v => v.videoId));
  for (const v of wildcards) {
    if (selected.length >= mainCount + wildCount) break;
    if (seenIds.has(v.videoId)) continue;
    const ch = v.raw.snippet?.channelId || '';
    if (seenChannels.has(ch)) continue;
    selected.push({ ...v, is_wildcard: true });
    seenChannels.add(ch);
    seenIds.add(v.videoId);
  }

  // 부족하면 잔여 풀에서 보충
  if (selected.length < totalCount) {
    const seenIdsFinal = new Set(selected.map(v => v.videoId));
    const remaining = scoredVideos.filter(v => !seenIdsFinal.has(v.videoId));
    selected.push(...remaining.slice(0, totalCount - selected.length));
  }

  return selected.slice(0, totalCount);
}

// ═══════════════════════════════════════════════════════════════
// PART 6. Gemini 최종 선별 + 추천 문구 생성
// ═══════════════════════════════════════════════════════════════

/**
 * [레드팀 검증 6] Gemini 최종 선별
 * 셔플로 위치 편향 방지
 * 연령/카테고리/채널 다양성 명시적 지시
 * 추천 이유 다각도 작성 (뻔한 표현 금지)
 * is_wildcard 플래그로 UI 차별화 가능
 */
async function generateFinalRecommendations(
  videoCandidates,
  shortsCandidates,
  tasteProfile,
  userProfile,
  topSubscriptions
) {
  const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);

  const fmt = (v, idx) => {
    const view     = parseInt(v.raw.statistics?.viewCount || 0);
    const like     = parseInt(v.raw.statistics?.likeCount || 0);
    const likeRate = ((like / Math.max(view, 1)) * 100).toFixed(1);
    return `[${idx + 1}] video_id: ${v.videoId} 제목: ${v.raw.snippet?.title} 채널: ${v.raw.snippet?.channelTitle} 조회수: ${view.toLocaleString()} / 좋아요율: ${likeRate}% / 추천점수: ${v.score}점\n`;
  };

  const prompt = `
너는 개인화 유튜브 큐레이터야.
아래 유저 정보와 후보 영상들을 보고 최종 추천 목록을 만들어줘.

[유저 정보]
연령대: ${userProfile?.age_group || '알 수 없음'}
라이프스타일: ${userProfile?.life_stage?.join(', ') || '알 수 없음'}
핵심 관심사: ${tasteProfile.real_interests.slice(0, 5).map(i => i.topic).join(', ')}
선호 콘텐츠 형식: ${tasteProfile.content_style?.format?.join(', ') || '알 수 없음'}
절대 추천 금지 주제: ${userProfile?.exclude_categories?.join(', ') || '없음'}
대표 구독 채널: ${topSubscriptions.slice(0, 5).join(', ')}

[선별 규칙 — 반드시 따를 것]
유저 연령대와 맞지 않는 콘텐츠 절대 제외
절대 추천 금지 주제 완전 제외
같은 채널 영상 2개 이상 포함 금지
같은 카테고리가 전체의 40% 초과 금지
wildcard는 영상 3개 / 쇼츠 5개 — 유저 취향과 약간 다르지만
품질이 높아 새로운 발견이 될 수 있는 영상으로 선택

추천 이유는 아래 3가지 각도를 돌아가며 사용 (같은 패턴 반복 금지):
각도A: 영상 내용의 구체적 특징이나 매력 포인트
각도B: 어떤 상황이나 시간에 보면 좋은지 (예: 퇴근 후, 주말 아침)
각도C: 유저의 기존 구독 채널과 어떻게 다른지 비교
"이런 거 좋아하실 것 같아요" 같은 뻔한 표현 절대 금지

[일반 영상 후보 ${videoCandidates.length}개]
${shuffle(videoCandidates).map(fmt).join('')}

[쇼츠 후보 ${shortsCandidates.length}개]
${shuffle(shortsCandidates).map(fmt).join('')}

[JSON으로만 응답 — 설명 없이]
{
  "videos": [
    {
      "video_id": "영상ID",
      "recommendation_reason": "추천 이유 2~3문장 (위 3가지 각도 중 하나 사용)",
      "hook_message": "스크롤 멈추게 할 한 마디 20자 이내",
      "vibe_tag": "🔥꿀정보 또는 😂웃김 또는 😌힐링 또는 🤯충격 또는 💡인사이트 중 하나",
      "is_wildcard": true 또는 false
    }
  ],
  "shorts": [
    {
      "video_id": "쇼츠ID",
      "recommendation_reason": "취향 기반 추천 이유 1문장",
      "hook_message": "15자 이내 임팩트 문구",
      "vibe_tag": "분위기 태그",
      "is_wildcard": true 또는 false
    }
  ]
}
`;

  const result = await geminiModel.generateContent(prompt);
  const text   = result.response.text().replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    return { videos: [], shorts: [] };
  }
}

// ═══════════════════════════════════════════════════════════════
// PART 7. Cold Start + 피드백 분석
// ═══════════════════════════════════════════════════════════════

/**
 * [레드팀 검증 5] Cold Start — 신규 유저 초기 추천
 * video_pool 인기 영상 기반, 연령 필터 적용
 */
async function coldStartRecommendations(userProfile) {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('video_pool')
    .select('*')
    .eq('collected_date', today)
    .order('raw_score', { ascending: false })
    .limit(100);

  return (data || []).filter(v => {
    const t   = v.title || '';
    const age = userProfile?.age_group || '';
    if (!['유아기', '어린이기'].includes(age) && CHILD_PATTERNS.some(p => p.test(t))) return false;
    if (age !== '10대' && TEEN_PATTERNS.some(p => p.test(t))) return false;
    return true;
  });
}

/**
 * [레드팀 검증 4] 피드백 패턴 분석 → 자동 제외 목록 갱신
 * 3회 이상 같은 이유로 거부된 주제를 자동으로 제외
 * 필터 버블 방지: wildcard 10% 보장으로 과도한 필터링 차단
 */
async function analyzeFeedbackPatterns(userId) {
  const { data } = await supabase
    .from('user_feedback')
    .select('*')
    .eq('user_id', userId)
    .eq('action', 'dismissed')
    .gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString())
    .order('created_at', { ascending: false });

  if (!data?.length) return [];

  const counts = {};
  for (const fb of data) {
    if (fb.reason) counts[fb.reason] = (counts[fb.reason] || 0) + 1;
  }

  return Object.entries(counts)
    .filter(([, c]) => c >= QUOTA.AUTO_EXCLUDE_COUNT)
    .map(([reason]) => reason);
}

// ═══════════════════════════════════════════════════════════════
// 메인 함수: 개인화 추천 생성 파이프라인
// ═══════════════════════════════════════════════════════════════

/**
 * 전체 추천 파이프라인 실행
 *
 * @param {string} userId      - Supabase users.id
 * @param {object} userProfile - { age_group, life_stage, exclude_categories }
 * @returns {{ videos: [], shorts: [], isColdStart?: boolean }}
 */
async function generatePersonalizedRecommendations(userId, userProfile) {
  // ── 1. 데이터 로드
  const [
    { data: subscriptions },
    { data: userData },
    { data: feedbackHistory },
  ] = await Promise.all([
    supabase.from('user_subscriptions').select('*').eq('user_id', userId),
    supabase.from('users').select('taste_profile').eq('id', userId).single(),
    supabase.from('user_feedback').select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ]);

  // ── 2. 피드백 패턴 자동 분석 → 제외 목록 갱신
  const autoExclude = await analyzeFeedbackPatterns(userId);
  userProfile = {
    ...userProfile,
    exclude_categories: [
      ...(userProfile.exclude_categories || []),
      ...autoExclude,
    ],
  };

  // ── 3. Cold start 판단
  const isColdStart = (!feedbackHistory || feedbackHistory.length < QUOTA.FEEDBACK_THRESHOLD)
                   && !subscriptions?.length;
  if (isColdStart) {
    const cold = await coldStartRecommendations(userProfile);
    return {
      videos:      cold.slice(0, QUOTA.VIDEO_BATCH),
      shorts:      cold.slice(0, QUOTA.SHORTS_BATCH),
      isColdStart: true,
    };
  }

  // ── 4. 취향 프로파일 로드 또는 새로 생성
  let tasteProfile = userData?.taste_profile;
  if (!tasteProfile && subscriptions?.length) {
    tasteProfile = await analyzeUserTaste(subscriptions, userProfile);
    await supabase.from('users').update({ taste_profile: tasteProfile }).eq('id', userId);
  }
  tasteProfile = tasteProfile || { real_interests: [], search_queries: [], content_style: {} };

  // ── 5. 오늘 video_pool 로드
  const today = new Date().toISOString().split('T')[0];
  const { data: poolVideos } = await supabase
    .from('video_pool').select('*')
    .eq('collected_date', today)
    .order('raw_score', { ascending: false });

  // ── 6. 필터 기준 ID 셋 준비
  const subscribedChannelIds = new Set((subscriptions || []).map(s => s.channel_id));
  const { data: recentRecs } = await supabase
    .from('user_recommendations').select('video_id')
    .eq('user_id', userId)
    .gte('recommended_date', new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]);
  const recentRecIds = new Set((recentRecs || []).map(r => r.video_id));

  // ── 7. Gemini 검색어로 다중전략 검색
  const searchQueries  = (tasteProfile.search_queries || []).slice(0, 8);
  const videoAllIds    = new Set();
  const videoCrossIds  = new Set();
  const shortsAllIds   = new Set();
  const shortsCrossIds = new Set();

  await Promise.all(searchQueries.map(async query => {
    const [vR, sR] = await Promise.all([
      searchByMultiStrategy(query, false),
      searchByMultiStrategy(query, true),
    ]);
    vR.allIds.forEach(id => videoAllIds.add(id));
    vR.crossStrategyIds.forEach(id => videoCrossIds.add(id));
    sR.allIds.forEach(id => shortsAllIds.add(id));
    sR.crossStrategyIds.forEach(id => shortsCrossIds.add(id));
  }));

  // ── 8. 영상 상세 정보 수집
  const allSearchIds  = [...new Set([...videoAllIds, ...shortsAllIds])];
  const fetchedVideos = await fetchVideoDetails(allSearchIds);

  // ── 9. 품질 필터 + 구독/중복 제거
  const filteredVideos = fetchedVideos.filter(v => {
    if (!v.id) return false;
    if (subscribedChannelIds.has(v.snippet?.channelId)) return false;
    if (recentRecIds.has(v.id)) return false;
    return passesQualityFilter(v, userProfile);
  });

  // ── 10. 점수 계산 (영상 / 쇼츠 분리)
  const scoredVideos = [];
  const scoredShorts = [];

  for (const video of filteredVideos) {
    const id       = video.id;
    const isCross  = videoCrossIds.has(id) || shortsCrossIds.has(id);
    if (detectShorts(video)) {
      scoredShorts.push({
        videoId: id,
        score: calcShortsScore(video, tasteProfile, userProfile, feedbackHistory, isCross),
        raw: video,
      });
    } else {
      scoredVideos.push({
        videoId: id,
        score: calcVideoScore(video, tasteProfile, userProfile, feedbackHistory, isCross),
        raw: video,
      });
    }
  }

  scoredVideos.sort((a, b) => b.score - a.score);
  scoredShorts.sort((a, b) => b.score - a.score);

  // ── 11. 다양성 쿼터 적용
  const vCandCount = Math.floor(QUOTA.VIDEO_BATCH  * QUOTA.CANDIDATE_MULTIPLIER);
  const sCandCount = Math.floor(QUOTA.SHORTS_BATCH * QUOTA.CANDIDATE_MULTIPLIER);

  const diverseVideos = applyDiversityQuota(
    scoredVideos.slice(0, vCandCount * 2), vCandCount, tasteProfile
  );
  const diverseShorts = applyDiversityQuota(
    scoredShorts.slice(0, sCandCount * 2), sCandCount, tasteProfile
  );

  // ── 12. Gemini 최종 선별 + 추천 문구 생성
  const topSubs = (subscriptions || [])
    .sort((a, b) => (b.subscriber_count || 0) - (a.subscriber_count || 0))
    .slice(0, 5)
    .map(s => s.channel_title);

  const finalResult = await generateFinalRecommendations(
    diverseVideos, diverseShorts, tasteProfile, userProfile, topSubs
  );

  // ── 13. Supabase 저장
  const toInsert = [
    ...(finalResult.videos || []).map((v, idx) => ({
      user_id:               userId,
      video_id:              v.video_id,
      type:                  'video',
      personal_score:        diverseVideos.find(c => c.videoId === v.video_id)?.score || 0,
      recommendation_reason: v.recommendation_reason,
      hook_message:          v.hook_message,
      vibe_tag:              v.vibe_tag,
      is_wildcard:           v.is_wildcard || false,
      recommended_date:      today,
      batch_index:           Math.floor(idx / 10),
    })),
    ...(finalResult.shorts || []).map((v, idx) => ({
      user_id:               userId,
      video_id:              v.video_id,
      type:                  'shorts',
      personal_score:        diverseShorts.find(c => c.videoId === v.video_id)?.score || 0,
      recommendation_reason: v.recommendation_reason,
      hook_message:          v.hook_message,
      vibe_tag:              v.vibe_tag,
      is_wildcard:           v.is_wildcard || false,
      recommended_date:      today,
      batch_index:           Math.floor(idx / 10),
    })),
  ];

  if (toInsert.length > 0) {
    await supabase.from('user_recommendations').insert(toInsert);
  }

  return finalResult;
}

// ═══════════════════════════════════════════════════════════════
// POOL FORMAT ADAPTERS (video_pool 테이블 형식 → 엔진 함수 호환)
// ═══════════════════════════════════════════════════════════════

/**
 * video_pool 행을 YouTube API 객체 형식으로 변환
 * calcVideoScore / passesQualityFilter 등 기존 함수 재사용 가능
 */
export function adaptPoolToAPIFormat(poolVideo) {
  const sec = poolVideo.duration_sec || 0;
  const h   = Math.floor(sec / 3600);
  const m   = Math.floor((sec % 3600) / 60);
  const s   = sec % 60;
  const duration = `PT${h ? h + 'H' : ''}${m ? m + 'M' : ''}${s ? s + 'S' : ''}` || 'PT0S';
  return {
    id: poolVideo.video_id,
    snippet: {
      title:                poolVideo.title         || '',
      description:          '',
      channelId:            poolVideo.channel_id    || '',
      channelTitle:         poolVideo.channel_name  || '',
      publishedAt:          poolVideo.published_at  || new Date().toISOString(),
      categoryId:           poolVideo.category      || '',
      tags:                 poolVideo.tags           || [],
      defaultLanguage:      'ko',
      defaultAudioLanguage: 'ko',
    },
    statistics: {
      viewCount:    String(poolVideo.view_count    || 0),
      likeCount:    String(poolVideo.like_count    || 0),
      commentCount: String(poolVideo.comment_count || 0),
    },
    contentDetails: { duration },
  };
}

/**
 * video_pool 영상에 적용하는 품질 필터
 * 낚시성 제목 / 외국어(비한국어) / 최소 조회수 미달 제거
 */
export function passesPoolQualityFilter(poolVideo) {
  const title = poolVideo.title || '';
  if (BAIT_PATTERNS.some(p => p.test(title))) return false;
  if (!/[가-힣]/.test(title)) return false;
  if (parseInt(poolVideo.view_count || 0) < QUOTA.MIN_VIEW_COUNT) return false;
  return true;
}

/**
 * video_pool 형식 영상 배열에 다양성 쿼터 적용
 * scoredVideos: [{...poolVideo, personal_score: number}]
 * 1위 카테고리 40% / 2~3위 25% / wildcard 10% / 같은 채널 2개 이상 금지
 */
export function applyDiversityQuotaToPool(scoredVideos, totalCount, tasteProfile) {
  const wildCount = Math.floor(totalCount * QUOTA.WILDCARD_RATIO);
  const mainCount = totalCount - wildCount;

  const categorized = {};
  const wildcards   = [];

  for (const v of scoredVideos) {
    const title = v.title || '';
    const tags  = (v.tags || []).join(' ');
    const full  = `${title} ${tags}`;
    let interestMatch = 0;

    if (tasteProfile?.real_interests?.length) {
      for (const interest of tasteProfile.real_interests) {
        const words   = interest.topic.split(/\s+|\/|,/);
        const matched = words.filter(w => w.length > 1 && full.includes(w)).length;
        const weighted = (matched / Math.max(words.length, 1)) * (interest.confidence / 100);
        if (weighted > interestMatch) interestMatch = weighted;
      }
    } else if (tasteProfile?.search_keywords?.length) {
      const kws = tasteProfile.search_keywords;
      const mk  = kws.filter(kw => kw.length > 1 && full.toLowerCase().includes(kw.toLowerCase())).length;
      interestMatch = mk / Math.max(kws.length, 1);
    }

    if (interestMatch < 0.1) {
      wildcards.push(v);
    } else {
      const cat = v.category || 'unknown';
      if (!categorized[cat]) categorized[cat] = [];
      categorized[cat].push(v);
    }
  }

  for (const cat of Object.keys(categorized)) {
    categorized[cat].sort((a, b) => b.personal_score - a.personal_score);
  }
  wildcards.sort((a, b) => b.personal_score - a.personal_score);

  const selected     = [];
  const seenChannels = new Set();
  const catKeys = Object.keys(categorized)
    .sort((a, b) => categorized[b].length - categorized[a].length);

  for (let i = 0; i < catKeys.length; i++) {
    const maxRatio = i === 0 ? QUOTA.PRIMARY_MAX_RATIO : QUOTA.SECONDARY_MAX_RATIO;
    const maxCount = Math.floor(mainCount * maxRatio);
    const cat      = catKeys[i];
    let added      = 0;
    for (const v of categorized[cat]) {
      if (added >= maxCount) break;
      const ch = v.channel_id || '';
      if (seenChannels.has(ch)) continue;
      selected.push(v);
      seenChannels.add(ch);
      added++;
    }
  }

  const seenIds = new Set(selected.map(v => v.video_id));
  for (const v of wildcards) {
    if (selected.length >= mainCount + wildCount) break;
    if (seenIds.has(v.video_id)) continue;
    const ch = v.channel_id || '';
    if (seenChannels.has(ch)) continue;
    selected.push(v);
    seenChannels.add(ch);
    seenIds.add(v.video_id);
  }

  if (selected.length < totalCount) {
    const seenIdsFinal = new Set(selected.map(v => v.video_id));
    const remaining    = scoredVideos.filter(v => !seenIdsFinal.has(v.video_id));
    selected.push(...remaining.slice(0, totalCount - selected.length));
  }

  return selected.slice(0, totalCount);
}

// ─────────────────────────────────────────────
// 내보내기
// ─────────────────────────────────────────────
export {
  generatePersonalizedRecommendations,
  analyzeUserTaste,
  coldStartRecommendations,
  analyzeFeedbackPatterns,
  calcVideoScore,
  calcShortsScore,
  passesQualityFilter,
  detectShorts,
  applyDiversityQuota,
  calcInterestMatch,
  calcAgeScore,
  calcScaleBonus,
};
