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
