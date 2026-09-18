// ============================================================
// statement.ts — كشف الحساب الشهري لعميل
//
// الكشف ليس مجموع فواتير الشهر: التاجر قد يدخل الشهر وعليه رصيد
// سابق، وقد يسدّد خلال الشهر فواتير قديمة. فالمعادلة:
//
//     الرصيد الختامي = الرصيد الافتتاحي + فواتير الشهر − المسدَّد خلاله
//
// وهذا ثابت قابل للتحقّق: الختامي يساوي دائماً مجموع المتبقي على
// كل فواتير العميل حتى نهاية الشهر. مُختبَر.
// ============================================================

import type { InvoicePayment, InvoiceTotals, SalesInvoice } from '../types.ts'

/** الفواتير الملغاة والمسودات خارج الحساب كله */
function counts(invoice: SalesInvoice): boolean {
  return invoice.status !== 'cancelled' && invoice.status !== 'draft'
}

export interface StatementLine {
  invoice: SalesInvoice
  total: number
  /** ما سُدِّد على هذه الفاتورة حتى نهاية الفترة */
  paid: number
  balance: number
}

export interface StatementPayment {
  payment: InvoicePayment
  invoiceNo: string
}

export interface Statement {
  from: string
  to: string
  /** ما كان على العميل قبل بداية الفترة */
  opening: number
  /** مجموع فواتير الفترة */
  charges: number
  /** ما سدّده خلال الفترة — على أي فاتورة */
  payments: number
  /** opening + charges − payments */
  closing: number
  lines: StatementLine[]
  paymentRows: StatementPayment[]
}

export function buildStatement({
  invoices,
  totals,
  payments,
  customerId,
  from,
  to,
}: {
  invoices: SalesInvoice[]
  totals: Record<string, InvoiceTotals | undefined>
  payments: InvoicePayment[]
  /** null يعني العميل النقدي */
  customerId: string | null
  from: string
  to: string
}): Statement {
  const mine = invoices.filter((i) => counts(i) && i.customer_id === customerId)
  const mineIds = new Set(mine.map((i) => i.id))
  const minePayments = payments.filter((p) => mineIds.has(p.invoice_id))

  // الافتتاحي: فواتير ما قبل الفترة، ناقص ما سُدِّد عليها قبلها
  let opening = 0
  for (const invoice of mine) {
    if (invoice.issued_on >= from) continue
    opening += totals[invoice.id]?.total ?? 0
  }
  for (const p of minePayments) {
    if (p.paid_on >= from) continue
    opening -= p.amount
  }

  const inRange = mine
    .filter((i) => i.issued_on >= from && i.issued_on <= to)
    .sort((a, b) => a.issued_on.localeCompare(b.issued_on) || a.invoice_no.localeCompare(b.invoice_no))

  const noById = new Map(mine.map((i) => [i.id, i.invoice_no]))

  const lines: StatementLine[] = inRange.map((invoice) => {
    const total = totals[invoice.id]?.total ?? 0
    // ما سُدِّد على هذه الفاتورة حتى نهاية الفترة — لا بعدها
    const paid = minePayments
      .filter((p) => p.invoice_id === invoice.id && p.paid_on <= to)
      .reduce((sum, p) => sum + p.amount, 0)
    return { invoice, total, paid, balance: Math.max(total - paid, 0) }
  })

  const paymentRows: StatementPayment[] = minePayments
    .filter((p) => p.paid_on >= from && p.paid_on <= to)
    .sort((a, b) => a.paid_on.localeCompare(b.paid_on))
    .map((payment) => ({ payment, invoiceNo: noById.get(payment.invoice_id) ?? '' }))

  const charges = lines.reduce((sum, l) => sum + l.total, 0)
  const paymentsTotal = paymentRows.reduce((sum, r) => sum + r.payment.amount, 0)

  return {
    from,
    to,
    opening,
    charges,
    payments: paymentsTotal,
    closing: opening + charges - paymentsTotal,
    lines,
    paymentRows,
  }
}

/** '2026-09' ← { from: '2026-09-01', to: '2026-09-30' } */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const year = y ?? 1970
  const mon = m ?? 1
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  const mm = String(mon).padStart(2, '0')
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, '0')}` }
}

/** '2026-09' ← 'سبتمبر 2026' */
const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[(m ?? 1) - 1] ?? ''} ${y ?? ''}`
}

/** الشهر الحالي بصيغة YYYY-MM */
export function currentMonth(today: string): string {
  return today.slice(0, 7)
}
