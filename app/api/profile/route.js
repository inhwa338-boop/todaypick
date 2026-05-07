import { getServerSession } from 'next-auth'
import { authOptions } from '../../../lib/auth'
import { createAdminClient } from '../../../lib/supabase'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = createAdminClient()
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('taste_profile, shorts_taste_profile')
    .eq('id', session.user.id)
    .single()

  return Response.json({
    taste_profile: user?.taste_profile || null,
    shorts_taste_profile: user?.shorts_taste_profile || null,
  })
}
