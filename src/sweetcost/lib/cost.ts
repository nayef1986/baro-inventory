// ============================================================
// cost.ts — محرك حساب التكلفة
//
// هذا هو المصدر الوحيد لأي حساب تكلفة في النظام.
// لا تُدخل تكلفة يدوياً في أي مكان، ولا تُكرَّر هذه المعادلات
// في SQL أو في شاشة. أي رقم تكلفة يظهر للمستخدم يمرّ من هنا.
//
//   سعر الوحدة      = سعر العبوة ÷ حجم العبوة
//   التكلفة الفعلية = سعر الوحدة ÷ (1 − نسبة الهدر)
//   تكلفة المكون    = التكلفة الفعلية × الكمية (بالوحدة الأساسية)
//
// منطق الهدر: نسبة الهدر تعني أن جزءاً من العبوة يضيع قبل أن
// يصل للطبق، فالكمية الصالحة أقل من المشتراة. القسمة على
// (1 − الهدر) ترفع تكلفة الجرام الصالح. مثال: عبوة بـ100 ريال
// وهدر 20% تعطي جراماً صالحاً أغلى بـ25%، لأنك اشتريت 100%
// ودفعت ثمنها كاملاً بينما استفدت من 80% فقط.
// ============================================================

import type { BaseUnit, Unit } from '../types.ts'
import { toBase } from './units.ts'

/** أساس تسعير مكوّن واحد: آخر عبوة اشتُريت ونسبة هدره. */
export interface CostBasis {
  /** سعر العبوة الواحدة */
  packagePrice: number
  /** حجم العبوة بالوحدة الأساسية (عبوة 25 كجم ← 25000) */
  packageSize: number
  /** نسبة الهدر % (0 إلى أقل من 100) */
  wastePercent: number
}

/** تقريب مالي ثابت يتجنّب انحراف الفاصلة العائمة. */
export function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0
  const f = 10 ** decimals
  return Math.round((value + Number.EPSILON) * f) / f
}

/** سعر الوحدة الأساسية قبل الهدر. */
export function baseUnitCost(basis: CostBasis): number {
  const { packagePrice, packageSize } = basis
  if (!Number.isFinite(packagePrice) || !Number.isFinite(packageSize)) return 0
  if (packageSize <= 0) return 0
  return packagePrice / packageSize
}

/** سعر الوحدة الأساسية بعد احتساب الهدر — هذا ما تستخدمه الوصفات. */
export function effectiveUnitCost(basis: CostBasis): number {
  const raw = baseUnitCost(basis)
  const waste = clampWaste(basis.wastePercent)
  return raw / (1 - waste / 100)
}

function clampWaste(wastePercent: number): number {
  if (!Number.isFinite(wastePercent)) return 0
  if (wastePercent < 0) return 0
  if (wastePercent > 99.99) return 99.99
  return wastePercent
}

/**
 * تكلفة كمية من مكوّن.
 * يعيد null إذا كانت الوحدة غير متوافقة مع وحدة المكوّن الأساسية
 * (مثل طلب لتر من مكوّن يُقاس بالجرام) — الشاشة تعرض ذلك كخطأ.
 */
export function ingredientCost(
  basis: CostBasis,
  quantity: number,
  unit: Unit,
  baseUnit: BaseUnit,
): number | null {
  const qtyInBase = toBase(quantity, unit, baseUnit)
  if (qtyInBase === null) return null
  return effectiveUnitCost(basis) * qtyInBase
}

// ─── الوصفات ─────────────────────────────────────────────────

export interface RecipeLineInput {
  ingredientId: string
  quantity: number
  unit: Unit
  baseUnit: BaseUnit
  /** null عندما لا يوجد سعر شراء مسجّل بعد لهذا المكون */
  basis: CostBasis | null
}

export interface RecipeLineCost extends RecipeLineInput {
  unitCost: number
  cost: number
  /** سبب عدم اكتمال الحساب، إن وُجد */
  problem: 'no_price' | 'unit_mismatch' | null
}

export interface RecipeCost {
  lines: RecipeLineCost[]
  /** إجمالي تكلفة الوصفة */
  total: number
  /** تكلفة القطعة الواحدة */
  perUnit: number
  /** عدد المكونات التي تعذّر حسابها */
  incompleteCount: number
}

export function recipeCost(lines: RecipeLineInput[], yieldUnits: number): RecipeCost {
  const out: RecipeLineCost[] = lines.map((line) => {
    if (!line.basis) {
      return { ...line, unitCost: 0, cost: 0, problem: 'no_price' }
    }
    const cost = ingredientCost(line.basis, line.quantity, line.unit, line.baseUnit)
    if (cost === null) {
      return { ...line, unitCost: 0, cost: 0, problem: 'unit_mismatch' }
    }
    return {
      ...line,
      unitCost: effectiveUnitCost(line.basis),
      cost,
      problem: null,
    }
  })

  const total = out.reduce((sum, l) => sum + l.cost, 0)
  const divisor = yieldUnits > 0 ? yieldUnits : 1

  return {
    lines: out,
    total,
    perUnit: total / divisor,
    incompleteCount: out.filter((l) => l.problem !== null).length,
  }
}

// ─── الربح والهامش ───────────────────────────────────────────

export interface Profit {
  revenue: number
  cost: number
  profit: number
  /** هامش الربح % من المبيعات. صفر عندما لا توجد مبيعات. */
  marginPercent: number
}

export function profitOf(revenue: number, cost: number): Profit {
  const rev = Number.isFinite(revenue) ? revenue : 0
  const cst = Number.isFinite(cost) ? cost : 0
  const profit = rev - cst
  return {
    revenue: rev,
    cost: cst,
    profit,
    marginPercent: rev > 0 ? (profit / rev) * 100 : 0,
  }
}

/** نسبة التغيّر بين رقمين. null عندما لا يوجد أساس للمقارنة. */
export function changePercent(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}
