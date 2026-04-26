import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL  as string
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, key)

/** Tabla evaluaciones_campo en schema siembra */
export const evalTable = () =>
  supabase.schema('siembra').from('evaluaciones_campo')
