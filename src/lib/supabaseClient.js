import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://gqfzbmvctuxmakqxrrri.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'GANTI_DENGAN_SUPABASE_PUBLISHABLE_KEY_ANDA'

// Cek apakah Supabase Anon Key sudah diatur dengan kredensial asli
export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseAnonKey.includes('GANTI_DENGAN')
)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
