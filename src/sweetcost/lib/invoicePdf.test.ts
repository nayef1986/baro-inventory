import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  invoiceFileName,
  invoiceSequence,
  invoiceTitle,
  statementFileName,
  statementTitle,
} from './invoicePdf.ts'

test('اسم ملف الفاتورة يحمل اسم المتجر وشهر الإصدار', () => {
  assert.equal(invoiceFileName('COCO CAKE', '2026-10-01'), 'فاتورة COCO CAKE لشهر أكتوبر.pdf')
  assert.equal(invoiceFileName('كوكو كيك', '2026-01-31'), 'فاتورة كوكو كيك لشهر يناير.pdf')
})

test('الشهر من تاريخ الإصدار لا من اليوم', () => {
  // فاتورة سبتمبر تُرسل في أكتوبر — الاسم يبقى سبتمبر
  assert.ok(invoiceFileName('COCO CAKE', '2026-09-28').includes('سبتمبر'))
})

test('اسم ملف الكشف يحمل اسم العميل وشهره', () => {
  assert.equal(statementFileName('مقهى الرصيف', '2026-10'), 'كشف حساب مقهى الرصيف لشهر أكتوبر.pdf')
})

test('المحارف الممنوعة في أسماء الملفات تُحذف', () => {
  assert.equal(statementFileName('مقهى/الرصيف: الفرع*٢', '2026-10'), 'كشف حساب مقهىالرصيف الفرع٢ لشهر أكتوبر.pdf')
})

test('التاريخ غير الصالح لا يكسر الاسم', () => {
  assert.equal(invoiceFileName('COCO CAKE', 'ليس تاريخاً'), 'فاتورة COCO CAKE لشهر.pdf')
})

// ─── العنوان واسم الملف من مصدر واحد ─────────────────────────

test('اسم الملف هو العنوان نفسه زائد الامتداد', () => {
  assert.equal(
    invoiceFileName('COCO CAKE', '2026-10-01'),
    `${invoiceTitle('COCO CAKE', '2026-10-01')}.pdf`,
  )
  assert.equal(
    statementFileName('مقهى الرصيف', '2026-10'),
    `${statementTitle('مقهى الرصيف', '2026-10')}.pdf`,
  )
})

test('العنوان بلا امتداد — ليُكتب في الرسالة كما هو', () => {
  assert.equal(invoiceTitle('COCO CAKE', '2026-10-01'), 'فاتورة COCO CAKE لشهر أكتوبر')
  assert.equal(statementTitle('مقهى الرصيف', '2026-10'), 'كشف حساب مقهى الرصيف لشهر أكتوبر')
})

// ─── التسلسل داخل الشهر ──────────────────────────────────────

function inv(id: string, no: string, on: string) {
  return { id, invoice_no: no, issued_on: on }
}

const OCT = [
  inv('a', 'CC-001', '2026-10-01'),
  inv('b', 'CC-002', '2026-10-09'),
  inv('c', 'CC-003', '2026-10-20'),
  inv('d', 'CC-004', '2026-11-02'), // شهر آخر
]

test('الأولى في الشهر بلا رقم، وما بعدها بالتسلسل', () => {
  assert.equal(invoiceSequence(OCT[0]!, OCT), 1)
  assert.equal(invoiceSequence(OCT[1]!, OCT), 2)
  assert.equal(invoiceSequence(OCT[2]!, OCT), 3)
})

test('كل شهر يبدأ العدّ من جديد', () => {
  assert.equal(invoiceSequence(OCT[3]!, OCT), 1)
})

test('ترتيب المصفوفة لا يغيّر الرقم', () => {
  const shuffled = [OCT[2]!, OCT[0]!, OCT[3]!, OCT[1]!]
  assert.equal(invoiceSequence(OCT[1]!, shuffled), 2)
})

test('الاسم يحمل الرقم من الثانية فصاعداً', () => {
  assert.equal(invoiceFileName('COCO CAKE', '2026-10-09', 1), 'فاتورة COCO CAKE لشهر أكتوبر.pdf')
  assert.equal(invoiceFileName('COCO CAKE', '2026-10-09', 2), 'فاتورة COCO CAKE لشهر أكتوبر 2.pdf')
  assert.equal(invoiceFileName('COCO CAKE', '2026-10-20', 3), 'فاتورة COCO CAKE لشهر أكتوبر 3.pdf')
})
