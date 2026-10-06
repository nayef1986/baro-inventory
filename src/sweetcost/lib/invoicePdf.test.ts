import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  invoiceFileName,
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
