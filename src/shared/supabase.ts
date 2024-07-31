import { createClient } from '@supabase/supabase-js'
import { Database } from './database.types'

export const supabase = createClient<Database>(
  // @ts-expect-error
  import.meta.env.VITE_SUPABASE_URL,
  // @ts-expect-error
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
