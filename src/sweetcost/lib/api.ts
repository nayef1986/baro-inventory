// ============================================================
// api.ts — قراءة وكتابة قاعدة البيانات
// ============================================================

import { requireClient } from './supabase.ts'
import type {
  Customer,
  Ingredient,
  IngredientLatest,
  IngredientPrice,
  Production,
  ProductionItem,
  Purchase,
  PurchaseItem,
  InvoiceTotals,
  Recipe,
  RecipeItem,
  InvoicePayment,
  SalesInvoice,
  SalesInvoiceItem,
  Settings,
  Supplier,
  SweetCostData,
  WasteEntry,
} from '../types.ts'

const DEFAULT_SETTINGS: Settings = {
  id: true,
  weekly_goal: 0,
  monthly_goal: 0,
  currency: 'ر.س',
  store_name: 'COCO CAKE',
  store_tagline: 'TART BAKERY',
  store_phone: null,
  store_address: null,
  vat_number: null,
  vat_enabled: false,
  vat_rate: 15,
  invoice_prefix: 'CC',
  updated_at: new Date().toISOString(),
}

async function selectAll<T>(table: string, order?: { column: string; ascending: boolean }): Promise<T[]> {
  const sb = requireClient()
  let q = sb.from(table).select('*')
  if (order) q = q.order(order.column, { ascending: order.ascending })
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as T[]
}

export async function loadAll(): Promise<SweetCostData> {
  const [
    suppliers,
    ingredients,
    latestRows,
    prices,
    purchases,
    purchaseItems,
    recipes,
    recipeItems,
    productions,
    productionItems,
    waste,
    customers,
    invoices,
    invoiceItems,
    invoicePayments,
    totalsRows,
    settingsRows,
  ] = await Promise.all([
    selectAll<Supplier>('sc_suppliers', { column: 'name', ascending: true }),
    selectAll<Ingredient>('sc_ingredients', { column: 'name', ascending: true }),
    selectAll<IngredientLatest>('sc_ingredient_latest'),
    selectAll<IngredientPrice>('sc_ingredient_prices', { column: 'purchase_date', ascending: false }),
    selectAll<Purchase>('sc_purchases', { column: 'purchased_on', ascending: false }),
    selectAll<PurchaseItem>('sc_purchase_items'),
    selectAll<Recipe>('sc_recipes', { column: 'name', ascending: true }),
    selectAll<RecipeItem>('sc_recipe_items'),
    selectAll<Production>('sc_productions', { column: 'produced_on', ascending: false }),
    selectAll<ProductionItem>('sc_production_items'),
    selectAll<WasteEntry>('sc_waste', { column: 'wasted_on', ascending: false }),
    selectAll<Customer>('sc_customers', { column: 'name', ascending: true }),
    selectAll<SalesInvoice>('sc_sales_invoices', { column: 'issued_on', ascending: false }),
    selectAll<SalesInvoiceItem>('sc_sales_invoice_items'),
    selectAll<InvoicePayment>('sc_invoice_payments', { column: 'paid_on', ascending: false }),
    selectAll<InvoiceTotals>('sc_invoice_totals'),
    selectAll<Settings>('sc_settings'),
  ])

  const latest: Record<string, IngredientLatest> = {}
  for (const row of latestRows) latest[row.id] = row

  const invoiceTotals: Record<string, InvoiceTotals> = {}
  for (const row of totalsRows) invoiceTotals[row.id] = row

  return {
    suppliers,
    ingredients,
    latest,
    prices,
    purchases,
    purchaseItems,
    recipes,
    recipeItems,
    productions,
    productionItems,
    waste,
    customers,
    invoices,
    invoiceItems,
    invoicePayments,
    invoiceTotals,
    settings: settingsRows[0] ?? DEFAULT_SETTINGS,
  }
}

// ─── الموردين ────────────────────────────────────────────────

export type SupplierInput = Pick<Supplier, 'name' | 'phone' | 'notes'>

export async function saveSupplier(input: SupplierInput, id?: string): Promise<void> {
  const sb = requireClient()
  const { error } = id
    ? await sb.from('sc_suppliers').update(input).eq('id', id)
    : await sb.from('sc_suppliers').insert(input)
  if (error) throw error
}

export async function deleteSupplier(id: string): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('sc_suppliers').delete().eq('id', id)
  if (error) throw error
}

// ─── المكونات ────────────────────────────────────────────────

export type IngredientInput = Pick<
  Ingredient,
  'name' | 'purchase_unit' | 'base_unit' | 'package_size' | 'waste_percent' | 'supplier_id'
>

export async function saveIngredient(input: IngredientInput, id?: string): Promise<string> {
  const sb = requireClient()
  if (id) {
    const { error } = await sb.from('sc_ingredients').update(input).eq('id', id)
    if (error) throw error
    return id
  }
  const { data, error } = await sb.from('sc_ingredients').insert(input).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function deleteIngredient(id: string): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('sc_ingredients').delete().eq('id', id)
  if (error) throw error
}

/** يضيف سجل سعر جديد — لا يستبدل أي سعر سابق */
export async function addPrice(args: {
  ingredientId: string
  packageSize: number
  packagePrice: number
  purchaseDate: string
}): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('sc_ingredient_prices').insert({
    ingredient_id: args.ingredientId,
    package_size: args.packageSize,
    package_price: args.packagePrice,
    purchase_date: args.purchaseDate,
    source: 'manual',
  })
  if (error) throw error
}

// ─── المشتريات ───────────────────────────────────────────────

export interface PurchaseLineInput {
  ingredient_id: string
  quantity: number
  package_size: number
  package_price: number
}

/**
 * يسجّل فاتورة وبنودها. مُشغِّل قاعدة البيانات يضيف سجل سعر
 * لكل بند تلقائياً، فتتحدّث تكلفة كل وصفة تستخدم المكوّن.
 * عند فشل البنود نحذف الفاتورة حتى لا تبقى فاتورة فارغة.
 */
export async function savePurchase(
  header: Pick<Purchase, 'supplier_id' | 'invoice_no' | 'purchased_on' | 'notes'>,
  lines: PurchaseLineInput[],
): Promise<void> {
  const sb = requireClient()
  const { data, error } = await sb.from('sc_purchases').insert(header).select('id').single()
  if (error) throw error

  const purchaseId = (data as { id: string }).id
  const { error: itemsError } = await sb
    .from('sc_purchase_items')
    .insert(lines.map((l) => ({ ...l, purchase_id: purchaseId })))

  if (itemsError) {
    await sb.from('sc_purchases').delete().eq('id', purchaseId)
    throw itemsError
  }
}

export async function deletePurchase(id: string): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('sc_purchases').delete().eq('id', id)
  if (error) throw error
}

// ─── الوصفات ─────────────────────────────────────────────────

export type RecipeInput = Pick<
  Recipe,
  'name' | 'sell_price' | 'yield_units' | 'batch_label' | 'yield_unit_label' | 'notes'
>
export type RecipeLineInput = Pick<RecipeItem, 'ingredient_id' | 'quantity' | 'unit'>

export async function saveRecipe(
  input: RecipeInput,
  lines: RecipeLineInput[],
  id?: string,
): Promise<string> {
  const sb = requireClient()
  let recipeId = id

  if (recipeId) {
    const { error } = await sb.from('sc_recipes').update(input).eq('id', recipeId)
    if (error) throw error
    const { error: delError } = await sb.from('sc_recipe_items').delete().eq('recipe_id', recipeId)
    if (delError) throw delError
  } else {
    const { data, error } = await sb.from('sc_recipes').insert(input).select('id').single()
    if (error) throw error
    recipeId = (data as { id: string }).id
  }

  if (lines.length > 0) {
    const { error } = await sb
      .from('sc_recipe_items')
      .insert(lines.map((l) => ({ ...l, recipe_id: recipeId })))
    if (error) throw error
  }
  return recipeId
}

export async function deleteRecipe(id: string): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('sc_recipes').delete().eq('id', id)
  if (error) throw error
}

// ─── الإنتاج ─────────────────────────────────────────────────

export type ProductionInput = Pick<
  Production,
  | 'recipe_id'
  | 'produced_on'
  | 'batches'
  | 'produced_units'
  | 'sold_units'
  | 'sell_price'
  | 'standard_cost'
  | 'actual_cost'
  | 'notes'
>

export type ProductionLineInput = Pick<
  ProductionItem,
  'ingredient_id' | 'unit' | 'standard_qty' | 'actual_qty' | 'unit_cost'
>

export async function saveProduction(
  input: ProductionInput,
  lines: ProductionLineInput[],
): Promise<void> {
  const sb = requireClient()
  const { data, error } = await sb.from('sc_productions').insert(input).select('id').single()
  if (error) throw error

  const productionId = (data as { id: string }).id
  if (lines.length > 0) {
    const { error: itemsError } = await sb
      .from('sc_production_items')
      .insert(lines.map((l) => ({ ...l, production_id: productionId })))
    if (itemsError) {
      await sb.from('sc_productions').delete().eq('id', productionId)
      throw itemsError
    }
  }
}

export async function deleteProduction(id: string): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('sc_productions').delete().eq('id', id)
  if (error) throw error
}

// ─── الهدر ───────────────────────────────────────────────────

export type WasteInput = Pick<
  WasteEntry,
  'wasted_on' | 'ingredient_id' | 'recipe_id' | 'quantity' | 'unit' | 'unit_cost' | 'reason' | 'note'
>

export async function saveWaste(input: WasteInput): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('sc_waste').insert(input)
  if (error) throw error
}

export async function deleteWaste(id: string): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('sc_waste').delete().eq('id', id)
  if (error) throw error
}

// ─── الإعدادات ───────────────────────────────────────────────

export type SettingsInput = Partial<
  Pick<
    Settings,
    | 'weekly_goal'
    | 'monthly_goal'
    | 'store_name'
    | 'store_tagline'
    | 'store_phone'
    | 'store_address'
    | 'vat_number'
    | 'vat_enabled'
    | 'vat_rate'
    | 'invoice_prefix'
  >
>

export async function saveSettings(input: SettingsInput): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('sc_settings').upsert({ id: true, ...input })
  if (error) throw error
}

// ─── العملاء ─────────────────────────────────────────────────

export type CustomerInput = Pick<
  Customer,
  'name' | 'phone' | 'tax_number' | 'address' | 'notes'
>

export async function saveCustomer(input: CustomerInput, id?: string): Promise<string> {
  const sb = requireClient()
  if (id) {
    const { error } = await sb.from('sc_customers').update(input).eq('id', id)
    if (error) throw error
    return id
  }
  const { data, error } = await sb.from('sc_customers').insert(input).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function deleteCustomer(id: string): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('sc_customers').delete().eq('id', id)
  if (error) throw error
}

// ─── فواتير التوريد ──────────────────────────────────────────

export type InvoiceInput = Pick<
  SalesInvoice,
  'invoice_no' | 'customer_id' | 'issued_on' | 'due_on' | 'vat_rate' | 'discount' | 'status' | 'notes'
>

export type InvoiceLineInput = Pick<
  SalesInvoiceItem,
  'recipe_id' | 'description' | 'unit_label' | 'quantity' | 'unit_price' | 'unit_cost'
>

/**
 * يحفظ الفاتورة وبنودها. عند الإنشاء نحذف الترويسة إذا فشلت
 * البنود، حتى لا تبقى فاتورة فارغة برقم محجوز.
 */
export async function saveInvoice(
  header: InvoiceInput,
  lines: InvoiceLineInput[],
  id?: string,
): Promise<string> {
  const sb = requireClient()

  if (id) {
    const { error } = await sb.from('sc_sales_invoices').update(header).eq('id', id)
    if (error) throw error
    const { error: delError } = await sb
      .from('sc_sales_invoice_items')
      .delete()
      .eq('invoice_id', id)
    if (delError) throw delError
    if (lines.length > 0) {
      const { error: insError } = await sb
        .from('sc_sales_invoice_items')
        .insert(lines.map((l) => ({ ...l, invoice_id: id })))
      if (insError) throw insError
    }
    return id
  }

  const { data, error } = await sb.from('sc_sales_invoices').insert(header).select('id').single()
  if (error) throw error
  const invoiceId = (data as { id: string }).id

  if (lines.length > 0) {
    const { error: itemsError } = await sb
      .from('sc_sales_invoice_items')
      .insert(lines.map((l) => ({ ...l, invoice_id: invoiceId })))
    if (itemsError) {
      await sb.from('sc_sales_invoices').delete().eq('id', invoiceId)
      throw itemsError
    }
  }
  return invoiceId
}

export async function deleteInvoice(id: string): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('sc_sales_invoices').delete().eq('id', id)
  if (error) throw error
}

export async function setInvoiceStatus(id: string, status: SalesInvoice['status']): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('sc_sales_invoices').update({ status }).eq('id', id)
  if (error) throw error
}

// ─── دفعات الفواتير ──────────────────────────────────────────

export type PaymentInput = Pick<InvoicePayment, 'invoice_id' | 'paid_on' | 'amount' | 'method' | 'note'>

export async function savePayment(input: PaymentInput): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('sc_invoice_payments').insert(input)
  if (error) throw error
}

export async function deletePayment(id: string): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('sc_invoice_payments').delete().eq('id', id)
  if (error) throw error
}
