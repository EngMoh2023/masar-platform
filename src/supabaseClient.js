import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'تنبيه: لم يتم ضبط متغيرات Supabase في ملف .env — راجع README.md لمعرفة طريقة الإعداد.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
