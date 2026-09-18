// ============================================================
// format.ts — تنسيق الأرقام والتواريخ للعرض العربي
// ============================================================

import { round } from './cost.ts'

const nf = (min: number, max: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max })

const money2 = nf(2, 2)
const plain0 = nf(0, 0)
const qty = nf(0, 3)

/** مبلغ بريالين عشريين: 1,234.50 */
export function money(value: number): string {
  return money2.format(round(value, 2))
}

/** مبلغ مع العملة */
export function moneyWithUnit(value: number, currency = 'ر.س'): string {
  return `${money(value)} ${currency}`
}

/** سعر وحدة صغير جداً — 4 خانات حتى لا يظهر 0.00 */
export function unitPrice(value: number): string {
  return nf(4, 4).format(round(value, 4))
}

/** عدد صحيح: 12,450 */
export function integer(value: number): string {
  return plain0.format(Math.round(value))
}

/** كمية قد تكون كسرية: 1,060 أو 2.5 */
export function quantity(value: number): string {
  return qty.format(round(value, 3))
}

/** نسبة مئوية: 63.7% */
export function percent(value: number, decimals = 1): string {
  return `${nf(decimals, decimals).format(round(value, decimals))}%`
}

/** نسبة تغيّر بإشارة: +8.4% / −3.1% / — */
export function signedPercent(value: number | null, decimals = 1): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${nf(decimals, decimals).format(Math.abs(round(value, decimals)))}%`
}

/** فرق كمية بإشارة: +200 / −20 */
export function signedQuantity(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${qty.format(Math.abs(round(value, 3)))}`
}

/** مبلغ بإشارة: +1.62 / −0.84 */
export function signedMoney(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${money(Math.abs(value))}`
}

const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

/** 2026-09-17 ← 17 سبتمبر 2026 */
export function arabicDate(iso: string): string {
  const d = parseISO(iso)
  if (!d) return iso
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()] ?? ''} ${d.getFullYear()}`
}

/** 2026-09-17 ← 17 سبتمبر */
export function arabicDateShort(iso: string): string {
  const d = parseISO(iso)
  if (!d) return iso
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()] ?? ''}`
}

/** 2026-09-17 ← 6 ربيع الأول 1448 — يُستعمل في ترويسة الفاتورة */
export function hijriDate(iso: string): string {
  const d = parseISO(iso)
  if (!d) return ''
  try {
    // nu-latn: أرقام لاتينية كبقية الفاتورة، لا هندية
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d)
  } catch {
    // متصفّح بلا دعم للتقويم الهجري — نتجاهل السطر بدل كسر الفاتورة
    return ''
  }
}

function parseISO(iso: string): Date | null {
  if (!iso) return null
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** تاريخ اليوم بصيغة YYYY-MM-DD بالتوقيت المحلي */
export function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
