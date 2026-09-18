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

/** عرض A4 بالمليمتر */
const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297

/** دقة التصوير. 2 تكفي للطباعة وتُبقي الحجم معقولاً للواتساب. */
const SCALE = 2

/** جودة JPEG — 0.92 حدّ لا تظهر بعده آثار الضغط على الحواف */
const QUALITY = 0.92

/**
 * يحوّل عنصر الفاتورة المرسوم في الصفحة إلى ملف PDF بمقاس A4.
 * الفواتير الطويلة تُقسَّم على صفحات تلقائياً.
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
  const imageHeight = (canvas.height * A4_WIDTH_MM) / canvas.width

  let remaining = imageHeight
  let offset = 0
  while (remaining > 0.5) {
    if (offset > 0) pdf.addPage()
    // إزاحة سالبة: الصورة نفسها تُرسم مرة لكل صفحة، مقصوصة بحدودها
    pdf.addImage(image, 'JPEG', 0, -offset, A4_WIDTH_MM, imageHeight)
    remaining -= A4_HEIGHT_MM
    offset += A4_HEIGHT_MM
  }

  return pdf.output('blob')
}

/** coco-cake-CC-2026-001.pdf */
export function invoiceFileName(invoiceNo: string): string {
  return `${invoiceNo.replace(/[^\w-]+/g, '-')}.pdf`
}
