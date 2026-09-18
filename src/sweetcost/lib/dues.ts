// ============================================================
// dues.ts — الذمم: حالة السداد وما لك عند العملاء
//
// المصدر الوحيد لأي حكم على سداد فاتورة. لا تُكرَّر هذه القواعد
// في شاشة ولا في SQL.
//
// قاعدة محاسبية ثابتة هنا: **السداد لا يغيّر الإيراد.** الفاتورة
// تدخل المبيعات يوم إصدارها لا يوم قبض ثمنها، وإلا انفصل الربح
// عن التكلفة التي أُنفقت لإنتاجه. الدفعات تجيب عن سؤال مختلف:
// كم لي عند الناس، وكم منه متأخر.
// ============================================================

import type { InvoiceTotals, SalesInvoice } from '../types.ts'

/** ما دون هذا يُعدّ صفراً — فروق التقريب لا تُبقي فاتورة «مستحقة» */
const EPSILON = 0.005

export type PaymentState = 'paid' | 'partial' | 'due' | 'overdue' | 'cancelled' | 'draft'

export interface Due {
  /** الإجمالي المستحق على الفاتورة */
  total: number
  paid: number
  /** المتبقي، ولا ينزل تحت الصفر */
  balance: number
  state: PaymentState
  /** أيام التأخّر عن تاريخ الاستحقاق، أو null إن لم يتأخّر */
  daysLate: number | null
}

/**
 * حالة السداد لفاتورة واحدة.
 * `today` بصيغة YYYY-MM-DD — يُمرَّر لا يُقرأ من الساعة، فتبقى
 * الدالة قابلة للاختبار.
 */
export function dueOf(
  invoice: SalesInvoice,
  totals: InvoiceTotals | undefined,
  today: string,
): Due {
  const total = totals?.total ?? 0
  const paid = totals?.paid ?? 0
  const balance = Math.max(total - paid, 0)

  if (invoice.status === 'cancelled') {
    return { total, paid, balance: 0, state: 'cancelled', daysLate: null }
  }
  if (invoice.status === 'draft') {
    return { total, paid, balance: 0, state: 'draft', daysLate: null }
  }
  if (balance <= EPSILON) {
    return { total, paid, balance: 0, state: 'paid', daysLate: null }
  }

  const late = daysBetween(invoice.due_on, today)
  const overdue = late !== null && late > 0

  return {
    total,
    paid,
    balance,
    state: overdue ? 'overdue' : paid > EPSILON ? 'partial' : 'due',
    daysLate: overdue ? late : null,
  }
}

export interface Receivables {
  /** مجموع ما لم يُقبض بعد */
  outstanding: number
  /** منه ما تجاوز تاريخ استحقاقه */
  overdue: number
  /** عدد الفواتير التي عليها متبقٍّ */
  openCount: number
  overdueCount: number
  /** أقدم فاتورة متأخرة — بأيام التأخّر */
  oldestLateDays: number | null
}

/** تجميع الذمم على كل الفواتير */
export function receivablesOf(
  invoices: SalesInvoice[],
  totalsById: Record<string, InvoiceTotals | undefined>,
  today: string,
): Receivables {
  let outstanding = 0
  let overdue = 0
  let openCount = 0
  let overdueCount = 0
  let oldestLateDays: number | null = null

  for (const invoice of invoices) {
    const due = dueOf(invoice, totalsById[invoice.id], today)
    if (due.balance <= 0) continue

    outstanding += due.balance
    openCount += 1

    if (due.state === 'overdue') {
      overdue += due.balance
      overdueCount += 1
      if (due.daysLate !== null && (oldestLateDays === null || due.daysLate > oldestLateDays)) {
        oldestLateDays = due.daysLate
      }
    }
  }

  return { outstanding, overdue, openCount, overdueCount, oldestLateDays }
}

/** ما لك عند كل عميل، مرتّباً تنازلياً. العملاء بلا متبقٍّ لا يظهرون. */
export function duesByCustomer(
  invoices: SalesInvoice[],
  totalsById: Record<string, InvoiceTotals | undefined>,
  today: string,
): { customerId: string | null; balance: number; overdue: number; count: number }[] {
  const map = new Map<string, { customerId: string | null; balance: number; overdue: number; count: number }>()

  for (const invoice of invoices) {
    const due = dueOf(invoice, totalsById[invoice.id], today)
    if (due.balance <= 0) continue

    const key = invoice.customer_id ?? ''
    const row = map.get(key) ?? { customerId: invoice.customer_id, balance: 0, overdue: 0, count: 0 }
    row.balance += due.balance
    row.count += 1
    if (due.state === 'overdue') row.overdue += due.balance
    map.set(key, row)
  }

  return [...map.values()].sort((a, b) => b.balance - a.balance)
}

/** عدد الأيام بين تاريخ الاستحقاق واليوم. موجب يعني تأخّراً. */
function daysBetween(dueOn: string | null, today: string): number | null {
  if (!dueOn) return null
  const due = Date.parse(`${dueOn.slice(0, 10)}T00:00:00Z`)
  const now = Date.parse(`${today.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(due) || Number.isNaN(now)) return null
  return Math.round((now - due) / 86_400_000)
}

// ─── مدد السداد ──────────────────────────────────────────────

export type TermKey = 'immediate' | 'days7' | 'days15' | 'month' | 'endOfMonth' | 'custom'

export const TERMS: { key: TermKey; label: string }[] = [
  { key: 'immediate', label: 'عند الاستلام' },
  { key: 'days7', label: 'بعد أسبوع' },
  { key: 'days15', label: 'بعد 15 يوم' },
  { key: 'month', label: 'بعد شهر' },
  { key: 'endOfMonth', label: 'نهاية الشهر' },
  { key: 'custom', label: 'تاريخ أحدده' },
]

/**
 * تاريخ الاستحقاق المشتقّ من مدة السداد.
 * `immediate` يعيد null: لا استحقاق مؤجّل، فلا تاريخ.
 * `custom` يعيد null أيضاً — التاريخ يكتبه صاحب المتجر بنفسه.
 */
export function dueDateFor(term: TermKey, issuedOn: string): string | null {
  if (term === 'immediate' || term === 'custom') return null
  if (term === 'days7') return shiftDays(issuedOn, 7)
  if (term === 'days15') return shiftDays(issuedOn, 15)
  if (term === 'month') return shiftMonths(issuedOn, 1)
  return endOfMonth(issuedOn)
}

/** يستنتج المدة من تاريخي الإصدار والاستحقاق — لفتح فاتورة محفوظة */
export function termOf(issuedOn: string, dueOn: string | null): TermKey {
  if (!dueOn) return 'immediate'
  for (const { key } of TERMS) {
    if (key === 'immediate' || key === 'custom') continue
    if (dueDateFor(key, issuedOn) === dueOn) return key
  }
  return 'custom'
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * الشهر التالي بنفس اليوم. 31 يناير + شهر = 28/29 فبراير لا 3 مارس:
 * نضبط اليوم يدوياً لأن setUTCMonth يتجاوز إلى الشهر الذي يليه.
 */
function shiftMonths(iso: string, months: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d.toISOString().slice(0, 10)
}

function endOfMonth(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
}
