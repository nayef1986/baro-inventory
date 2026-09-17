// ============================================================
// cost.test.ts — اختبار محرك التكلفة
// السيناريو المطلوب في مواصفات النظام، رقماً برقم.
// التشغيل: npm test
// ============================================================

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  baseUnitCost,
  effectiveUnitCost,
  ingredientCost,
  profitOf,
  recipeCost,
  round,
  changePercent,
} from './cost.ts'
import { toBase, unitsFor } from './units.ts'

// ─── 1. سعر الجرام من عبوة ───────────────────────────────────

test('سكر: عبوة 25 كجم بسعر 100 ← 0.004 ر.س للجرام', () => {
  const sugar = { packagePrice: 100, packageSize: 25_000, wastePercent: 0 }
  assert.equal(baseUnitCost(sugar), 0.004)
})

test('شوكولاتة: عبوة 5 كجم بسعر 200 ← 0.04 ر.س للجرام', () => {
  const choc = { packagePrice: 200, packageSize: 5_000, wastePercent: 0 }
  assert.equal(baseUnitCost(choc), 0.04)
})

// ─── 2. الوصفة تستخدم 500 جم سكر ─────────────────────────────

test('وصفة بـ500 جم سكر ← 2.00 ر.س', () => {
  const sugar = { packagePrice: 100, packageSize: 25_000, wastePercent: 0 }
  assert.equal(ingredientCost(sugar, 500, 'g', 'g'), 2)
})

// ─── 3. تغيّر السعر إلى 125 يغيّر تكلفة الوصفة تلقائياً ───────

test('رفع سعر السكر إلى 125 ← تكلفة نفس الوصفة تصير 2.50', () => {
  const before = { packagePrice: 100, packageSize: 25_000, wastePercent: 0 }
  const after = { packagePrice: 125, packageSize: 25_000, wastePercent: 0 }

  assert.equal(ingredientCost(before, 500, 'g', 'g'), 2)
  assert.equal(ingredientCost(after, 500, 'g', 'g'), 2.5)
  assert.equal(round(changePercent(2.5, 2) ?? 0, 1), 25)
})

// ─── 4. منطق الهدر ───────────────────────────────────────────

test('كريمة: 1 لتر بـ20 ر.س، الوصفة 250 مل ← 5.00 بدون هدر', () => {
  const cream = { packagePrice: 20, packageSize: 1_000, wastePercent: 0 }
  assert.equal(ingredientCost(cream, 250, 'ml', 'ml'), 5)
})

test('هدر 10% يرفع التكلفة الفعلية بمقدار 1/(1−0.10)', () => {
  const cream = { packagePrice: 20, packageSize: 1_000, wastePercent: 10 }
  assert.equal(round(effectiveUnitCost(cream), 6), round(0.02 / 0.9, 6))
  assert.equal(round(ingredientCost(cream, 250, 'ml', 'ml') ?? 0, 4), 5.5556)
})

test('هدر 0% لا يغيّر شيئاً', () => {
  const basis = { packagePrice: 50, packageSize: 1_000, wastePercent: 0 }
  assert.equal(effectiveUnitCost(basis), baseUnitCost(basis))
})

// ─── 5. تحويل الوحدات ────────────────────────────────────────

test('تحويل الوحدات: كجم←جرام، لتر←مل', () => {
  assert.equal(toBase(2, 'kg', 'g'), 2_000)
  assert.equal(toBase(1.5, 'l', 'ml'), 1_500)
  assert.equal(toBase(3, 'piece', 'piece'), 3)
})

test('وحدة غير متوافقة تُرفض بدل أن تُحسب خطأ', () => {
  assert.equal(toBase(1, 'l', 'g'), null)
  assert.equal(ingredientCost({ packagePrice: 1, packageSize: 1, wastePercent: 0 }, 1, 'l', 'g'), null)
  assert.deepEqual(unitsFor('g'), ['kg', 'g'])
  assert.deepEqual(unitsFor('piece'), ['piece'])
})

// ─── 6. وصفة كاملة: كيكة شوكولاتة ────────────────────────────

const flour = { packagePrice: 45, packageSize: 10_000, wastePercent: 3 }
const sugar = { packagePrice: 120, packageSize: 25_000, wastePercent: 2 }
const choc = { packagePrice: 200, packageSize: 5_000, wastePercent: 5 }
const cream = { packagePrice: 20, packageSize: 1_000, wastePercent: 4 }

const cakeLines = [
  { ingredientId: 'flour', quantity: 500, unit: 'g' as const, baseUnit: 'g' as const, basis: flour },
  { ingredientId: 'sugar', quantity: 300, unit: 'g' as const, baseUnit: 'g' as const, basis: sugar },
  { ingredientId: 'choc', quantity: 200, unit: 'g' as const, baseUnit: 'g' as const, basis: choc },
  { ingredientId: 'cream', quantity: 250, unit: 'ml' as const, baseUnit: 'ml' as const, basis: cream },
]

test('كيكة شوكولاتة: إجمالي التكلفة وتكلفة القطعة', () => {
  const r = recipeCost(cakeLines, 8)

  assert.equal(round(r.lines[0]!.cost, 2), 2.32) // دقيق
  assert.equal(round(r.lines[1]!.cost, 2), 1.47) // سكر
  assert.equal(round(r.lines[2]!.cost, 2), 8.42) // شوكولاتة
  assert.equal(round(r.lines[3]!.cost, 2), 5.21) // كريمة

  assert.equal(round(r.total, 2), 17.42)
  assert.equal(round(r.perUnit, 2), 2.18)
  assert.equal(r.incompleteCount, 0)
})

test('مكوّن بلا سعر مسجّل يُعلَّم ولا يُحتسب صفراً بصمت', () => {
  const r = recipeCost(
    [{ ingredientId: 'x', quantity: 100, unit: 'g', baseUnit: 'g', basis: null }],
    1,
  )
  assert.equal(r.incompleteCount, 1)
  assert.equal(r.lines[0]!.problem, 'no_price')
})

// ─── 7. الربح وهامش الربح ────────────────────────────────────

test('سعر البيع 6.00 وتكلفة القطعة 2.18 ← ربح 3.82 وهامش 63.7%', () => {
  const r = recipeCost(cakeLines, 8)
  const p = profitOf(6, r.perUnit)

  assert.equal(round(p.profit, 2), 3.82)
  assert.equal(round(p.marginPercent, 1), 63.7)
})

test('بيع بلا إيراد لا يقسم على صفر', () => {
  const p = profitOf(0, 10)
  assert.equal(p.marginPercent, 0)
  assert.equal(p.profit, -10)
})

// ─── 8. الإنتاج الفعلي مقابل القياسي ─────────────────────────

test('دفعة 4 وصفات: الفرق الفعلي وأثره على التكلفة', () => {
  const standard = recipeCost(cakeLines, 8)
  const batchStandard = standard.total * 4
  // 69.67 وليس 69.68: المحرك يجمع بدقة كاملة ويقرّب عند العرض فقط،
  // بينما 17.42 × 4 تقرّب أولاً ثم تضرب فتضخّم الخطأ.
  assert.equal(round(batchStandard, 2), 69.67)

  // الاستهلاك الفعلي يختلف عن القياسي
  const actual = [
    { ...cakeLines[0]!, quantity: 2_050 }, // قياسي 2000
    { ...cakeLines[1]!, quantity: 1_400 }, // قياسي 1200
    { ...cakeLines[2]!, quantity: 780 }, //  قياسي 800
    { ...cakeLines[3]!, quantity: 1_060 }, // قياسي 1000
  ]
  const batchActual = recipeCost(actual, 32).total
  assert.equal(round(batchActual, 2), 71.29)

  const variance = batchActual - batchStandard
  assert.equal(round(variance, 2), 1.62)
  assert.equal(round((variance / batchStandard) * 100, 1), 2.3)

  // السكر وحده: +200 جم
  const sugarDiff = ingredientCost(sugar, 200, 'g', 'g')!
  assert.equal(round(sugarDiff, 2), 0.98)
})

// ─── 9. قيمة الهدر ───────────────────────────────────────────

test('هدر 500 جم شوكولاتة بتكلفة 0.04 للجرام ← 20.00 ر.س', () => {
  const chocNoWaste = { packagePrice: 200, packageSize: 5_000, wastePercent: 0 }
  assert.equal(ingredientCost(chocNoWaste, 500, 'g', 'g'), 20)
})

test('هدر منتج جاهز يُقيَّم بتكلفة القطعة من الوصفة', () => {
  const perUnit = recipeCost(cakeLines, 8).perUnit
  assert.equal(round(3 * perUnit, 2), 6.53)
})

// ─── 10. حماية من المدخلات الفاسدة ───────────────────────────

test('حجم عبوة صفر أو سالب لا يُنتج Infinity', () => {
  assert.equal(baseUnitCost({ packagePrice: 100, packageSize: 0, wastePercent: 0 }), 0)
  assert.equal(baseUnitCost({ packagePrice: 100, packageSize: -5, wastePercent: 0 }), 0)
})

test('هدر خارج المدى يُقصّ بدل أن يفجّر الحساب', () => {
  const v = effectiveUnitCost({ packagePrice: 10, packageSize: 100, wastePercent: 150 })
  assert.ok(Number.isFinite(v) && v > 0)
  assert.equal(effectiveUnitCost({ packagePrice: 10, packageSize: 100, wastePercent: -20 }), 0.1)
})

test('NaN لا يتسرّب إلى الأرقام المعروضة', () => {
  assert.equal(round(Number.NaN), 0)
  assert.equal(baseUnitCost({ packagePrice: Number.NaN, packageSize: 100, wastePercent: 0 }), 0)
  assert.equal(changePercent(5, 0), null)
})
