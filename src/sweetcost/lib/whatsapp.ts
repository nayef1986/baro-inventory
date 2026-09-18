// ============================================================
// whatsapp.ts — إرسال الفاتورة للعميل عبر واتساب
//
// رابط wa.me يفتح محادثة العميل برسالة مكتوبة مسبقاً. لا خادم
// ولا اشتراك ولا موافقة من ميتا.
//
// ⚠️ حدّ معروف: الرابط يحمل **نصاً فقط**. لا يمكنه إرفاق ملف
//    PDF — تلك تحتاج WhatsApp Business API بخادم ورسوم لكل
//    رسالة. لذلك الرسالة نفسها كاملة: البنود والمبالغ والمتبقي،
//    فلا يحتاج العميل مرفقاً ليعرف ما عليه.
// ============================================================

import { money, quantity as fmtQty, arabicDate, arabicDays } from './format.ts'
import type { Due } from './dues.ts'
import type { SalesInvoice, SalesInvoiceItem, Settings } from '../types.ts'

/** مفتاح السعودية — أرقام العملاء محلية في الغالب */
const DEFAULT_COUNTRY = '966'

/**
 * يحوّل الرقم إلى الصيغة الدولية بلا رموز، كما يطلبها wa.me.
 * يعيد null إن لم يكن الرقم صالحاً.
 *
 * الأرقام الدولية تُترك كما هي: من كتب ‎+971…‎ لا يُفترض أنه سعودي.
 */
export function normalizePhone(raw: string | null | undefined, country = DEFAULT_COUNTRY): string | null {
  if (!raw) return null

  const trimmed = raw.trim()
  const international = trimmed.startsWith('+') || trimmed.startsWith('00')
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 0) return null

  // 00966… ← 966…
  const bare = international && digits.startsWith('00') ? digits.slice(2) : digits

  // كُتب دولياً صراحةً، أو يبدأ بمفتاح الدولة أصلاً
  if (international || bare.startsWith(country)) {
    return bare.length >= 10 ? bare : null
  }

  // محلي: 05xxxxxxxx ← 9665xxxxxxxx
  if (bare.startsWith('0')) {
    const local = bare.slice(1)
    return local.length >= 9 ? country + local : null
  }

  // بلا صفر ولا مفتاح: 5xxxxxxxx
  if (bare.length >= 9 && bare.length <= 10) return country + bare

  return bare.length >= 10 ? bare : null
}

/** رابط يفتح محادثة واتساب برسالة جاهزة */
export function whatsappUrl(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

/**
 * نص الفاتورة. يتكيّف مع حالة السداد: الفاتورة المسدَّدة تخرج
 * بشكر، والتي عليها متبقٍّ تُبرز المبلغ وتاريخ الاستحقاق.
 */
export function invoiceMessage({
  invoice,
  items,
  due,
  settings,
  customerName,
}: {
  invoice: SalesInvoice
  items: SalesInvoiceItem[]
  due: Due
  settings: Settings
  customerName: string | null
}): string {
  const lines: string[] = []
  const currency = settings.currency

  lines.push(`*${settings.store_name}*`)
  if (settings.store_tagline) lines.push(settings.store_tagline)
  lines.push('')

  if (customerName) lines.push(`أهلاً ${customerName} 👋`)
  lines.push(`فاتورة توريد رقم *${invoice.invoice_no}*`)
  lines.push(`بتاريخ ${arabicDate(invoice.issued_on)}`)
  lines.push('')

  for (const item of items) {
    lines.push(
      `• ${item.description} — ${fmtQty(item.quantity)} ${item.unit_label} × ${money(item.unit_price)} = ${money(item.line_total)}`,
    )
  }
  lines.push('')

  lines.push(`الإجمالي: *${money(due.total)} ${currency}*`)

  if (due.paid > 0) lines.push(`المدفوع: ${money(due.paid)} ${currency}`)

  if (due.balance > 0) {
    lines.push(`المتبقي: *${money(due.balance)} ${currency}*`)
    if (invoice.due_on) {
      lines.push(
        due.daysLate !== null
          ? `تاريخ الاستحقاق: ${arabicDate(invoice.due_on)} — مضى عليه ${arabicDays(due.daysLate)}`
          : `تاريخ الاستحقاق: ${arabicDate(invoice.due_on)}`,
      )
    }
  } else {
    lines.push('تم السداد بالكامل — شكراً لكم 🌿')
  }

  if (invoice.notes) {
    lines.push('')
    lines.push(invoice.notes)
  }

  lines.push('')
  lines.push('شكراً لتعاملكم معنا.')
  if (settings.store_phone) lines.push(`للتواصل: ${settings.store_phone}`)

  return lines.join('\n')
}
