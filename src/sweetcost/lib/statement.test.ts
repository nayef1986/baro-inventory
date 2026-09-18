import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildStatement, monthLabel, monthRange } from './statement.ts'
import type { InvoicePayment, InvoiceTotals, SalesInvoice } from '../types.ts'

function inv(id: string, issued: string, customer: string | null = 'c1', status: SalesInvoice['status'] = 'issued'): SalesInvoice {
  return {
    id,
    invoice_no: `CC-${id}`,
    customer_id: customer,
    issued_on: issued,
    due_on: null,
    vat_rate: 0,
    discount: 0,
    status,
    notes: null,
    created_at: '',
    updated_at: '',
  }
}

function tot(id: string, total: number): InvoiceTotals {
  return {
    id,
    subtotal: total,
    discount: 0,
    taxable: total,
    vat_amount: 0,
    total,
    cost: 0,
    line_count: 1,
    paid: 0,
    balance: total,
  }
}

function pay(id: string, invoiceId: string, on: string, amount: number): InvoicePayment {
  return { id, invoice_id: invoiceId, paid_on: on, amount, method: 'cash', note: null, created_at: '' }
}

const SEP = { from: '2026-09-01', to: '2026-09-30' }

// ─── نطاق الشهر ──────────────────────────────────────────────

test('نطاق الشهر يصيب أول يوم وآخره', () => {
  assert.deepEqual(monthRange('2026-09'), SEP)
  assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' })
  assert.deepEqual(monthRange('2024-02'), { from: '2024-02-01', to: '2024-02-29' })
  assert.deepEqual(monthRange('2026-12'), { from: '2026-12-01', to: '2026-12-31' })
})

test('اسم الشهر بالعربية', () => {
  assert.equal(monthLabel('2026-09'), 'سبتمبر 2026')
  assert.equal(monthLabel('2026-01'), 'يناير 2026')
})

// ─── الكشف ───────────────────────────────────────────────────

test('شهر بلا رصيد سابق: الختامي هو فواتير الشهر ناقص المسدَّد', () => {
  const s = buildStatement({
    invoices: [inv('a', '2026-09-05'), inv('b', '2026-09-20')],
    totals: { a: tot('a', 500), b: tot('b', 300) },
    payments: [pay('p1', 'a', '2026-09-10', 200)],
    customerId: 'c1',
    ...SEP,
  })

  assert.equal(s.opening, 0)
  assert.equal(s.charges, 800)
  assert.equal(s.payments, 200)
  assert.equal(s.closing, 600)
  assert.equal(s.lines.length, 2)
  assert.equal(s.paymentRows.length, 1)
})

test('الرصيد السابق يُحسب من فواتير ما قبل الشهر وما سُدِّد عليها قبله', () => {
  const s = buildStatement({
    invoices: [inv('old', '2026-08-15'), inv('a', '2026-09-05')],
    totals: { old: tot('old', 1000), a: tot('a', 400) },
    payments: [pay('p0', 'old', '2026-08-20', 300)],
    customerId: 'c1',
    ...SEP,
  })

  assert.equal(s.opening, 700) // 1000 − 300
  assert.equal(s.charges, 400)
  assert.equal(s.payments, 0)
  assert.equal(s.closing, 1100)
  assert.equal(s.lines.length, 1) // فاتورة أغسطس ليست من بنود الشهر
})

test('سداد فاتورة قديمة خلال الشهر ينزل من الرصيد لا من فواتير الشهر', () => {
  const s = buildStatement({
    invoices: [inv('old', '2026-08-15'), inv('a', '2026-09-05')],
    totals: { old: tot('old', 1000), a: tot('a', 400) },
    payments: [pay('p1', 'old', '2026-09-12', 600)],
    customerId: 'c1',
    ...SEP,
  })

  assert.equal(s.opening, 1000)
  assert.equal(s.charges, 400)
  assert.equal(s.payments, 600)
  assert.equal(s.closing, 800)
  assert.equal(s.paymentRows[0]?.invoiceNo, 'CC-old')
})

test('الختامي يساوي مجموع المتبقي على كل الفواتير — الثابت الأهم', () => {
  const invoices = [inv('old', '2026-08-15'), inv('a', '2026-09-05'), inv('b', '2026-09-22')]
  const totals = { old: tot('old', 1000), a: tot('a', 400), b: tot('b', 250) }
  const payments = [
    pay('p0', 'old', '2026-08-20', 300),
    pay('p1', 'old', '2026-09-12', 200),
    pay('p2', 'a', '2026-09-15', 400),
    pay('p3', 'b', '2026-09-28', 100),
  ]

  const s = buildStatement({ invoices, totals, payments, customerId: 'c1', ...SEP })

  const outstanding = invoices.reduce((sum, i) => {
    const paid = payments.filter((p) => p.invoice_id === i.id).reduce((x, p) => x + p.amount, 0)
    return sum + ((totals[i.id as keyof typeof totals]?.total ?? 0) - paid)
  }, 0)

  assert.equal(s.closing, outstanding)
  assert.equal(s.closing, 650) // 1650 − 1000
})

test('الملغاة والمسودة خارج الكشف كله', () => {
  const s = buildStatement({
    invoices: [
      inv('a', '2026-09-05'),
      inv('x', '2026-09-06', 'c1', 'cancelled'),
      inv('y', '2026-09-07', 'c1', 'draft'),
    ],
    totals: { a: tot('a', 400), x: tot('x', 900), y: tot('y', 800) },
    payments: [],
    customerId: 'c1',
    ...SEP,
  })

  assert.equal(s.charges, 400)
  assert.equal(s.lines.length, 1)
})

test('فواتير عميل آخر لا تدخل كشفه', () => {
  const s = buildStatement({
    invoices: [inv('a', '2026-09-05', 'c1'), inv('b', '2026-09-06', 'c2')],
    totals: { a: tot('a', 400), b: tot('b', 900) },
    payments: [],
    customerId: 'c1',
    ...SEP,
  })

  assert.equal(s.charges, 400)
  assert.equal(s.lines.length, 1)
})

test('العميل النقدي كشف قائم بذاته', () => {
  const s = buildStatement({
    invoices: [inv('a', '2026-09-05', null), inv('b', '2026-09-06', 'c1')],
    totals: { a: tot('a', 400), b: tot('b', 900) },
    payments: [],
    customerId: null,
    ...SEP,
  })

  assert.equal(s.charges, 400)
})

test('دفعة بعد نهاية الشهر لا تُنقص متبقي بنود الشهر', () => {
  const s = buildStatement({
    invoices: [inv('a', '2026-09-05')],
    totals: { a: tot('a', 400) },
    payments: [pay('p1', 'a', '2026-10-03', 400)],
    customerId: 'c1',
    ...SEP,
  })

  assert.equal(s.payments, 0)
  assert.equal(s.lines[0]?.paid, 0)
  assert.equal(s.lines[0]?.balance, 400)
  assert.equal(s.closing, 400)
})

test('البنود مرتّبة بالتاريخ', () => {
  const s = buildStatement({
    invoices: [inv('c', '2026-09-25'), inv('a', '2026-09-02'), inv('b', '2026-09-14')],
    totals: { a: tot('a', 1), b: tot('b', 1), c: tot('c', 1) },
    payments: [],
    customerId: 'c1',
    ...SEP,
  })

  assert.deepEqual(s.lines.map((l) => l.invoice.id), ['a', 'b', 'c'])
})
