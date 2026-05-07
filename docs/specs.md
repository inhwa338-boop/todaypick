# 오늘은 이거다 — 구현 스펙

> 서비스: 유튜브 구독 채널 기반 개인화 영상/쇼츠 추천
> 디자인 테마: Linear 스타일 다크 테마 (DESIGN.md 참고)

---

## STEP 1: 프로젝트 기본 세팅 설계

**목표:** Next.js 14 (App Router) 기반 프로젝트를 로컬에 세팅하고, 이후 단계에서 사용할 모든 외부 서비스 연결 준비 완료.

### 기술 스택

| 항목 | 선택 |
|------|------|
| 프레임워크 | Next.js 14 App Router |
| 언어 | JavaScript (.js) |
| 스타일링 | Tailwind CSS |
| 인증 | NextAuth.js (Google OAuth) |
| DB | Supabase (PostgreSQL) |
| AI | Google Gemini API (gemini-2.5-flash) |
| 동영상 | YouTube Data API v3 |
| 배포 | Vercel (Cron 지원) |

### 프로젝트 구조

```
todaypick/
├── app/
│   ├── page.jsx
│   ├── onboarding/page.jsx
│   ├── today/page.jsx
│   ├── profile/page.jsx
│   └── api/
│       ├── auth/[...nextauth]/route.js
│       ├── collect-subscriptions/route.js
│       ├── recommendations/route.js
│       └── batch/
│           ├── collect-pool/route.js
│           └── generate-recommendations/route.js
├── lib/
│   ├── supabase.js
│   ├── youtube.js
│   ├── gemini.js
│   └── scoring.js
├── middleware.js
├── .env.local          # git 제외
├── .gitignore
├── vercel.json
└── DESIGN.md
```

### 환경변수 (.env.local)

```env
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
NEXTAUTH_SECRET=YOUR_NEXTAUTH_SECRET_32자이상
NEXTAUTH_URL=http://localhost:3000
YOUTUBE_API_KEY=YOUR_YOUTUBE_API_KEY
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

보안 규칙:
- `NEXT_PUBLIC_` 없는 변수 → 서버(API Route)에서만 사용
- `GEMINI_API_KEY`, `YOUTUBE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → 서버 전용
- `.env.local` → `.gitignore`에 반드시 포함

### create-next-app 옵션

| 질문 | 선택 |
|------|------|
| TypeScript | No |
| ESLint | Yes |
| Tailwind CSS | Yes |
| src/ 디렉토리 | No |
| App Router | Yes |
| import alias (@/) | No |

### Vercel Cron (vercel.json)

```json
{
  "crons": [
    { "path": "/api/batch/collect-pool", "schedule": "0 17 * * *" },
    { "path": "/api/batch/generate-recommendations", "schedule": "0 18 * * *" }
  ]
}
```

---

## STEP 2: DB 테이블 설계 (Supabase SQL + RLS)

**목표:** Supabase에 프로젝트를 생성하고, 서비스에 필요한 DB 테이블 4개와 RLS를 설정한다. `lib/supabase.js`에 서버/클라이언트 분리 클라이언트를 구현한다.

### SQL 실행 방법
Supabase 대시보드 SQL Editor에서 직접 붙여넣기 실행 (CLI 불필요)

### 테이블 목록

| 테이블 | 역할 | 주요 컬럼 |
|--------|------|-----------|
| `users` | 유저 정보 + 취향 프로파일 + OAuth 토큰 | google_id, taste_profile(jsonb), access_token, onboarding_completed |
| `user_subscriptions` | 유저별 구독 채널 (최초 1회 수집) | user_id, channel_id, subscriber_count, keywords(text[]) |
| `video_pool` | 새벽 배치가 채우는 공통 영상 후보 | video_id, type(video/shorts), view_count, collected_date |
| `user_recommendations` | 유저별 개인화 추천 결과 캐시 | user_id, video_id, personal_score, hook_message, batch_index |

### RLS 정책 요약

| 테이블 | 정책 |
|--------|------|
| `users` | 본인(auth.uid = id)만 SELECT, UPDATE |
| `user_subscriptions` | 본인(auth.uid = user_id)만 SELECT |
| `user_recommendations` | 본인(auth.uid = user_id)만 SELECT, UPDATE |
| `video_pool` | 인증된 모든 유저 SELECT (공통 데이터) |

### lib/supabase.js 클라이언트 구조

```js
// 클라이언트/서버 공용 (anon key - RLS 적용됨)
export const supabase = createClient(url, anonKey)

// 서버 API Route 전용 (service_role key - RLS 우회)
export function createAdminClient() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY)
}
```

---

## STEP 3: Google OAuth + NextAuth 설정

**목표:** NextAuth.js로 Google 로그인을 구현한다. YouTube readonly 권한을 포함하고, 신규/기존 유저를 분기해 Supabase users 테이블과 연동한다.

### 파일 구조

| 파일 | 역할 |
|------|------|
| `lib/auth.js` | NextAuth authOptions (Provider, JWT/Session 콜백) |
| `app/api/auth/[...nextauth]/route.js` | NextAuth route handler |

### OAuth Scope

```
openid, email, profile,
https://www.googleapis.com/auth/youtube.readonly
```

### 인증 플로우

```
Google 로그인
  → jwt 콜백: access_token·refresh_token·만료시각 JWT에 저장 (클라이언트 비노출)
  → jwt 콜백: 토큰 만료 시 Google refresh API 호출 → Supabase users 업데이트
  → session 콜백: user_id·email·name·avatar_url·onboarding_completed만 노출

신규 유저 (google_id 없음):
  → Supabase users INSERT → onboarding_completed: false

기존 유저 (google_id 있음):
  → last_login_at·access_token UPDATE → onboarding_completed 현재값 유지
```

### 세션 구조

```js
// session.user에 포함되는 항목
{
  id: "uuid",                    // Supabase users.id
  email: "user@example.com",
  name: "홍길동",
  image: "https://...",          // avatar_url
  onboarding_completed: false    // 리다이렉트 분기용
}
// access_token은 JWT에만 보관 (세션 객체에 없음)
```

### 세션 설정

- 전략: JWT
- 유지 기간: 30일 (`maxAge: 30 * 24 * 60 * 60`)
- 로그아웃: 쿠키 삭제 후 `/` 이동

---

## STEP 4: 미들웨어 라우팅 보호

**목표:** `middleware.js`에서 `getToken()`으로 JWT를 읽어 4가지 라우팅 규칙을 구현한다. DB 호출 없이 Edge에서 빠르게 처리한다.

### 라우팅 규칙

| 경로 | 조건 | 동작 |
|------|------|------|
| `/today`, `/profile`, `/onboarding` | 비로그인 | `/` 리다이렉트 |
| `/today` | 로그인 + `onboarding_completed = false` | `/onboarding` 리다이렉트 |
| `/onboarding` | 로그인 + `onboarding_completed = true` | `/today` 리다이렉트 |
| `/` | 로그인 + `onboarding_completed = true` | `/today` 리다이렉트 |

### 구현 방식
- `getToken()` (next-auth/jwt) — JWT를 Edge에서 직접 읽음, DB 호출 없음
- `token.onboardingCompleted`로 온보딩 완료 여부 판단
- `config.matcher`: `['/', '/today', '/today/:path*', '/profile', '/profile/:path*', '/onboarding', '/onboarding/:path*']`

---

## STEP 5: 구독 채널 수집 API

**목표:** 유저의 YouTube 구독 채널을 수집·저장하고 Gemini API로 취향 프로파일을 생성한다. 최초 1회만 실행된다.

### 파일 구조

| 파일 | 역할 |
|------|------|
| `lib/youtube.js` | `getSubscriptions(accessToken)`, `getChannelDetails(channelIds)` |
| `lib/gemini.js` | `generateTasteProfile(subscriptions)` |
| `app/api/collect-subscriptions/route.js` | 오케스트레이터 |

### YouTube API 역할 분리

| 함수 | 인증 방식 | 이유 |
|------|-----------|------|
| `getSubscriptions(accessToken)` | 유저 OAuth token | 개인 구독 목록 (비공개) |
| `getChannelDetails(channelIds)` | `YOUTUBE_API_KEY` | 공개 채널 정보 |

### route.js 처리 순서

```
POST /api/collect-subscriptions
1. getServerSession() → 미인증 → 401
2. getToken() → JWT에서 accessToken 추출
3. user_subscriptions COUNT → 이미 있으면 { cached: true } 200 반환
4. getSubscriptions(accessToken) → pageToken 순회, 전체 구독 수집
5. getChannelDetails(channelIds) → 50개씩 배치
6. user_subscriptions INSERT
7. generateTasteProfile(subscriptions) → Gemini API 1회 호출
8. users UPDATE (taste_profile)
9. { success: true, count: N } 200 반환
```

### taste_profile 구조

```json
{
  "category_weights": { "IT/개발": 0.30, "요리/자취": 0.20 },
  "primary_interests": ["관심사1", "관심사2", "관심사3"],
  "secondary_interests": ["관심사4", "관심사5"],
  "content_style": ["vlog", "튜토리얼"],
  "preferred_scale": "대형",
  "language_preference": "한국어",
  "search_keywords": ["키워드1", "키워드2", "...", "키워드10"]
}
```

---

## STEP 6: 새벽 배치 — 공통 영상 후보 풀 수집

**목표:** 매일 새벽 2시(UTC 17:00) Vercel Cron으로 자동 실행. 20개 카테고리별 YouTube 영상·쇼츠를 수집해 `video_pool` 테이블에 저장한다.

### 파일
- `app/api/batch/collect-pool/route.js` — 단일 파일

### 환경변수 추가
```
CRON_SECRET=YOUR_CRON_SECRET  # openssl rand -base64 32 로 생성
```

### 인증
`Authorization: Bearer {CRON_SECRET}` 헤더 검증 → 실패 시 401

### 처리 순서

```
1. CRON_SECRET 헤더 검증 → 401
2. 20개 카테고리 순차 처리:
   A. search.list (일반 영상): type=video, videoDuration=medium, order=viewCount, maxResults=15
   B. search.list (쇼츠): type=video, videoDuration=short, order=viewCount, maxResults=25
3. 수집된 video_id 목록으로 videos.list 조회 (50개씩 배치)
   - part: snippet, statistics, contentDetails
4. 쇼츠 판별 (아래 조건 중 2개 이상 → shorts):
   - duration ≤ 180초
   - 썸네일 세로형 (maxres/high 썸네일 height > width, 기본 비율 9:16)
   - videoDuration=short로 검색된 결과
5. video_pool upsert (unique: video_id + collected_date)
6. { success: true, videoCount, shortsCount } 반환
```

### 카테고리 목록 (20개)

```js
const CATEGORIES = [
  '요리/자취', 'IT/개발', '여행/국내', '운동/헬스', '뷰티/패션',
  '게임', '음악', '영화/드라마', '독서/공부', '재테크',
  '반려동물', '인테리어', '자동차', '스포츠', '코미디/예능',
  '뉴스/시사', '육아', '캠핑/아웃도어', '패션/스타일', '과학/지식',
]
```

### 쇼츠 판별 기준

| 조건 | 기준 |
|------|------|
| duration | contentDetails.duration 파싱 → 180초 이하 |
| 썸네일 비율 | maxres/high 썸네일의 height > width (9:16 세로형) |
| 검색 출처 | videoDuration=short 검색 결과 |

2개 이상 충족 시 `type: 'shorts'`, 아니면 `type: 'video'`

### video_pool 저장 필드

```
video_id, type, title, channel_id, channel_name,
thumbnail_url, duration_sec, view_count, like_count,
comment_count, category, tags, published_at,
collected_date, raw_score
```

### Vercel Cron
```json
{ "path": "/api/batch/collect-pool", "schedule": "0 17 * * *" }
```
UTC 17:00 = 한국시간 새벽 2:00

---

## STEP 7: 새벽 배치 — 개인화 추천 선생성

**목표:** 매일 새벽 3시(UTC 18:00) 활성 유저(최근 7일, 최대 240명)별 개인화 추천을 Gemini API로 생성해 `user_recommendations` 테이블에 저장한다.

### 파일
| 파일 | 역할 |
|------|------|
| `lib/scoring.js` | `scoreVideo(video, tasteProfile)`, `scoreShorts(video, tasteProfile)` |
| `app/api/batch/generate-recommendations/route.js` | 유저 루프·필터·점수·Gemini·DB 저장 |

### route.js 처리 순서

```
1. CRON_SECRET 검증 → 401
2. 활성 유저 조회: last_active_at 최근 7일, 최대 240명
3. 오늘 video_pool 전체 로드 (collected_date = today)
4. 유저별 순차 처리:
   a. taste_profile 로드
   b. user_subscriptions channel_id Set 조회
   c. 최근 7일 user_recommendations video_id Set 조회
   d. video_pool 필터: 미구독 채널 + 미추천 영상
   e. scoreVideo/scoreShorts로 개인 점수 계산
   f. 상위 추출: 영상 45개, 쇼츠 75개
   g. Gemini 1회 호출 → 영상 30개, 쇼츠 50개 + 문구 생성
   h. user_recommendations INSERT (batch_index)
5. { success: true, usersProcessed: N } 반환
```

### lib/scoring.js 점수 기준

**일반 영상 (100점)**
| 항목 | 배점 | 계산 기준 |
|------|------|-----------|
| 취향 일치도 | 25 | taste_profile.category_weights[category] × 25 |
| 조회수 | 15 | min(view_count / 1_000_000, 1) × 15 |
| 바이럴 속도 | 15 | min(view_count / max(days_since_published, 1) / 100_000, 1) × 15 |
| 댓글율 | 15 | min(comment_count / max(view_count, 1) / 0.005, 1) × 15 |
| 좋아요율 | 10 | min(like_count / max(view_count, 1) / 0.05, 1) × 10 |
| 신선도 | 10 | 7일+10, 30일+7, 90일+3, 그외 0 |
| 키워드 일치 | 10 | (title+tags ∩ search_keywords 수 / 3) × 10, max 10 |

**쇼츠 (100점)**
| 항목 | 배점 | 계산 기준 |
|------|------|-----------|
| 조회수 | 20 | min(view_count / 5_000_000, 1) × 20 |
| 바이럴 속도 | 20 | min(view_count / max(days_since_published, 1) / 500_000, 1) × 20 |
| 취향 일치도 | 15 | category_weights[category] × 15 |
| 댓글율 | 15 | min(comment_count / max(view_count, 1) / 0.001, 1) × 15 |
| 좋아요율 | 10 | min(like_count / max(view_count, 1) / 0.02, 1) × 10 |
| 신선도 | 10 | 7일+10, 30일+7, 90일+3, 그외 0 |
| 분위기 일치 | 10 | shorts_taste_profile 카테고리 포함 시 10, 아니면 0 |

### batch_index 구조
- 영상 30개: 10개씩 → batch_index 0, 1, 2
- 쇼츠 50개: 10개씩 → batch_index 0, 1, 2, 3, 4

### Gemini 프롬프트 구조

```
너는 유튜브 콘텐츠 큐레이터야.
유저의 취향과 후보 영상 목록을 분석해서
일반 영상 30개, 쇼츠 50개를 최종 선별하고 각각 추천 문구를 작성해줘.

[유저 취향]
주요 관심사: {primary_interests}
콘텐츠 스타일: {content_style}
대표 구독 채널: {top_subscriptions}

[후보 영상 목록]
{candidates_json}

[응답 형식 - JSON만]
{
  "videos": [{ "video_id", "recommendation_reason", "hook_message", "vibe_tag" }],
  "shorts": [{ "video_id", "recommendation_reason", "hook_message", "vibe_tag" }]
}
```

### Vercel Cron
```json
{ "path": "/api/batch/generate-recommendations", "schedule": "0 18 * * *" }
```
UTC 18:00 = 한국시간 새벽 3:00

---

## STEP 8: 추천 조회 API

**목표:** 유저가 `/today` 접속 시 오늘의 추천을 반환한다. 캐시(배치 선생성 데이터)가 있으면 즉시 반환, 없으면 실시간 생성 후 반환.

### 파일
- `app/api/recommendations/route.js`

### 처리 순서

```
GET /api/recommendations

1. getServerSession() → 미인증 401
2. users.last_active_at = now() 업데이트
3. 오늘 user_recommendations 조회 (recommended_date = today)

[캐시 히트]
4a. { cached: true, videos, shorts, generated_at } 반환

[캐시 미스 - 신규 유저 / 배치 미처리]
4b. 실시간 생성:
    - video_pool 오늘 데이터 로드
    - 구독 채널 Set + 최근 7일 추천된 영상 Set
    - scoreVideo / scoreShorts 점수 계산
    - 상위 추출: 영상 45개, 쇼츠 75개
    - generateRecommendations() Gemini 호출
    - user_recommendations INSERT (batch_index)
    - { cached: false, videos, shorts, generated_at } 반환
```

### 응답 구조

```json
{
  "cached": true,
  "videos": [...],
  "shorts": [...],
  "generated_at": "2026-05-07T03:00:00Z"
}
```

videos: type=video, batch_index 0~2 (총 30개)
shorts: type=shorts, batch_index 0~4 (총 50개)

### lib 재사용
- `scoreVideo`, `scoreShorts` — lib/scoring.js
- `generateRecommendations` — lib/gemini.js
- `createAdminClient` — lib/supabase.js
- `authOptions` — lib/auth.js

---

## STEP 9: 온보딩 페이지

**목표:** 신규 유저가 로그인 후 거치는 3단계 온보딩을 구현한다. 구독 채널 수집 → 쇼츠 취향 설문 → 완료.

### 파일
| 파일 | 역할 |
|------|------|
| `app/onboarding/page.jsx` | Client Component — 3단계 온보딩 |
| `app/api/complete-onboarding/route.js` | PATCH: onboarding_completed=true + shorts_taste_profile 저장 |

### 디자인 (DESIGN.md Linear 다크 테마)
- 배경: `#08090a` (Pitch Black)
- 카드: `#0f1011` (Graphite), 6px radius
- 텍스트: `#f7f8f8` (Porcelain) 주요, `#8a8f98` (Storm Cloud) 보조
- 선택된 태그/버튼: `#e4f222` (Neon Lime) 배경 + `#08090a` 텍스트
- 미선택 태그: `#383b3f` (Gunmetal) 배경
- Ghost 버튼: 투명 배경 + `#d0d6e0` (Light Steel) 텍스트
- 폰트: Inter Variable

### Step 1 — 구독 채널 수집 로딩
- 전체 화면 중앙 정렬, Pitch Black 배경
- 프로그레스 바 (Neon Lime, 애니메이션)
- 메시지: "취향을 분석하고 있어요 ✨"
- 마운트 즉시 `POST /api/collect-subscriptions` 호출
- 완료 → Step 2 자동 전환

### Step 2 — 쇼츠 취향 설문
**질문1: "주로 보는 쇼츠 유형은?" (복수 선택)**
```
웃긴 영상/밈  요리/레시피  운동/헬스
뷰티/패션     지식/정보    동물/힐링
음악/댄스     게임         패션/스타일
여행          재테크       스포츠
```
**질문2: "선호하는 분위기는?" (단일 선택)**
- 웃기고 가벼운 것
- 유익하고 배우는 것
- 감성적이고 힐링되는 것

**버튼:**
- `[나중에 할게요]` — Ghost 버튼, 기본값으로 저장
- `[완료!]` — Neon Lime 버튼

→ 클릭 시 `PATCH /api/complete-onboarding` 호출 → Step 3

### Step 3 — 완료
- "준비됐어요! 오늘의 추천을 볼게요 🎬"
- 3초 후 `router.push('/today')` 자동 이동

### complete-onboarding API
```
PATCH /api/complete-onboarding
body: { shorts_taste_profile: { categories: [...], vibe: "웃기고 가벼운 것" } }

users.onboarding_completed = true
users.shorts_taste_profile = body.shorts_taste_profile
→ { success: true }
```

---

## STEP 10: /today 메인 페이지

**목표:** 로그인한 유저가 오늘의 추천 영상/쇼츠를 확인하는 메인 피드 페이지를 구현한다.

### 파일
| 파일 | 역할 |
|------|------|
| `app/today/page.jsx` | Client Component — 영상/쇼츠 추천 피드 |
| `app/api/recommendations/route.js` | 수정: video_pool 메타데이터 병합 후 반환 |

### 디자인 (DESIGN.md Linear 다크 테마, 모바일 퍼스트)
- 배경: `#08090a` (Pitch Black)
- 카드 배경: `#0f1011` (Graphite), 6px radius
- 텍스트: `#f7f8f8` (Porcelain) 주요, `#8a8f98` (Storm Cloud) 보조
- hook_message: `#e4f222` (Neon Lime)
- vibe_tag 뱃지: `#23252a` 배경 + Storm Cloud 텍스트, 2px radius
- 탭 활성: Neon Lime 텍스트 + 하단 border
- 스켈레톤: `#161718` → `#23252a` shimmer 애니메이션

### 페이지 구조

```
┌────────────────────────┐
│ 오늘은 이거다      [👤] │  ← 헤더 (sticky): 로고(Neon Lime) + 아바타 이니셜
├────────────────────────┤
│  [영상]      [쇼츠]    │  ← 탭 바 (sticky)
├────────────────────────┤
│  [썸네일 풀 너비]      │
│  제목                  │  ← 카드 (풀 너비)
│  채널 · 조회수         │
│  💡 hook_message       │
│  [#vibe_tag]           │
├────────────────────────┤
│  ... 카드 반복 ...     │
├────────────────────────┤
│  [더 보기 (N개 남음)]  │  ← 배치 단위(10개)로 추가 표시
└────────────────────────┘
```

### 상태 관리 (useState)
| 상태 | 초기값 | 설명 |
|------|--------|------|
| `videos` | `[]` | 영상 추천 목록 |
| `shorts` | `[]` | 쇼츠 추천 목록 |
| `loading` | `true` | 초기 로딩 |
| `error` | `null` | 오류 메시지 |
| `activeTab` | `'video'` | 현재 탭 |
| `videoPage` | `1` | 표시 중인 영상 배치 수 |
| `shortsPage` | `1` | 표시 중인 쇼츠 배치 수 |
| `playingId` | `null` | 현재 인라인 재생 중인 video_id |

### 카드 표시 로직
- `videoPage=1` → `videos.slice(0, 10)` 표시
- "더 보기" 클릭 → `videoPage++` → `videos.slice(0, 20)` 표시
- 전체 표시 시 "더 보기" 숨김
- 쇼츠 탭도 동일 (`shortsPage`)

### 카드 클릭 — 인라인 확장 재생
- 카드 클릭 시 `playingId = video_id` 설정
- 해당 카드의 썸네일 영역이 YouTube iframe 플레이어로 교체됨
- iframe src: `https://www.youtube.com/embed/{video_id}?autoplay=1`
- 카드 테두리 Neon Lime(`#e4f222`)으로 강조
- 카드 하단에 "닫기" 버튼 → `playingId = null`으로 복원
- 다른 카드를 클릭하면 기존 플레이어 닫히고 새 카드 재생
- 탭 전환 시 `playingId = null` 초기화

### 스켈레톤 로딩
- `loading=true` 시 3개 스켈레톤 카드 표시
- shimmer 애니메이션: `#161718` → `#23252a` 좌우 스윕

### API 수정: /api/recommendations route.js
캐시 히트·미스 양쪽 경로 모두, 최종 반환 직전에:
```
1. 반환할 video_id 목록 수집
2. video_pool에서 해당 video_id 배치 조회
   (video_id, title, channel_name, thumbnail_url, duration_sec, view_count)
3. video_id를 키로 Map 생성
4. 추천 행에 merge: { ...rec, title, channel_name, thumbnail_url, duration_sec, view_count }
5. 병합된 배열 반환
```

### 빈 상태
- 추천 없음(video_pool 미수집 등): "아직 오늘의 추천이 준비 중이에요 🌙" 메시지 표시
- 오류: "추천을 불러오지 못했어요. 잠시 후 다시 시도해주세요." + 재시도 버튼

---

## STEP 11: /profile 설정 페이지

**목표:** 로그인한 유저가 AI가 분석한 취향 프로파일을 확인하고, 쇼츠 취향을 수정하고, 로그아웃할 수 있는 설정 페이지를 구현한다.

### 파일
| 파일 | 역할 |
|------|------|
| `app/api/profile/route.js` | GET: taste_profile + shorts_taste_profile 반환 |
| `app/profile/page.jsx` | Client Component — 전체 프로필 UI |
| `app/today/page.jsx` | 수정: 아바타 div → Next.js Link로 /profile 연결 |

### 디자인 (DESIGN.md Linear 다크 테마, 모바일 퍼스트)
- 배경: `#08090a` (Pitch Black)
- 카드: `#0f1011` (Graphite), 6px radius
- 섹션 제목: `#f7f8f8` (Porcelain) 15px weight 600
- 설명 문구: `#8a8f98` (Storm Cloud) 12px
- 막대 바 fill: `#e4f222` (Neon Lime)
- 키워드 칩: `#23252a` 배경 + `#8a8f98` 텍스트, 2px radius
- 저장 버튼: `#e4f222` 배경 + `#08090a` 텍스트
- 로그아웃 버튼: `#23252a` 배경 + `#eb5757` (Warning Red) 텍스트

### 페이지 구조

```
[← 뒤로]                          ← 상단 헤더 (sticky), 클릭 시 router.back()
─────────────────────────────────
[취향 프로파일 카드]
  내 취향 카테고리                  ← 섹션 제목
  구독 채널을 분석해 AI가            ← 설명 문구 (Storm Cloud)
  파악한 취향이에요
  ---
  IT/개발  ████░░░  30%            ← category_weights 내림차순 상위 5개
  요리/자취 ███░░░░  20%
  재테크   ██░░░░░  15%
  운동/헬스 █░░░░░░  10%
  음악     █░░░░░░   8%
  ---
  키워드                           ← 섹션 소제목
  [파이썬] [자취요리] [주식투자]...  ← search_keywords 칩 (최대 10개)

[쇼츠 취향 카드]
  쇼츠 취향 설정                   ← 섹션 제목
  주로 보는 쇼츠 유형?             ← 온보딩 Step2와 동일한 12개 카테고리 칩
  선호 분위기?                     ← 3개 라디오 버튼
  [저장]                           ← Neon Lime CTA 버튼

[계정 관리 카드]
  [로그아웃]                       ← Warning Red 텍스트 버튼
```

### API: GET /api/profile

```
GET /api/profile
→ 인증 없음: 401
→ 성공: {
    taste_profile: { category_weights, primary_interests, content_style, search_keywords, ... },
    shorts_taste_profile: { categories: [...], vibe: "..." }
  }
```

### 취향 프로파일 카드 표시 규칙
- `taste_profile`이 null이면 "아직 취향 분석이 완료되지 않았어요" 메시지 표시
- `category_weights`: Object.entries → value 내림차순 정렬 → 상위 5개 표시
- 막대 바 width: `(value / maxValue) * 100`% (최댓값 기준 normalize, 최대 100%)
- 막대 바 진입 애니메이션: 데이터 로드 완료 후 width 0% → 목표값으로 채워지는 효과
  - `animated` state (boolean, 초기 false), 데이터 로드 후 `setTimeout(() => setAnimated(true), 50)` 실행
  - 막대 fill에 `transition: 'width 0.6s ease-out'` 적용
  - `animated === false`이면 width 0%, true이면 목표 퍼센트
- `search_keywords`: 배열 최대 10개 칩으로 표시

### 쇼츠 취향 카드
- 온보딩 Step 2와 동일한 12개 카테고리 + 3개 분위기
- 초기값: 로드된 `shorts_taste_profile.categories`, `shorts_taste_profile.vibe`
- 저장 클릭: `PATCH /api/complete-onboarding` 재사용
  ```
  body: { shorts_taste_profile: { categories, vibe } }
  ```
- 저장 성공 시 버튼 텍스트 "저장됨 ✓"로 1.5초 표시 후 복원

### 네비게이션
- 헤더 "← 뒤로": `router.back()` 호출
- app/today/page.jsx 아바타: `<Link href="/profile">` 로 래핑

### 상태 관리 (useState)
| 상태 | 초기값 | 설명 |
|------|--------|------|
| `tasteProfile` | `null` | taste_profile 데이터 |
| `shortsCategories` | `[]` | 선택된 쇼츠 카테고리 |
| `shortsVibe` | `''` | 선택된 분위기 |
| `loading` | `true` | 초기 로딩 |
| `saving` | `false` | 저장 중 상태 |
| `saved` | `false` | 저장 완료 피드백 |

---

## STEP 12: 랜딩 페이지

**목표:** 비로그인 유저가 서비스에 처음 진입할 때 보는 랜딩 페이지를 구현한다. Google 로그인으로 바로 진입하는 심플 센터 레이아웃.

### 파일
| 파일 | 역할 |
|------|------|
| `app/page.jsx` | 교체: 랜딩 페이지 Client Component |
| `lib/auth.js` | 수정: `pages: { signIn: '/' }` 추가 |

> `app/page.js` (기존 Next.js 기본 파일)는 삭제하고 `app/page.jsx`로 교체한다.

### 디자인 (DESIGN.md Linear 다크 테마, 모바일 퍼스트)
- 배경: `#08090a` (Pitch Black), 전체 화면 세로 중앙 정렬
- 로고: "오늘은 이거다" `#e4f222` (Neon Lime), 24px weight 700
- 문구: "유명하지만 나만 몰랐던 유튜브, 오늘 발견하세요" `#8a8f98` (Storm Cloud), 14px, 2줄
- CTA 버튼: "Google로 시작하기" — `#e4f222` 배경 + `#08090a` 텍스트, 6px radius, weight 600
- maxWidth: 480px, margin 0 auto

### 동작
- 버튼 클릭: `signIn('google', { callbackUrl: '/today' })`
- 인증 완료 후 미들웨어가 자동 분기:
  - `onboarding_completed = true` → `/today`
  - `onboarding_completed = false` → `/onboarding`
- 인증된 유저가 `/` 방문 → 미들웨어가 `/today`로 즉시 리다이렉트

### lib/auth.js 수정
`authOptions` 객체 마지막에 `pages` 속성 추가:
```js
pages: {
  signIn: '/',
},
```
