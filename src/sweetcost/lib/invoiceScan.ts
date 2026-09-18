// ============================================================
// invoiceScan.ts — قراءة فاتورة الشراء من صورة
//
// الخادم يقرأ الصورة ويعيد JSON. **ما يعود غير موثوق**: نموذج
// اللغة قد يعيد نصاً مكان رقم، أو رقماً سالباً، أو حقلاً ناقصاً،
// أو بنداً مخترعاً. لذلك كل قيمة تمرّ على تطبيع صارم هنا قبل أن
// تلمس الشاشة، وما لا يصلح يُسقط.
//
// ولا شيء يُحفظ تلقائياً: الناتج يملأ النموذج فقط، وصاحب المتجر
// يراجع ويضغط حفظ. قراءة خاطئة تُفسد كل تكلفة بعدها.
// ============================================================

import type { Ingredient } from '../types.ts'
import { baseToPackageSize } from './units.ts'
import { round } from './cost.ts'

/** ما يخرج من الخادم بعد التطبيع */
export interface ScannedItem {
  name: string
  quantity: number
  /** حجم العبوة بوحدة الشراء، أو null إن لم يُقرأ */
  packageSize: number | null
  unit: string | null
  packagePrice: number
}

export interface ScannedInvoice {
  invoiceNo: string | null
  purchasedOn: string | null
  supplierName: string | null
  items: ScannedItem[]
}

/** حدود عاقلة: ما خرج عنها قراءة خاطئة لا فاتورة حقيقية */
const MAX_QUANTITY = 100_000
const MAX_PRICE = 1_000_000

export async function scanInvoice(imageBase64: string): Promise<ScannedInvoice> {
  const response = await fetch('/api/read-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64 }),
  })

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === 'string' ? body.error : 'تعذّرت قراءة الصورة.'
    throw new Error(message)
  }
  return normalizeScan(body)
}

/** يحوّل رد الخادم غير الموثوق إلى بيانات صالحة، ويسقط ما لا يصلح */
export function normalizeScan(raw: unknown): ScannedInvoice {
  if (!isRecord(raw)) return { invoiceNo: null, purchasedOn: null, supplierName: null, items: [] }

  const rawItems = Array.isArray(raw.items) ? raw.items : []
  const items: ScannedItem[] = []

  for (const entry of rawItems) {
    if (!isRecord(entry)) continue

    const name = text(entry.name)
    if (!name) continue // بند بلا اسم لا يفيد

    const quantity = num(entry.quantity)
    const packagePrice = num(entry.package_price)
    const lineTotal = num(entry.line_total)

    // الكمية الافتراضية عبوة واحدة — أقلّ ضرراً من إسقاط البند
    const qty = quantity !== null && quantity > 0 && quantity <= MAX_QUANTITY ? quantity : 1

    // لو غاب سعر العبوة وحضر الإجمالي، نشتقّه
    let price = packagePrice !== null && packagePrice >= 0 ? packagePrice : null
    if (price === null && lineTotal !== null && lineTotal >= 0) price = lineTotal / qty
    if (price === null || price > MAX_PRICE) price = 0

    const size = num(entry.package_size)

    items.push({
      name,
      quantity: round(qty, 4),
      packageSize: size !== null && size > 0 ? round(size, 4) : null,
      unit: unitOf(entry.unit),
      packagePrice: round(price, 4),
    })
  }

  return {
    invoiceNo: text(raw.invoice_no),
    purchasedOn: isoDate(raw.purchased_on),
    supplierName: text(raw.supplier_name),
    items,
  }
}

/**
 * يطابق اسماً مقروءاً بمكوّن مسجّل.
 * مطابقة محافظة عمداً: الاسم الكامل أو احتواء واضح. المطابقة
 * الظنّية تضع السعر على المكوّن الخطأ وتُفسد تكلفته بصمت، وترك
 * الخانة فارغة أرحم — صاحب المتجر يختار بنفسه.
 */
export function matchIngredient(name: string, ingredients: Ingredient[]): Ingredient | null {
  const needle = normalizeArabic(name)
  if (!needle) return null

  for (const ingredient of ingredients) {
    if (normalizeArabic(ingredient.name) === needle) return ingredient
  }

  const contains = ingredients.filter((i) => {
    const hay = normalizeArabic(i.name)
    return hay.length >= 3 && (hay.includes(needle) || needle.includes(hay))
  })
  // احتواء واحد فقط يكفي؛ أكثر من واحد التباسٌ نتركه لصاحب المتجر
  return contains.length === 1 ? (contains[0] ?? null) : null
}

/**
 * يبني سطر شراء جاهزاً للنموذج.
 * حجم العبوة: المقروء إن وُجد، وإلا حجم المكوّن المسجّل — فالمكوّن
 * يعرف عبوته، والفاتورة قد لا تذكرها.
 */
export function draftLineFrom(
  item: ScannedItem,
  ingredient: Ingredient | null,
): { ingredientId: string; quantity: string; packageSize: string; packagePrice: string } {
  const fallback = ingredient
    ? round(baseToPackageSize(ingredient.package_size, ingredient.purchase_unit, ingredient.base_unit), 4)
    : null

  const size = item.packageSize ?? fallback

  return {
    ingredientId: ingredient?.id ?? '',
    quantity: String(item.quantity),
    packageSize: size !== null ? String(size) : '',
    packagePrice: String(item.packagePrice),
  }
}

/** يقرأ الملف كـdata URL ليُرسل إلى الخادم */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('تعذّرت قراءة الملف.'))
    reader.readAsDataURL(file)
  })
}

// ─── أدوات التطبيع ───────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.toLowerCase() !== 'null' ? trimmed : null
}

/** الرقم قد يعود نصاً («25» أو «25.5 كجم») فنستخرجه */
function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

const UNITS = new Set(['kg', 'g', 'l', 'ml', 'piece', 'pack'])

function unitOf(value: unknown): string | null {
  const raw = text(value)?.toLowerCase()
  return raw && UNITS.has(raw) ? raw : null
}

function isoDate(value: unknown): string | null {
  const raw = text(value)
  if (!raw) return null
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const date = new Date(`${match[0]}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : match[0]
}

/** يوحّد الألف والتاء المربوطة والتشكيل، فـ«زبدة» و«زُبده» سواء */
function normalizeArabic(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
}
