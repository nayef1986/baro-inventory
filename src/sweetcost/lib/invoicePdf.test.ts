import assert from 'node:assert/strict'
import { test } from 'node:test'

import { invoiceFileName, statementFileName } from './invoicePdf.ts'

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
