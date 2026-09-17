// ============================================================
// derive.ts — اشتقاق التكاليف من البيانات الخام
// كل الأرقام هنا تمرّ عبر cost.ts. لا معادلة تكلفة تُكتب هنا.
// ============================================================

import { effectiveUnitCost, profitOf, recipeCost, type CostBasis, type RecipeCost } from './cost.ts'
import type { Ingredient, Recipe, SweetCostData } from '../types.ts'

/** أساس تسعير مكوّن من آخر سعر مسجّل له. null = لا سعر بعد. */
export function basisFor(data: SweetCostData, ingredientId: string): CostBasis | null {
  const ingredient = data.ingredients.find((i) => i.id === ingredientId)
  if (!ingredient) return null

  const latest = data.latest[ingredientId]
  if (!latest || latest.last_price === null) return null

  return {
    packagePrice: latest.last_price,
    // حجم العبوة وقت الشراء، لا الحجم الحالي — حتى لا يفسد
    // تعديلُ تعريف المكوّن أسعارَه التاريخية.
    packageSize: latest.last_package_size ?? ingredient.package_size,
    wastePercent: ingredient.waste_percent,
  }
}

/** تكلفة الوحدة الأساسية بعد الهدر — الرقم المستخدم في كل مكان. */
export function unitCostFor(data: SweetCostData, ingredientId: string): number {
  const basis = basisFor(data, ingredientId)
  return basis ? effectiveUnitCost(basis) : 0
}

/** تكلفة الوحدة قبل الهدر — يُستخدم لتقييم الهدر نفسه. */
export function rawUnitCostFor(data: SweetCostData, ingredientId: string): number {
  const latest = data.latest[ingredientId]
  return latest?.last_unit_cost ?? 0
}

export function ingredientById(data: SweetCostData, id: string | null): Ingredient | null {
  if (!id) return null
  return data.ingredients.find((i) => i.id === id) ?? null
}

export function recipeById(data: SweetCostData, id: string | null): Recipe | null {
  if (!id) return null
  return data.recipes.find((r) => r.id === id) ?? null
}

/** تكلفة وصفة من الأسعار الحالية — تتغيّر تلقائياً مع كل شراء. */
export function recipeCostFor(data: SweetCostData, recipe: Recipe): RecipeCost {
  const lines = data.recipeItems
    .filter((item) => item.recipe_id === recipe.id)
    .map((item) => {
      const ingredient = data.ingredients.find((i) => i.id === item.ingredient_id)
      return {
        ingredientId: item.ingredient_id,
        quantity: item.quantity,
        unit: item.unit,
        baseUnit: ingredient?.base_unit ?? 'g',
        basis: basisFor(data, item.ingredient_id),
      }
    })

  return recipeCost(lines, recipe.yield_units)
}

export interface ProductRow {
  recipe: Recipe
  totalCost: number
  unitCost: number
  sellPrice: number
  profit: number
  marginPercent: number
  incompleteCount: number
}

/** أداء كل المنتجات بالأسعار الحالية، مرتّبة من الأعلى هامشاً. */
export function productRows(data: SweetCostData): ProductRow[] {
  return data.recipes
    .map((recipe) => {
      const cost = recipeCostFor(data, recipe)
      const p = profitOf(recipe.sell_price, cost.perUnit)
      return {
        recipe,
        totalCost: cost.total,
        unitCost: cost.perUnit,
        sellPrice: recipe.sell_price,
        profit: p.profit,
        marginPercent: p.marginPercent,
        incompleteCount: cost.incompleteCount,
      }
    })
    .sort((a, b) => b.marginPercent - a.marginPercent)
}

/** قيمة هدر سطر واحد بالوحدة المناسبة لنوعه. */
export function wasteUnitCost(
  data: SweetCostData,
  ingredientId: string | null,
  recipeId: string | null,
): number {
  if (ingredientId) return rawUnitCostFor(data, ingredientId)
  const recipe = recipeById(data, recipeId)
  return recipe ? recipeCostFor(data, recipe).perUnit : 0
}
