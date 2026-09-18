import assert from 'node:assert/strict'
import { test } from 'node:test'

import { dueOf, duesByCustomer, receivablesOf } from './dues.ts'
import type { InvoiceTotals, SalesInvoice } from '../types.ts'

const TODAY = '2026-09-18'

function invoice(over: Partial<SalesInvoice> = {}): SalesInvoice {
  return {
    id: 'i1',
    invoice_no: 'CC-2026-001',
    customer_id: 'c1',
    issued_on: '2026-09-01',
    due_on: null,
    vat_rate: 0,
    discount: 0,
    status: 'issued',
    notes: null,
    created_at: '',
    updated_at: '',
    ...over,
  }
}

function totals(total: number, paid: number, id = 'i1'): InvoiceTotals {
  return {
    id,
    subtotal: total,
    discount: 0,
    taxable: total,
    vat_amount: 0,
    total,
    cost: 0,
    line_count: 1,
    paid,
    balance: total - paid,
  }
}

// ─── حالة السداد ─────────────────────────────────────────────

test('فاتورة بلا دفعات ولا تاريخ استحقاق: آجلة بكامل المبلغ', () => {
  const d = dueOf(invoice(), totals(540, 0), TODAY)
  assert.equal(d.state, 'due')
  assert.equal(d.balance, 540)
  assert.equal(d.daysLate, null)
})

test('دفعة جزئية: الحالة «جزئي» والمتبقي هو الفرق', () => {
  const d = dueOf(invoice(), totals(540, 200), TODAY)
  assert.equal(d.state, 'partial')
  assert.equal(d.balance, 340)
})

test('سداد كامل: مدفوعة والمتبقي صفر', () => {
  const d = dueOf(invoice(), totals(540, 540), TODAY)
  assert.equal(d.state, 'paid')
  assert.equal(d.balance, 0)
})

test('دفعة زائدة لا تجعل المتبقي سالباً', () => {
  const d = dueOf(invoice(), totals(540, 600), TODAY)
  assert.equal(d.state, 'paid')
  assert.equal(d.balance, 0)
})

test('فرق تقريب أقل من نصف هللة يُعدّ سداداً كاملاً', () => {
  const d = dueOf(invoice(), totals(540, 539.998), TODAY)
  assert.equal(d.state, 'paid')
})

test('تجاوز تاريخ الاستحقاق: متأخرة، وتُحسب أيام التأخّر', () => {
  const d = dueOf(invoice({ due_on: '2026-09-11' }), totals(540, 0), TODAY)
  assert.equal(d.state, 'overdue')
  assert.equal(d.daysLate, 7)
})

test('تاريخ الاستحقاق اليوم: ليست متأخرة بعد', () => {
  const d = dueOf(invoice({ due_on: TODAY }), totals(540, 0), TODAY)
  assert.equal(d.state, 'due')
  assert.equal(d.daysLate, null)
})

test('متأخرة مع دفعة جزئية تبقى «متأخرة» لا «جزئي»', () => {
  const d = dueOf(invoice({ due_on: '2026-09-10' }), totals(540, 200), TODAY)
  assert.equal(d.state, 'overdue')
  assert.equal(d.balance, 340)
})

test('الملغاة والمسودة لا يترتّب عليهما شيء', () => {
  for (const status of ['cancelled', 'draft'] as const) {
    const d = dueOf(invoice({ status }), totals(540, 0), TODAY)
    assert.equal(d.state, status)
    assert.equal(d.balance, 0)
  }
})

// ─── تجميع الذمم ─────────────────────────────────────────────

test('الذمم تجمع المتبقي وتفصل المتأخر عنه', () => {
  const invoices = [
    invoice({ id: 'a', due_on: '2026-09-10' }),
    invoice({ id: 'b', due_on: '2026-09-30' }),
    invoice({ id: 'c' }),
    invoice({ id: 'd', status: 'cancelled' }),
  ]
  const map = {
    a: totals(540, 200, 'a'),
    b: totals(300, 0, 'b'),
    c: totals(120, 120, 'c'),
    d: totals(900, 0, 'd'),
  }

  const r = receivablesOf(invoices, map, TODAY)
  assert.equal(r.outstanding, 640) // 340 + 300
  assert.equal(r.overdue, 340)
  assert.equal(r.openCount, 2)
  assert.equal(r.overdueCount, 1)
  assert.equal(r.oldestLateDays, 8)
})

test('الملغاة لا تدخل الذمم ولو لم تُسدَّد', () => {
  const r = receivablesOf([invoice({ status: 'cancelled' })], { i1: totals(900, 0) }, TODAY)
  assert.equal(r.outstanding, 0)
  assert.equal(r.openCount, 0)
})

test('الذمم لكل عميل مرتّبة تنازلياً، وبلا من سدّد', () => {
  const invoices = [
    invoice({ id: 'a', customer_id: 'c1' }),
    invoice({ id: 'b', customer_id: 'c2', due_on: '2026-09-01' }),
    invoice({ id: 'c', customer_id: 'c1' }),
    invoice({ id: 'd', customer_id: 'c3' }),
  ]
  const map = {
    a: totals(100, 0, 'a'),
    b: totals(900, 100, 'b'),
    c: totals(250, 50, 'c'),
    d: totals(400, 400, 'd'),
  }

  const rows = duesByCustomer(invoices, map, TODAY)
  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows.map((r) => [r.customerId, r.balance, r.overdue, r.count]),
    [
      ['c2', 800, 800, 1],
      ['c1', 300, 0, 2],
    ],
  )
})
