// ============================================================
// Login.tsx — بوابة دخول واحدة
// ليست نظام مستخدمين: حساب واحد يحمي القاعدة من الوصول العام.
// ============================================================

import { useState } from 'react'

import { authErrorMessage, signIn } from '../lib/supabase.ts'
import { Button, Field } from './UI.tsx'
import { Wordmark } from './Wordmark.tsx'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!email.trim()) return setError('البريد مطلوب.')
    if (!password) return setError('كلمة المرور مطلوبة.')

    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bark p-4 sm:p-6">
      <form
        className="w-full max-w-sm min-w-0 bg-surface border border-line rounded-2xl p-6 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Wordmark className="w-[200px] h-auto text-bark" />

        <Field label="البريد الإلكتروني" htmlFor="lg-email">
          <input
            id="lg-email"
            type="email"
            autoComplete="username"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full min-h-11 px-3 border border-line rounded-xl bg-surface text-[14px] text-ink outline-none focus:border-accent"
          />
        </Field>

        <Field label="كلمة المرور" htmlFor="lg-pass">
          <input
            id="lg-pass"
            type="password"
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full min-h-11 px-3 border border-line rounded-xl bg-surface text-[14px] text-ink outline-none focus:border-accent"
          />
        </Field>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'جاري الدخول…' : 'دخول'}
        </Button>

        {error ? <p className="m-0 text-[13px] text-bad leading-relaxed">{error}</p> : null}

        <p className="m-0 text-[12px] text-muted leading-relaxed border-t border-line pt-3">
          الحساب يُنشأ من لوحة Supabase: Authentication ← Users ← Add user.
        </p>
      </form>
    </div>
  )
}
