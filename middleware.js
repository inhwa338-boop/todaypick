import { getToken } from 'next-auth/jwt'
import { NextResponse } from 'next/server'

export async function middleware(request) {
  const token = await getToken({ req: request })
  const { pathname } = request.nextUrl

  const isProtected = ['/today', '/profile', '/onboarding'].some(
    (path) => pathname === path || pathname.startsWith(path + '/')
  )

  // 비로그인 + 보호된 경로 → /
  if (!token && isProtected) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (token) {
    // /today + 온보딩 미완료 → /onboarding
    if (
      (pathname === '/today' || pathname.startsWith('/today/')) &&
      !token.onboardingCompleted
    ) {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }

    // /onboarding + 온보딩 완료 → /today
    if (
      (pathname === '/onboarding' || pathname.startsWith('/onboarding/')) &&
      token.onboardingCompleted
    ) {
      return NextResponse.redirect(new URL('/today', request.url))
    }

    // / + 온보딩 완료 → /today
    if (pathname === '/' && token.onboardingCompleted) {
      return NextResponse.redirect(new URL('/today', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/today', '/today/:path*', '/profile', '/profile/:path*', '/onboarding', '/onboarding/:path*'],
}
