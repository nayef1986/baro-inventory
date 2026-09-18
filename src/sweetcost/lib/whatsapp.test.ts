import assert from 'node:assert/strict'
import { test } from 'node:test'

import { invoiceMessage, normalizePhone, whatsappUrl } from './whatsapp.ts'
import { dueOf } from './dues.ts'
import { arabicDays } from './format.ts'
import type { SalesInvoice, SalesInvoiceItem, Settings } from '../types.ts'

// ─── تنسيق الرقم ─────────────────────────────────────────────

test('الرقم المحلي السعودي يصير دولياً', () => {
  assert.equal(normalizePhone('0512345678'), '966512345678')
  assert.equal(normalizePhone('05 123 456 78'), '966512345678')
  assert.equal(normalizePhone('055-123-4567'), '966551234567')
})

test('بلا صفر في البداية يُضاف المفتاح', () => {
  assert.equal(normalizePhone('512345678'), '966512345678')
})

test('الرقم الدولي يبقى كما هو ولا يُفترض سعودياً', () => {
  assert.equal(normalizePhone('+971501234567'), '971501234567')
  assert.equal(normalizePhone('00971501234567'), '971501234567')
  assert.equal(normalizePhone('+966512345678'), '966512345678')
})

test('المكتوب بالمفتاح بلا + يُقبل', () => {
  assert.equal(normalizePhone('966512345678'), '966512345678')
})

test('الفارغ والقصير والمهمل تُرفض بدل إنتاج رابط مكسور', () => {
  assert.equal(normalizePhone(null), null)
  assert.equal(normalizePhone(''), null)
  assert.equal(normalizePhone('   '), null)
  assert.equal(normalizePhone('12345'), null)
  assert.equal(normalizePhone('لا يوجد'), null)
})

test('الرابط يرمّز النص العربي وسطوره', () => {
  const url = whatsappUrl('966512345678', 'سطر\nآخر')
  assert.ok(url.startsWith('https://wa.me/966512345678?text='))
  assert.ok(url.includes('%0A')) // سطر جديد مرمّز
  assert.ok(!url.includes(' '))
})

// ─── نص الرسالة ──────────────────────────────────────────────

const SETTINGS = {
  store_name: 'COCO CAKE',
  store_tagline: 'TART BAKERY',
  store_phone: '0555123456',
  currency: 'ر.س',
} as Settings

function invoice(over: Partial<SalesInvoice> = {}): SalesInvoice {
  return {
    id: 'i1',
    invoice_no: 'CC-2026-001',
    customer_id: 'c1',
    issued_on: '2026-09-18',
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

const ITEMS = [
  {
    id: 'l1',
    invoice_id: 'i1',
    recipe_id: null,
    description: 'تارت',
    unit_label: 'قطعة',
    quantity: 36,
    unit_price: 4,
    unit_cost: 2.18,
    line_total: 144,
    created_at: '',
  },
] as SalesInvoiceItem[]

function totals(total: number, paid: number) {
  return {
    id: 'i1',
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

test('رسالة فاتورة عليها متبقٍّ تُبرز المبلغ وتاريخ الاستحقاق', () => {
  const inv = invoice({ due_on: '2026-09-11' })
  const due = dueOf(inv, totals(540, 200), '2026-09-18')
  const text = invoiceMessage({
    invoice: inv,
    items: ITEMS,
    due,
    settings: SETTINGS,
    customerName: 'مقهى الرصيف',
  })

  assert.ok(text.includes('CC-2026-001'))
  assert.ok(text.includes('مقهى الرصيف'))
  assert.ok(text.includes('تارت'))
  assert.ok(text.includes('المتبقي'))
  assert.ok(text.includes('340.00'))
  assert.ok(text.includes('مضى عليه 7 أيام'))
  assert.ok(!text.includes('تم السداد بالكامل'))
})

test('رسالة فاتورة مسدَّدة تشكر ولا تطالب بشيء', () => {
  const inv = invoice()
  const due = dueOf(inv, totals(540, 540), '2026-09-18')
  const text = invoiceMessage({
    invoice: inv,
    items: ITEMS,
    due,
    settings: SETTINGS,
    customerName: null,
  })

  assert.ok(text.includes('تم السداد بالكامل'))
  assert.ok(!text.includes('المتبقي'))
})

test('بلا دفعات لا يظهر سطر المدفوع', () => {
  const inv = invoice()
  const due = dueOf(inv, totals(540, 0), '2026-09-18')
  const text = invoiceMessage({ invoice: inv, items: ITEMS, due, settings: SETTINGS, customerName: null })
  assert.ok(!text.includes('المدفوع'))
  assert.ok(text.includes('المتبقي'))
})

// ─── تمييز العدد ─────────────────────────────────────────────

test('صياغة الأيام تتبع تمييز العدد في العربية', () => {
  assert.equal(arabicDays(1), 'يوم واحد')
  assert.equal(arabicDays(2), 'يومين')
  assert.equal(arabicDays(3), '3 أيام')
  assert.equal(arabicDays(10), '10 أيام')
  assert.equal(arabicDays(11), '11 يوماً')
  assert.equal(arabicDays(45), '45 يوماً')
})
