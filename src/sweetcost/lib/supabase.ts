// ============================================================
// supabase.ts — عميل قاعدة البيانات
//
// الإعداد عبر متغيرات البيئة (ملف .env.local):
//   VITE_SWEETCOST_SUPABASE_URL=https://xxxx.supabase.co
//   VITE_SWEETCOST_SUPABASE_ANON_KEY=eyJ...
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env['VITE_SWEETCOST_SUPABASE_URL'] as string | undefined
const key = import.meta.env['VITE_SWEETCOST_SUPABASE_ANON_KEY'] as string | undefined

export const isConfigured = Boolean(url && key)

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url as string, key as string, { auth: { persistSession: false } })
  : null

/** يرمي رسالة عربية واضحة بدل انهيار صامت */
export function requireClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'قاعدة البيانات غير مهيأة. أضف VITE_SWEETCOST_SUPABASE_URL و VITE_SWEETCOST_SUPABASE_ANON_KEY في ملف .env.local ثم أعد التشغيل.',
    )
  }
  return supabase
}

/** يحوّل خطأ Supabase إلى رسالة يفهمها المستخدم */
export function dbErrorMessage(error: unknown): string {
  if (!error) return 'خطأ غير معروف'
  const e = error as { message?: string; code?: string; details?: string; hint?: string }

  if (e.code === '23505') return 'هذا السجل موجود مسبقاً.'
  if (e.code === '23503') return 'لا يمكن الحذف: هناك سجلات مرتبطة بهذا العنصر.'
  if (e.code === '23514') return 'قيمة غير مقبولة — راجع الأرقام المدخلة.'
  if (e.code === '42P01') return 'الجداول غير موجودة. شغّل ملف supabase/migrations/0001_sweet_cost.sql أولاً.'
  if (e.code === '42501') return 'لا توجد صلاحية للوصول إلى هذا الجدول.'

  const msg = e.message ?? String(error)
  if (msg.includes('Failed to fetch')) return 'تعذّر الاتصال بقاعدة البيانات. تحقّق من الشبكة.'
  return msg
}
