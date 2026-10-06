// ============================================================
// share.ts — مشاركة الملف عبر تطبيقات الجوال
//
// Web Share API هو الطريق الوحيد لإرسال ملف إلى واتساب من متصفح
// بلا خادم: يفتح لوحة المشاركة في النظام، ويختار صاحب المتجر
// واتساب منها، فيصل الملف مرفقاً بالرسالة.
//
// متاح على الجوال (iOS 15+ وأندرويد). على الكمبيوتر غير مدعوم
// غالباً — هناك نُنزّل الملف ونفتح واتساب بالنص، ليُرفق يدوياً.
// ============================================================

/** هل يستطيع هذا الجهاز مشاركة ملفات فعلاً؟ */
export function canShareFile(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function' &&
    navigator.canShare({ files: [file] })
  )
}

/**
 * المشاركة نفسها لا تمرّ من هنا: navigator.share يشترط ضغطة
 * المستخدم، وتوليد الملف يستهلكها. فتُنادى مباشرة من زرّ نافذة
 * «الملف جاهز» — انظر components/PdfReady.tsx.
 */

/** ينزّل الملف على الجهاز — الطريق الاحتياطي على الكمبيوتر */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  // الإفراج بعد أن يبدأ التنزيل فعلاً
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
