// ============================================================
// UI.tsx — عناصر الواجهة المشتركة
// ============================================================

import type { ChangeEvent, ReactNode } from 'react'

// ─── بطاقات وعناوين ──────────────────────────────────────────

export function Card({
  children,
  className = '',
  pad = true,
}: {
  children: ReactNode
  className?: string
  pad?: boolean
}) {
  return (
    <section
      className={`bg-surface border border-line rounded-2xl ${pad ? 'p-4 sm:p-5' : ''} ${className}`}
    >
      {children}
    </section>
  )
}

export function CardTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div>
        <h2 className="m-0 text-[17px] font-bold">{title}</h2>
        {subtitle ? <p className="m-0 mt-1 text-[12.5px] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display m-0 text-[28px] sm:text-[34px] font-bold leading-tight">{title}</h1>
        {subtitle ? <p className="m-0 mt-1 text-[13px] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  )
}

// ─── أزرار ───────────────────────────────────────────────────

type ButtonProps = {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  disabled?: boolean
  className?: string
  title?: string
}

const BUTTON_STYLES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent text-white hover:bg-accent-dark border border-transparent',
  secondary: 'bg-surface text-ink border border-line hover:bg-sand',
  ghost: 'bg-transparent text-accent border border-transparent hover:bg-sand',
  danger: 'bg-bad-soft text-bad border border-transparent hover:bg-bad hover:text-white',
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled = false,
  className = '',
  title,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`min-h-11 px-4 rounded-xl text-[14px] font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${BUTTON_STYLES[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

// ─── أزرار الإجراءات في صفوف الجداول ─────────────────────────
//
// إطار واحد مقسّم بفواصل: الأزرار تُقرأ كمجموعة مرتّبة لا كنصوص
// متناثرة، ولكل خانة رمز واسم تحته فلا لبس في وظيفتها.
//
// المقاسات مضبوطة على 44 بكسل ارتفاعاً — الحدّ الأدنى المريح
// للضغط بالإصبع، لا أكبر. تكبيرها يبتلع عرض الصف بلا فائدة.

export function ActionGroup({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex rounded-xl border border-line overflow-hidden bg-surface divide-x divide-line rtl:divide-x-reverse">
      {children}
    </div>
  )
}

export function ActionButton({
  icon,
  label,
  onClick,
  tone = 'normal',
  disabled = false,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  tone?: 'normal' | 'danger'
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex flex-col items-center justify-center gap-0.5 min-w-[50px] px-2 py-1 min-h-11 cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
        tone === 'danger' ? 'text-bad hover:bg-bad-soft' : 'text-soft hover:bg-sand hover:text-ink'
      }`}
    >
      {icon}
      <span className="text-[10px] font-semibold leading-none">{label}</span>
    </button>
  )
}

const actionIcon = (paths: ReactNode) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths}
  </svg>
)

export const ACTION_ICONS = {
  print: actionIcon(
    <>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v7H6z" />
    </>,
  ),
  paid: actionIcon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>,
  ),
  unpaid: actionIcon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </>,
  ),
  whatsapp: actionIcon(
    <>
      <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.7-5.2A8.5 8.5 0 1 1 21 11.5z" />
      <path d="M8.8 8.2c.2-.5.4-.5.7-.5h.5c.2 0 .4 0 .6.5l.7 1.6c.1.3 0 .5-.1.7l-.4.5c-.1.2-.2.3 0 .6a6 6 0 0 0 2.6 2.2c.3.1.4 0 .6-.1l.5-.6c.2-.2.4-.2.6-.1l1.5.8c.3.2.4.3.4.5 0 .3-.2.9-.4 1.1-.3.3-1 .6-1.5.6-1 0-2.6-.7-3.9-1.8a9 9 0 0 1-2.4-3.2c-.3-.7-.4-1.4-.4-1.9 0-.4.2-.9.4-1.2z" />
    </>,
  ),
  edit: actionIcon(
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>,
  ),
  remove: actionIcon(
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5M14 11v5" />
    </>,
  ),
}

// ─── حقول الإدخال ────────────────────────────────────────────

const FIELD_CLASS =
  'w-full min-h-11 px-3 border border-line rounded-xl bg-surface text-[14px] text-ink outline-none focus:border-accent'

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="block text-[12px] text-muted mb-1.5">
        {label}
      </label>
      {children}
      {error ? (
        <p className="m-0 mt-1 text-[11.5px] text-bad">{error}</p>
      ) : hint ? (
        <p className="m-0 mt-1 text-[11.5px] text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'text' | 'date' | 'search' | 'tel'
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      className={FIELD_CLASS}
    />
  )
}

export function NumberInput({
  id,
  value,
  onChange,
  step = 'any',
  min = 0,
  placeholder,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  step?: string
  min?: number
  placeholder?: string
}) {
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      value={value}
      placeholder={placeholder}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      className={`${FIELD_CLASS} num`}
    />
  )
}

export function Select<T extends string>({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string
  value: T | ''
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  placeholder?: string
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value as T)}
      className={FIELD_CLASS}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function ReadOnlyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="block text-[12px] text-muted mb-1.5">{label}</span>
      <div className="min-h-11 flex items-center px-3 border border-line rounded-xl bg-sand text-[15px] font-bold num">
        {children}
      </div>
    </div>
  )
}

// ─── جداول ───────────────────────────────────────────────────

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2.5 text-right text-[11.5px] font-semibold text-muted border-y border-line bg-cream ${className}`}
    >
      {children}
    </th>
  )
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <td className={`px-3 py-3 text-right text-[13.5px] border-b border-line-soft ${className}`}>
      {children}
    </td>
  )
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">{children}</table>
    </div>
  )
}

// ─── شارات وحالات ────────────────────────────────────────────

export function Pill({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'neutral'; children: ReactNode }) {
  const styles = {
    good: 'bg-good-soft text-good',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-bad-soft text-bad',
    neutral: 'bg-line-soft text-soft',
  }
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-[11.5px] font-semibold ${styles[tone]}`}>
      {children}
    </span>
  )
}

export function StatTile({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: string
  value: string
  note?: string
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
}) {
  const valueTone =
    tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink'
  return (
    <div className="flex-1 min-w-0 bg-surface border border-line rounded-2xl p-4">
      <div className="text-[12.5px] text-muted">{label}</div>
      <div className={`mt-1.5 text-[24px] font-bold num leading-tight ${valueTone}`}>{value}</div>
      {note ? <div className="mt-1.5 text-[12px] text-muted">{note}</div> : null}
    </div>
  )
}

export function ProgressBar({ percent, className = '' }: { percent: number; className?: string }) {
  const width = Math.max(0, Math.min(100, percent))
  return (
    <div className={`h-2.5 bg-line-soft rounded-full overflow-hidden ${className}`}>
      <div className="h-full bg-accent rounded-full transition-[width]" style={{ width: `${width}%` }} />
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-10 px-4 text-center">
      <p className="m-0 text-[15px] font-semibold text-soft">{title}</p>
      {hint ? <p className="m-0 mt-2 text-[13px] text-muted leading-relaxed">{hint}</p> : null}
    </div>
  )
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 bg-bad-soft border border-bad/25 rounded-xl px-4 py-3"
    >
      <span className="text-[13.5px] leading-relaxed text-bad flex-1">{message}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="إخفاء التنبيه"
          className="min-h-11 min-w-11 -my-3 text-bad cursor-pointer bg-transparent border-0"
        >
          ✕
        </button>
      ) : null}
    </div>
  )
}

export function Spinner({ label = 'جاري التحميل…' }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted">
      <div className="w-8 h-8 border-2 border-line border-t-accent rounded-full animate-spin" />
      <p className="m-0 text-[14px]">{label}</p>
    </div>
  )
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 bg-bark/50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="bg-surface w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line sticky top-0 bg-surface">
          <h2 className="m-0 text-[17px] font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="min-h-11 min-w-11 text-muted cursor-pointer bg-transparent border-0 text-[18px]"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="px-5 py-4 border-t border-line flex justify-end gap-2 sticky bottom-0 bg-surface">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
