# STEP 1: 프로젝트 기본 세팅 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js 14 App Router 프로젝트를 `/Users/inhwa/todaypick`에 세팅하고, 이후 모든 단계에서 사용할 폴더 구조와 환경변수 파일을 준비한다.

**Architecture:** 기존 `todaypick/` 디렉토리 안에서 `create-next-app .`으로 프로젝트를 초기화한다. 추가 패키지를 설치하고, `.env.local`(플레이스홀더 값), 폴더 구조, `vercel.json`을 생성한다. `npm run dev`로 정상 동작을 확인한다.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, NextAuth.js, @supabase/supabase-js, @google/generative-ai, googleapis

---

## 파일 구조 (이 STEP에서 생성되는 파일)

```
todaypick/
├── app/
│   ├── layout.jsx              # create-next-app 기본 생성 (수정)
│   ├── page.jsx                # create-next-app 기본 생성 (수정)
│   ├── globals.css             # create-next-app 기본 생성
│   ├── onboarding/
│   │   └── .gitkeep
│   ├── today/
│   │   └── .gitkeep
│   ├── profile/
│   │   └── .gitkeep
│   └── api/
│       ├── auth/
│       │   └── [...nextauth]/
│       │       └── .gitkeep
│       ├── collect-subscriptions/
│       │   └── .gitkeep
│       ├── recommendations/
│       │   └── .gitkeep
│       └── batch/
│           ├── collect-pool/
│           │   └── .gitkeep
│           └── generate-recommendations/
│               └── .gitkeep
├── lib/
│   ├── supabase.js             # Supabase 클라이언트 (빈 파일)
│   ├── youtube.js              # YouTube API 헬퍼 (빈 파일)
│   ├── gemini.js               # Gemini API 헬퍼 (빈 파일)
│   └── scoring.js              # 점수 계산 로직 (빈 파일)
├── middleware.js               # 빈 파일 (STEP 4에서 구현)
├── .env.local                  # 환경변수 (플레이스홀더)
├── .gitignore                  # .env.local 포함 확인
├── vercel.json                 # Cron 설정
├── next.config.mjs             # create-next-app 기본 생성
├── tailwind.config.js          # create-next-app 기본 생성
├── postcss.config.mjs          # create-next-app 기본 생성
├── package.json
└── DESIGN.md                   # 이미 존재
```

---

## Task 1: Next.js 14 프로젝트 생성

**Files:**
- Modify: `.` (현재 디렉토리에 create-next-app 실행)

- [ ] **Step 1: create-next-app 실행**

```bash
cd /Users/inhwa/todaypick
npx create-next-app@14 . --js --eslint --tailwind --no-src-dir --app --no-import-alias
```

> 실행 중 `DESIGN.md` 파일이 있어서 충돌 경고가 나올 수 있습니다.
> 나오면 `y` 입력 후 Enter (기존 파일은 유지됩니다).

Expected output 마지막 줄:
```
Success! Created todaypick at /Users/inhwa/todaypick
```

- [ ] **Step 2: 생성 결과 확인**

```bash
ls /Users/inhwa/todaypick
```

Expected: `app/  node_modules/  package.json  next.config.mjs  tailwind.config.js  .gitignore` 등이 보여야 함.

- [ ] **Step 3: 개발 서버 첫 실행 확인**

```bash
cd /Users/inhwa/todaypick && npm run dev
```

브라우저에서 `http://localhost:3000` 접속 → Next.js 기본 페이지가 보이면 성공.
확인 후 터미널에서 `Ctrl + C`로 서버 종료.

---

## Task 2: 추가 패키지 설치

**Files:**
- Modify: `package.json` (자동 업데이트)

- [ ] **Step 1: 필수 패키지 설치**

```bash
cd /Users/inhwa/todaypick && npm install next-auth @supabase/supabase-js @google/generative-ai googleapis
```

Expected output 마지막 줄:
```
added XX packages, and audited XXX packages in Xs
```

- [ ] **Step 2: 설치 확인**

```bash
cd /Users/inhwa/todaypick && node -e "require('next-auth'); require('@supabase/supabase-js'); require('@google/generative-ai'); require('googleapis'); console.log('모든 패키지 OK')"
```

Expected:
```
모든 패키지 OK
```

---

## Task 3: .env.local 파일 생성

**Files:**
- Create: `.env.local`

> ⚠️ 이 파일에는 나중에 실제 API 키를 입력합니다.
> 지금은 플레이스홀더(`YOUR_XXX`)로만 생성합니다.

- [ ] **Step 1: .env.local 파일 생성**

```
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

위 내용으로 `/Users/inhwa/todaypick/.env.local` 파일을 생성한다.

- [ ] **Step 2: .gitignore에 .env.local 포함 확인**

```bash
grep ".env.local" /Users/inhwa/todaypick/.gitignore
```

Expected: `.env.local` 또는 `.env*.local` 줄이 출력되어야 함.
없으면 `.gitignore` 파일 맨 아래에 `.env.local` 한 줄 추가.

---

## Task 4: 폴더 구조 생성

**Files:**
- Create: `app/onboarding/`, `app/today/`, `app/profile/`, `app/api/` 하위 폴더들
- Create: `lib/supabase.js`, `lib/youtube.js`, `lib/gemini.js`, `lib/scoring.js`
- Create: `middleware.js`

- [ ] **Step 1: 앱 폴더 구조 생성**

```bash
cd /Users/inhwa/todaypick
mkdir -p app/onboarding
mkdir -p app/today
mkdir -p app/profile
mkdir -p "app/api/auth/[...nextauth]"
mkdir -p app/api/collect-subscriptions
mkdir -p app/api/recommendations
mkdir -p app/api/batch/collect-pool
mkdir -p app/api/batch/generate-recommendations
mkdir -p lib
```

- [ ] **Step 2: lib 헬퍼 파일 생성 (빈 파일)**

`lib/supabase.js`:
```js
// Supabase 클라이언트 - STEP 2에서 구현
```

`lib/youtube.js`:
```js
// YouTube API 헬퍼 - STEP 5에서 구현
```

`lib/gemini.js`:
```js
// Gemini API 헬퍼 - STEP 5에서 구현
```

`lib/scoring.js`:
```js
// 영상 점수 계산 로직 - STEP 7에서 구현
```

- [ ] **Step 3: middleware.js 생성 (빈 파일)**

`middleware.js`:
```js
// 라우팅 보호 미들웨어 - STEP 4에서 구현
export { default } from 'next-auth/middleware';
```

- [ ] **Step 4: 폴더 구조 확인**

```bash
find /Users/inhwa/todaypick/app -type d | sort
find /Users/inhwa/todaypick/lib -type f | sort
```

Expected (app):
```
/Users/inhwa/todaypick/app
/Users/inhwa/todaypick/app/api
/Users/inhwa/todaypick/app/api/auth
/Users/inhwa/todaypick/app/api/auth/[...nextauth]
/Users/inhwa/todaypick/app/api/batch
/Users/inhwa/todaypick/app/api/batch/collect-pool
/Users/inhwa/todaypick/app/api/batch/generate-recommendations
/Users/inhwa/todaypick/app/api/collect-subscriptions
/Users/inhwa/todaypick/app/api/recommendations
/Users/inhwa/todaypick/app/onboarding
/Users/inhwa/todaypick/app/profile
/Users/inhwa/todaypick/app/today
```

Expected (lib):
```
/Users/inhwa/todaypick/lib/gemini.js
/Users/inhwa/todaypick/lib/scoring.js
/Users/inhwa/todaypick/lib/supabase.js
/Users/inhwa/todaypick/lib/youtube.js
```

---

## Task 5: vercel.json 생성

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: vercel.json 생성**

```json
{
  "crons": [
    { "path": "/api/batch/collect-pool", "schedule": "0 17 * * *" },
    { "path": "/api/batch/generate-recommendations", "schedule": "0 18 * * *" }
  ]
}
```

UTC 17:00 = 한국시간 새벽 2:00 (영상 풀 수집)
UTC 18:00 = 한국시간 새벽 3:00 (개인화 추천 생성)

---

## Task 6: 최종 동작 확인 및 커밋

- [ ] **Step 1: 개발 서버 재실행 확인**

```bash
cd /Users/inhwa/todaypick && npm run dev
```

`http://localhost:3000` 접속 → Next.js 기본 페이지 확인.
`Ctrl + C`로 종료.

- [ ] **Step 2: git 초기화 및 첫 커밋**

```bash
cd /Users/inhwa/todaypick
git init
git add .
git status
```

`node_modules/`와 `.env.local`이 **Untracked files에 없어야** 함.
(있으면 `.gitignore` 확인 필요)

```bash
git commit -m "feat: STEP 1 - 프로젝트 기본 세팅 완료"
```

---

## STEP 1 완료 기준 체크리스트

- [ ] `npm run dev` 실행 시 localhost:3000 접속 가능
- [ ] `package.json`에 next-auth, @supabase/supabase-js, @google/generative-ai, googleapis 포함
- [ ] `.env.local` 파일 존재 (플레이스홀더 값)
- [ ] `.gitignore`에 `.env.local` 포함
- [ ] `lib/` 파일 4개 존재
- [ ] `app/api/` 하위 폴더 구조 완성
- [ ] `vercel.json` 존재
- [ ] git 첫 커밋 완료

---

## 다음 단계: STEP 2

Supabase에서 SQL로 DB 테이블 4개 생성 + RLS 설정.
(users, user_subscriptions, video_pool, user_recommendations)
