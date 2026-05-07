import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// 클라이언트/서버 공용 (anon key - RLS 적용됨)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 서버 API Route 전용 (service_role key - RLS 우회)
// 반드시 서버 컴포넌트 또는 API Route에서만 호출
export function createAdminClient() {
  return createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY)
}
