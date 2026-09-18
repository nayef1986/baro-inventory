import assert from 'node:assert/strict'
import { test } from 'node:test'

import { draftLineFrom, matchIngredient, normalizeScan } from './invoiceScan.ts'
import type { Ingredient } from '../types.ts'

// ─── تطبيع رد غير موثوق ──────────────────────────────────────

test('الرد السليم يمرّ كما هو', () => {
  const r = normalizeScan({
    invoice_no: 'A-1201',
    purchased_on: '2026-09-18',
    supplier_name: 'مؤسسة الغذاء',
    items: [{ name: 'سكر', quantity: 2, package_size: 25, unit: 'kg', package_price: 100 }],
  })

  assert.equal(r.invoiceNo, 'A-1201')
  assert.equal(r.purchasedOn, '2026-09-18')
  assert.equal(r.supplierName, 'مؤسسة الغذاء')
  assert.deepEqual(r.items, [
    { name: 'سكر', quantity: 2, packageSize: 25, unit: 'kg', packagePrice: 100 },
  ])
})

test('رد ليس كائناً أو بلا بنود لا يكسر شيئاً', () => {
  for (const bad of [null, undefined, 'نص', 42, [], { items: 'ليست مصفوفة' }]) {
    const r = normalizeScan(bad)
    assert.deepEqual(r.items, [])
  }
})

test('الأرقام المكتوبة نصاً تُستخرج', () => {
  const r = normalizeScan({
    items: [{ name: 'دقيق', quantity: '3', package_size: '10 كجم', package_price: '45.50' }],
  })
  assert.equal(r.items[0]?.quantity, 3)
  assert.equal(r.items[0]?.packageSize, 10)
  assert.equal(r.items[0]?.packagePrice, 45.5)
})

test('الفواصل في الأرقام لا تكسر القراءة', () => {
  const r = normalizeScan({ items: [{ name: 'زبدة', package_price: '1,250.75' }] })
  assert.equal(r.items[0]?.packagePrice, 1250.75)
})

test('بند بلا اسم يُسقط — لا يفيد شيئاً', () => {
  const r = normalizeScan({
    items: [{ name: '', package_price: 10 }, { quantity: 5 }, { name: '  ', package_price: 3 }],
  })
  assert.equal(r.items.length, 0)
})

test('سعر العبوة يُشتق من الإجمالي إن غاب', () => {
  const r = normalizeScan({ items: [{ name: 'بيض', quantity: 4, line_total: 52 }] })
  assert.equal(r.items[0]?.packagePrice, 13)
})

test('الكمية المعدومة أو السالبة أو الخيالية تصير عبوة واحدة', () => {
  for (const q of [0, -3, 'صفر', 999_999_999, null]) {
    const r = normalizeScan({ items: [{ name: 'سكر', quantity: q, package_price: 10 }] })
    assert.equal(r.items[0]?.quantity, 1)
  }
})

test('السعر السالب أو الخيالي يصير صفراً لا رقماً مضلّلاً', () => {
  for (const p of [-5, 99_999_999, 'غير معروف']) {
    const r = normalizeScan({ items: [{ name: 'سكر', quantity: 2, package_price: p }] })
    assert.equal(r.items[0]?.packagePrice, 0)
  }
})

test('حجم العبوة غير الصالح يصير null لا صفراً', () => {
  for (const s of [0, -2, 'لا يوجد', null]) {
    const r = normalizeScan({ items: [{ name: 'سكر', package_size: s, package_price: 10 }] })
    assert.equal(r.items[0]?.packageSize, null)
  }
})

test('الوحدة المخترعة تُرفض، والمعروفة تُقبل', () => {
  const ok = normalizeScan({ items: [{ name: 'حليب', unit: 'L', package_price: 1 }] })
  assert.equal(ok.items[0]?.unit, 'l')

  const bad = normalizeScan({ items: [{ name: 'حليب', unit: 'صندوق', package_price: 1 }] })
  assert.equal(bad.items[0]?.unit, null)
})

test('التاريخ غير الصالح يُرفض بدل تمريره', () => {
  for (const d of ['18/09/2026', 'أمس', '2026-13-45', 42, null]) {
    assert.equal(normalizeScan({ purchased_on: d, items: [] }).purchasedOn, null)
  }
  assert.equal(normalizeScan({ purchased_on: '2026-09-18', items: [] }).purchasedOn, '2026-09-18')
})

test('كلمة null نصاً تُعامل فارغة', () => {
  const r = normalizeScan({ invoice_no: 'null', supplier_name: 'NULL', items: [] })
  assert.equal(r.invoiceNo, null)
  assert.equal(r.supplierName, null)
})

// ─── مطابقة المكوّنات ────────────────────────────────────────

function ing(id: string, name: string): Ingredient {
  return {
    id,
    name,
    purchase_unit: 'kg',
    base_unit: 'g',
    package_size: 25000,
    waste_percent: 0,
    supplier_id: null,
    created_at: '',
    updated_at: '',
  }
}

const LIST = [ing('1', 'سكر'), ing('2', 'دقيق فاخر'), ing('3', 'زبدة'), ing('4', 'زبدة نباتية')]

test('المطابقة التامة تصيب', () => {
  assert.equal(matchIngredient('سكر', LIST)?.id, '1')
})

test('المطابقة تتجاوز الهمزات والتشكيل والتاء المربوطة', () => {
  assert.equal(matchIngredient('زُبدَه', LIST)?.id, '3')
  assert.equal(matchIngredient('  سكر  ', LIST)?.id, '1')
})

test('الاحتواء الواضح يصيب', () => {
  assert.equal(matchIngredient('دقيق فاخر 10كجم', LIST)?.id, '2')
})

test('الالتباس لا يُخمَّن — يُترك لصاحب المتجر', () => {
  // «زبدة» تحتملها «زبدة» و«زبدة نباتية» معاً
  assert.equal(matchIngredient('زبدة نبات', LIST), null)
  assert.equal(matchIngredient('شيء غير موجود', LIST), null)
  assert.equal(matchIngredient('', LIST), null)
})

// ─── بناء سطر النموذج ────────────────────────────────────────

test('حجم العبوة المقروء يُقدَّم على المسجّل', () => {
  const line = draftLineFrom(
    { name: 'سكر', quantity: 2, packageSize: 10, unit: 'kg', packagePrice: 45 },
    LIST[0]!,
  )
  assert.deepEqual(line, { ingredientId: '1', quantity: '2', packageSize: '10', packagePrice: '45' })
})

test('غياب الحجم المقروء يُعوَّض من عبوة المكوّن المسجّل', () => {
  const line = draftLineFrom(
    { name: 'سكر', quantity: 1, packageSize: null, unit: null, packagePrice: 100 },
    LIST[0]!,
  )
  assert.equal(line.packageSize, '25') // 25000 جم ← 25 كجم
})

test('بلا مكوّن مطابق تبقى الخانة فارغة ليختار بنفسه', () => {
  const line = draftLineFrom(
    { name: 'شيء', quantity: 3, packageSize: null, unit: null, packagePrice: 12 },
    null,
  )
  assert.equal(line.ingredientId, '')
  assert.equal(line.packageSize, '')
  assert.equal(line.quantity, '3')
})
