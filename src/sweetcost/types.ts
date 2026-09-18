// ============================================================
// types.ts — أنواع البيانات، مطابقة لمخطط قاعدة البيانات
// ============================================================

export type Unit = 'kg' | 'g' | 'l' | 'ml' | 'piece' | 'pack'
export type BaseUnit = 'g' | 'ml' | 'piece'

export type WasteReason =
  | 'expired'
  | 'damaged'
  | 'production_error'
  | 'over_prep'
  | 'broken'
  | 'other'

export interface Supplier {
  id: string
  name: string
  phone: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Ingredient {
  id: string
  name: string
  purchase_unit: Unit
  base_unit: BaseUnit
  package_size: number
  waste_percent: number
  supplier_id: string | null
  created_at: string
  updated_at: string
}

export interface IngredientPrice {
  id: string
  ingredient_id: string
  package_size: number
  package_price: number
  unit_cost: number
  purchase_date: string
  purchase_item_id: string | null
  source: 'manual' | 'purchase'
  created_at: string
}

export interface Purchase {
  id: string
  supplier_id: string | null
  invoice_no: string | null
  purchased_on: string
  attachment_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PurchaseItem {
  id: string
  purchase_id: string
  ingredient_id: string
  quantity: number
  package_size: number
  package_price: number
  total_price: number
  created_at: string
}

export interface Recipe {
  id: string
  name: string
  sell_price: number
  /** عدد وحدات البيع في الوعاء الواحد */
  yield_units: number
  /** وعاء الإنتاج: صينية، زبدية، قالب… */
  batch_label: string
  /** وحدة البيع: قطعة، حبة، كوب… */
  yield_unit_label: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface RecipeItem {
  id: string
  recipe_id: string
  ingredient_id: string
  quantity: number
  unit: Unit
  created_at: string
}

export interface Production {
  id: string
  recipe_id: string
  produced_on: string
  batches: number
  produced_units: number
  sold_units: number
  sell_price: number
  standard_cost: number
  actual_cost: number
  revenue: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ProductionItem {
  id: string
  production_id: string
  ingredient_id: string
  unit: Unit
  standard_qty: number
  actual_qty: number
  unit_cost: number
  created_at: string
}

export interface WasteEntry {
  id: string
  wasted_on: string
  ingredient_id: string | null
  recipe_id: string | null
  quantity: number
  unit: Unit
  unit_cost: number
  value: number
  reason: WasteReason
  note: string | null
  created_at: string
}

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'cancelled'

export interface Settings {
  id: boolean
  weekly_goal: number
  monthly_goal: number
  currency: string
  store_name: string
  store_phone: string | null
  store_address: string | null
  vat_number: string | null
  vat_enabled: boolean
  vat_rate: number
  invoice_prefix: string
  updated_at: string
}

export interface Customer {
  id: string
  name: string
  phone: string | null
  tax_number: string | null
  address: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SalesInvoice {
  id: string
  invoice_no: string
  customer_id: string | null
  issued_on: string
  due_on: string | null
  /** لقطة نسبة الضريبة وقت الإصدار */
  vat_rate: number
  discount: number
  status: InvoiceStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SalesInvoiceItem {
  id: string
  invoice_id: string
  recipe_id: string | null
  /** لقطة اسم المنتج — تبقى لو حُذفت الوصفة */
  description: string
  unit_label: string
  quantity: number
  unit_price: number
  /** لقطة تكلفة الوحدة وقت الإصدار */
  unit_cost: number
  line_total: number
  created_at: string
}

/** مجاميع الفاتورة — من العرض sc_invoice_totals */
export interface InvoiceTotals {
  id: string
  subtotal: number
  discount: number
  taxable: number
  vat_amount: number
  total: number
  cost: number
  line_count: number
}

/** آخر سعر ومتوسط السعر — من العرض sc_ingredient_latest */
export interface IngredientLatest {
  id: string
  last_price: number | null
  last_package_size: number | null
  last_unit_cost: number | null
  last_purchase_date: string | null
  avg_price: number | null
  price_count: number
}

/** كل ما تحتاجه الشاشات، محمّل دفعة واحدة */
export interface SweetCostData {
  suppliers: Supplier[]
  ingredients: Ingredient[]
  latest: Record<string, IngredientLatest>
  prices: IngredientPrice[]
  purchases: Purchase[]
  purchaseItems: PurchaseItem[]
  recipes: Recipe[]
  recipeItems: RecipeItem[]
  productions: Production[]
  productionItems: ProductionItem[]
  waste: WasteEntry[]
  customers: Customer[]
  invoices: SalesInvoice[]
  invoiceItems: SalesInvoiceItem[]
  invoiceTotals: Record<string, InvoiceTotals>
  settings: Settings
}
