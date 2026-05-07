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
