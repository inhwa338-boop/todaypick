import { getServerSession } from 'next-auth'
import { authOptions } from '../../../lib/auth'
import { createAdminClient } from '../../../lib/supabase'

export async function PATCH(request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { shorts_taste_profile } = await request.json()
  const supabaseAdmin = createAdminClient()

  await supabaseAdmin
    .from('users')
    .update({
      onboarding_completed: true,
      shorts_taste_profile: shorts_taste_profile || {},
    })
    .eq('id', session.user.id)

  return Response.json({ success: true })
}
