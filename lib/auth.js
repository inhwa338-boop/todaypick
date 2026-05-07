import GoogleProvider from 'next-auth/providers/google'
import { createAdminClient } from './supabase'

async function refreshAccessToken(token) {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }),
    })

    const refreshed = await response.json()
    if (!response.ok) throw refreshed

    const newExpires = Date.now() + refreshed.expires_in * 1000

    const supabaseAdmin = createAdminClient()
    await supabaseAdmin
      .from('users')
      .update({
        access_token: refreshed.access_token,
        token_expires_at: new Date(newExpires).toISOString(),
      })
      .eq('id', token.userId)

    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: newExpires,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    }
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' }
  }
}

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/youtube.readonly',
          ].join(' '),
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.accessTokenExpires = account.expires_at * 1000
        token.googleId = account.providerAccountId

        const supabaseAdmin = createAdminClient()
        const { data: existingUser } = await supabaseAdmin
          .from('users')
          .select('id, onboarding_completed')
          .eq('google_id', token.googleId)
          .single()

        if (existingUser) {
          token.userId = existingUser.id
          token.onboardingCompleted = existingUser.onboarding_completed
          await supabaseAdmin
            .from('users')
            .update({
              last_login_at: new Date().toISOString(),
              last_active_at: new Date().toISOString(),
              access_token: account.access_token,
              token_expires_at: new Date(account.expires_at * 1000).toISOString(),
            })
            .eq('id', existingUser.id)
        } else {
          const { data: newUser } = await supabaseAdmin
            .from('users')
            .insert({
              google_id: token.googleId,
              email: profile.email,
              name: profile.name,
              avatar_url: profile.picture,
              access_token: account.access_token,
              refresh_token: account.refresh_token,
              token_expires_at: new Date(account.expires_at * 1000).toISOString(),
              onboarding_completed: false,
              last_login_at: new Date().toISOString(),
              last_active_at: new Date().toISOString(),
            })
            .select('id, onboarding_completed')
            .single()

          if (newUser) {
            token.userId = newUser.id
            token.onboardingCompleted = false
          }
        }
        return token
      }

      if (Date.now() < token.accessTokenExpires) {
        return token
      }

      return refreshAccessToken(token)
    },

    async session({ session, token }) {
      session.user.id = token.userId
      session.user.onboarding_completed = token.onboardingCompleted
      return session
    },
  },
  // pages.signIn은 STEP 12 랜딩 페이지 구현 후 추가
}
