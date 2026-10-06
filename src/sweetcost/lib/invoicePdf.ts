// ============================================================
// invoicePdf.ts — توليد ملف PDF للفاتورة داخل المتصفح
//
// لماذا تصوير لا رسم نصّي: مكتبات PDF لا تعرف تشكيل العربية ولا
// اتجاهها، فتخرج الحروف مفكّكة ومقلوبة. المتصفح يرسمها صحيحة،
// فنصوّر ما رسمه ونضعه في الملف. النتيجة صورة لا نص قابل للتحديد
// — ثمن مقبول مقابل عربية سليمة بلا خادم.
//
// المكتبتان تُحمّلان عند الطلب فقط (import ديناميكي)، فلا تدخلان
// حزمة الإقلاع ولا تبطّئان فتح التطبيق.
// ============================================================

import { arabicMonth } from './format.ts'

/** عرض A4 بالمليمتر */
const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297

/** دقة التصوير. 2 تكفي للطباعة وتُبقي الحجم معقولاً للواتساب. */
const SCALE = 2

/** جودة JPEG — 0.92 حدّ لا تظهر بعده آثار الضغط على الحواف */
const QUALITY = 0.92

/**
 * أقصى تصغير مقبول لإدخال الفاتورة في ورقة واحدة. تحته يصير
 * الخط أصغر من أن يُقرأ، فالتقسيم على صفحتين أرحم من الضغط.
 */
const MIN_FIT = 0.62

/**
 * يحوّل عنصر الفاتورة المرسوم في الصفحة إلى ملف PDF بمقاس A4.
 *
 * الهدف ورقة واحدة: الفاتورة الأطول قليلاً تُصغَّر لتدخل، وما
 * تجاوز حدّ القراءة يُقسَّم على صفحات.
 */
export async function invoicePdfBlob(node: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ])

  // الخطوط لازم تكتمل قبل التصوير، وإلا صُوِّر خطّ احتياطي
  if (document.fonts?.ready) await document.fonts.ready

  const canvas = await html2canvas(node, {
    scale: SCALE,
    backgroundColor: '#ffffff',
    logging: false,
    useCORS: true,
  })

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const image = canvas.toDataURL('image/jpeg', QUALITY)
  const naturalHeight = (canvas.height * A4_WIDTH_MM) / canvas.width

  const fit = A4_HEIGHT_MM / naturalHeight
  if (fit >= MIN_FIT) {
    // تدخل ورقة واحدة — بحجمها الطبيعي أو مصغَّرة قليلاً، ومتوسّطة أفقياً
    const scale = Math.min(fit, 1)
    const width = A4_WIDTH_MM * scale
    pdf.addImage(image, 'JPEG', (A4_WIDTH_MM - width) / 2, 0, width, naturalHeight * scale)
    return pdf.output('blob')
  }

  let remaining = naturalHeight
  let offset = 0
  while (remaining > 0.5) {
    if (offset > 0) pdf.addPage()
    // إزاحة سالبة: الصورة نفسها تُرسم مرة لكل صفحة، مقصوصة بحدودها
    pdf.addImage(image, 'JPEG', 0, -offset, A4_WIDTH_MM, naturalHeight)
    remaining -= A4_HEIGHT_MM
    offset += A4_HEIGHT_MM
  }

  return pdf.output('blob')
}

/** أقلّ ما نحتاجه لترتيب الفواتير — لا الكائن كاملاً */
interface Dated {
  id: string
  invoice_no: string
  issued_on: string
}

/**
 * ترتيب الفاتورة بين فواتير شهرها، بدءاً من ١.
 *
 * الاسم وحده لا يكفي حين تُرسل أكثر من فاتورة في الشهر: الملفات
 * تتشابه في جوال التاجر فلا يعرف أيّها أيّ. فالثانية تحمل ٢
 * والثالثة ٣، والأولى تبقى بلا رقم — فلا يتغيّر اسمها حين تُصدَر
 * فاتورة بعدها.
 *
 * الترتيب بالتاريخ ثم بالرقم ثم بالمعرّف: ترتيبٌ تامّ لا يتأرجح،
 * فتحمل الفاتورة الواحدة الرقم نفسه كلما أُرسلت.
 */
export function invoiceSequence(invoice: Dated, invoices: Dated[]): number {
  const month = invoice.issued_on.slice(0, 7)
  const key = (i: Dated) => `${i.issued_on}|${i.invoice_no}|${i.id}`
  const mine = key(invoice)

  let before = 0
  for (const other of invoices) {
    if (other.issued_on.slice(0, 7) !== month) continue
    if (key(other) < mine) before += 1
  }
  return before + 1
}

/**
 * عنوان المستند. مصدرٌ واحد لاسم الملف ولسطر العنوان في رسالة
 * الواتساب معاً — لو بُنيا في مكانين لافترقا عند أول تعديل.
 * الشهر من تاريخ الإصدار لا من اليوم: الفاتورة قد تُرسل بعد شهرها.
 */
export function invoiceTitle(storeName: string, issuedOn: string, sequence = 1): string {
  const suffix = sequence > 1 ? ` ${sequence}` : ''
  return clean(`فاتورة ${storeName} لشهر ${arabicMonth(issuedOn)}${suffix}`)
}

/**
 * «كشف حساب مقهى الرصيف لشهر أكتوبر».
 * هنا الاسم اسم العميل لا المتجر: الكشف يخصّ تاجراً بعينه، ولو
 * حمل اسم المتجر لتشابهت كشوف كل العملاء في شهر واحد. ولا يحتاج
 * تسلسلاً: كشف واحد لكل عميل في كل شهر.
 */
export function statementTitle(customerName: string, month: string): string {
  return clean(`كشف حساب ${customerName} لشهر ${arabicMonth(`${month}-01`)}`)
}

/** «فاتورة COCO CAKE لشهر أكتوبر.pdf» */
export function invoiceFileName(storeName: string, issuedOn: string, sequence = 1): string {
  return `${invoiceTitle(storeName, issuedOn, sequence)}.pdf`
}

/** «كشف حساب مقهى الرصيف لشهر أكتوبر.pdf» */
export function statementFileName(customerName: string, month: string): string {
  return `${statementTitle(customerName, month)}.pdf`
}

/** يحذف ما لا يصلح في أسماء الملفات ويوحّد المسافات */
function clean(text: string): string {
  return text.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim()
}
