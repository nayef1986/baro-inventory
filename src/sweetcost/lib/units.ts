// ============================================================
// units.ts — الوحدات والتحويل بينها
// ============================================================

import type { BaseUnit, Unit, WasteReason } from '../types.ts'

export const UNIT_LABELS: Record<Unit, string> = {
  kg: 'كجم',
  g: 'جرام',
  l: 'لتر',
  ml: 'مل',
  piece: 'قطعة',
  pack: 'علبة',
}

export const BASE_UNIT_LABELS: Record<BaseUnit, string> = {
  g: 'جرام',
  ml: 'مل',
  piece: 'قطعة',
}

export const WASTE_REASON_LABELS: Record<WasteReason, string> = {
  expired: 'انتهاء',
  damaged: 'تلف',
  production_error: 'خطأ إنتاج',
  over_prep: 'زيادة تحضير',
  broken: 'كسر',
  other: 'أخرى',
}

export const ALL_UNITS: Unit[] = ['kg', 'g', 'l', 'ml', 'piece', 'pack']
export const ALL_BASE_UNITS: BaseUnit[] = ['g', 'ml', 'piece']
export const ALL_WASTE_REASONS: WasteReason[] = [
  'expired',
  'damaged',
  'production_error',
  'over_prep',
  'broken',
  'other',
]

/**
 * كم وحدة أساسية في وحدة واحدة من `unit`.
 * null = الوحدتان غير متوافقتين (لا تحوّل وزناً إلى حجم).
 */
const FACTORS: Record<BaseUnit, Partial<Record<Unit, number>>> = {
  g: { g: 1, kg: 1000 },
  ml: { ml: 1, l: 1000 },
  piece: { piece: 1 },
}

export function conversionFactor(unit: Unit, baseUnit: BaseUnit): number | null {
  return FACTORS[baseUnit][unit] ?? null
}

/** الوحدات التي يصح استخدامها في وصفة لمكوّن وحدته الأساسية baseUnit */
export function unitsFor(baseUnit: BaseUnit): Unit[] {
  return ALL_UNITS.filter((u) => conversionFactor(u, baseUnit) !== null)
}

/** تحويل كمية إلى الوحدة الأساسية. null عند عدم التوافق. */
export function toBase(quantity: number, unit: Unit, baseUnit: BaseUnit): number | null {
  const factor = conversionFactor(unit, baseUnit)
  if (factor === null || !Number.isFinite(quantity)) return null
  return quantity * factor
}

/** وحدة الشراء الافتراضية المناسبة لوحدة أساسية */
export function defaultPurchaseUnit(baseUnit: BaseUnit): Unit {
  if (baseUnit === 'g') return 'kg'
  if (baseUnit === 'ml') return 'l'
  return 'pack'
}

// ─── حجم العبوة ──────────────────────────────────────────────
// المستخدم يُدخل «عبوة 25 كجم»، والنظام يخزّنها 25000 جرام.
// وحدة 'pack' (علبة) خاصة: المستخدم يُدخل عدد الوحدات داخل
// العلبة مباشرة (علبة 30 قطعة ← 30).

export function purchaseUnitsFor(baseUnit: BaseUnit): Unit[] {
  if (baseUnit === 'g') return ['kg', 'g', 'pack']
  if (baseUnit === 'ml') return ['l', 'ml', 'pack']
  return ['piece', 'pack']
}

/** من وحدة الشراء إلى الوحدة الأساسية. null = غير متوافقة. */
export function packageSizeToBase(
  value: number,
  purchaseUnit: Unit,
  baseUnit: BaseUnit,
): number | null {
  if (!Number.isFinite(value)) return null
  if (purchaseUnit === 'pack') return value
  const factor = conversionFactor(purchaseUnit, baseUnit)
  return factor === null ? null : value * factor
}

/** العكس — لعرض القيمة المخزّنة في نموذج التعديل. */
export function baseToPackageSize(base: number, purchaseUnit: Unit, baseUnit: BaseUnit): number {
  if (purchaseUnit === 'pack') return base
  const factor = conversionFactor(purchaseUnit, baseUnit)
  return factor === null || factor === 0 ? base : base / factor
}

/** نص «25 كجم» أو «علبة 30 قطعة» */
export function packageLabel(
  packageSizeBase: number,
  purchaseUnit: Unit,
  baseUnit: BaseUnit,
): string {
  if (purchaseUnit === 'pack') {
    return `علبة ${trim(packageSizeBase)} ${UNIT_LABELS[baseUnit]}`
  }
  return `${trim(baseToPackageSize(packageSizeBase, purchaseUnit, baseUnit))} ${UNIT_LABELS[purchaseUnit]}`
}

function trim(n: number): string {
  return String(Number(n.toFixed(3)))
}
