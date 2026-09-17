// ============================================================
// analytics.ts — تجميع الأرقام على فترة زمنية
// ============================================================

import { profitOf } from './cost.ts'
import { addDaysISO, todayISO } from './format.ts'
import type { SweetCostData } from '../types.ts'

export type PeriodKey = 'today' | 'week' | 'month' | 'custom'

export interface Range {
  from: string
  to: string
}

export interface PeriodTotals {
  /** المبيعات = الكمية المباعة × سعر البيع وقت الإنتاج */
  sales: number
  productionCost: number
  wasteValue: number
  /** تكلفة الإنتاج + الهدر */
  totalCost: number
  profit: number
  marginPercent: number
  unitsProduced: number
  unitsSold: number
  batchCount: number
  /** فرق التكلفة الفعلية عن القياسية */
  costVariance: number
}

/** بداية الأسبوع = السبت */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  const offset = (d.getDay() + 1) % 7
  return addDaysISO(iso, -offset)
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export function rangeFor(key: PeriodKey, custom?: Range): Range {
  const today = todayISO()
  switch (key) {
    case 'today':
      return { from: today, to: today }
    case 'week':
      return { from: weekStart(today), to: today }
    case 'month':
      return { from: monthStart(today), to: today }
    case 'custom':
      return custom ?? { from: monthStart(today), to: today }
  }
}

/** الفترة السابقة بنفس الطول، منتهية قبل بداية الحالية بيوم */
export function previousRange(range: Range): Range {
  const days = daysBetween(range.from, range.to)
  const to = addDaysISO(range.from, -1)
  return { from: addDaysISO(to, -days), to }
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime()
  const b = new Date(`${to}T00:00:00`).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

function inRange(date: string, range: Range): boolean {
  const d = date.slice(0, 10)
  return d >= range.from && d <= range.to
}

export function totalsIn(data: SweetCostData, range: Range): PeriodTotals {
  const productions = data.productions.filter((p) => inRange(p.produced_on, range))
  const waste = data.waste.filter((w) => inRange(w.wasted_on, range))

  const sales = productions.reduce((s, p) => s + p.revenue, 0)
  const productionCost = productions.reduce((s, p) => s + p.actual_cost, 0)
  const standardCost = productions.reduce((s, p) => s + p.standard_cost, 0)
  const wasteValue = waste.reduce((s, w) => s + w.value, 0)
  const totalCost = productionCost + wasteValue
  const p = profitOf(sales, totalCost)

  return {
    sales,
    productionCost,
    wasteValue,
    totalCost,
    profit: p.profit,
    marginPercent: p.marginPercent,
    unitsProduced: productions.reduce((s, x) => s + x.produced_units, 0),
    unitsSold: productions.reduce((s, x) => s + x.sold_units, 0),
    batchCount: productions.length,
    costVariance: productionCost - standardCost,
  }
}

export interface DayTotal {
  date: string
  sales: number
  profit: number
}

/** المبيعات والربح لكل يوم فيه نشاط، مرتّبة تصاعدياً */
export function dailySeries(data: SweetCostData): DayTotal[] {
  const map = new Map<string, { sales: number; cost: number }>()

  for (const p of data.productions) {
    const d = p.produced_on.slice(0, 10)
    const row = map.get(d) ?? { sales: 0, cost: 0 }
    row.sales += p.revenue
    row.cost += p.actual_cost
    map.set(d, row)
  }
  for (const w of data.waste) {
    const d = w.wasted_on.slice(0, 10)
    const row = map.get(d) ?? { sales: 0, cost: 0 }
    row.cost += w.value
    map.set(d, row)
  }

  return [...map.entries()]
    .map(([date, v]) => ({ date, sales: v.sales, profit: v.sales - v.cost }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** الهدر مجمّعاً حسب السبب، من الأكبر */
export function wasteByReason(data: SweetCostData, range: Range): { reason: string; value: number }[] {
  const map = new Map<string, number>()
  for (const w of data.waste) {
    if (!inRange(w.wasted_on, range)) continue
    map.set(w.reason, (map.get(w.reason) ?? 0) + w.value)
  }
  return [...map.entries()]
    .map(([reason, value]) => ({ reason, value }))
    .sort((a, b) => b.value - a.value)
}

/** أعلى العناصر هدراً في الفترة */
export function topWasted(
  data: SweetCostData,
  range: Range,
  limit = 5,
): { label: string; value: number }[] {
  const map = new Map<string, number>()
  for (const w of data.waste) {
    if (!inRange(w.wasted_on, range)) continue
    const label = w.ingredient_id
      ? (data.ingredients.find((i) => i.id === w.ingredient_id)?.name ?? 'مكوّن محذوف')
      : (data.recipes.find((r) => r.id === w.recipe_id)?.name ?? 'منتج محذوف')
    map.set(label, (map.get(label) ?? 0) + w.value)
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

export function goalFor(key: PeriodKey, weeklyGoal: number, monthlyGoal: number): number | null {
  if (key === 'week') return weeklyGoal > 0 ? weeklyGoal : null
  if (key === 'month') return monthlyGoal > 0 ? monthlyGoal : null
  return null
}
