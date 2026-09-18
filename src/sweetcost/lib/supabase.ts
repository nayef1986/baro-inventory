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

/**
 * بوابة الدخول. مطفأة حالياً بطلب صاحب المتجر: التطبيق يفتح مباشرة
 * بلا حساب. القاعدة عندها مفتوحة للدور anon — الرابط وحده يحميها.
 * لتفعيلها: اجعل القيمة true وشغّل 0005_require_auth.sql.
 */
export const requireAuth =
  (import.meta.env['VITE_SWEETCOST_REQUIRE_AUTH'] as string | undefined) === 'true'

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url as string, key as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
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
  if (e.code === '42501') return 'لا توجد صلاحية للوصول إلى هذا الجدول. تأكد من تسجيل الدخول.'

  const msg = e.message ?? String(error)
  if (msg.includes('Failed to fetch')) return 'تعذّر الاتصال بقاعدة البيانات. تحقّق من الشبكة.'
  return msg
}

// ─── تسجيل الدخول ────────────────────────────────────────────

export async function signIn(email: string, password: string): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const sb = requireClient()
  await sb.auth.signOut()
}

/** رسائل Supabase للمصادقة بالعربية */
export function authErrorMessage(error: unknown): string {
  const e = error as { message?: string }
  const msg = e?.message ?? String(error)
  if (/invalid login credentials/i.test(msg)) return 'البريد أو كلمة المرور غير صحيحة.'
  if (/email not confirmed/i.test(msg)) return 'لم يُفعَّل هذا البريد بعد.'
  if (/rate limit|too many/i.test(msg)) return 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.'
  if (/failed to fetch/i.test(msg)) return 'تعذّر الاتصال. تحقّق من الشبكة.'
  return msg
}
