// ============================================================
// PdfReady.tsx — نافذة «الملف جاهز»
//
// ⚠️ سبب وجودها تقني بحت، وهو لبّ العطل الذي ظهر على الآيفون:
//
// navigator.share() يشترط أن يُنادى من **ضغطة المستخدم نفسها**.
// وتوليد الملف يأخذ قرابة ثانية (رسم الفاتورة ثم تصويرها)، فحين
// كنّا نناديه بعد انتهاء التوليد كانت الضغطة قد انتهت صلاحيتها،
// فيرفض سفاري المشاركة. فنسقط إلى تنزيل الملف، وسفاري على
// الآيفون يفتح الـblob في لسان جديد بدل حفظه — فإن شاركه صاحب
// المتجر من هناك خرج **باسم رابط الموقع** لا باسم الفاتورة.
//
// الحل: نفصل التوليد عن الإرسال. يُولَّد الملف أولاً، ثم تظهر هذه
// النافذة، وضغطة «مشاركة» فيها ضغطةٌ جديدة طازجة — فتُقبل.
//
// والمشاركة بالملف وحده بلا نص: واتساب على الآيفون قد يُسقط
// المرفق إذا رافقه نص. النص يُنسخ بزرّ مستقل ليُلصق إن أراد.
// ============================================================

import { useState } from 'react'

import { canShareFile, downloadFile } from '../lib/share.ts'
import { Button, Modal } from './UI.tsx'

export function PdfReadyModal({
  file,
  message,
  whatsapp,
  onClose,
}: {
  file: File
  /** نص الرسالة المرافقة، أو null إن كان المطلوب الملف وحده */
  message: string | null
  /** رابط محادثة العميل في واتساب، إن كان له رقم صالح */
  whatsapp?: string | null
  onClose: () => void
}) {
  const [note, setNote] = useState<string | null>(null)
  const shareable = canShareFile(file)

  /** تُنادى من داخل الضغطة مباشرة — لا await قبلها */
  function share() {
    navigator
      .share({ files: [file] })
      .then(onClose)
      .catch((e: unknown) => {
        // إغلاق اللوحة ليس خطأً
        if (e instanceof DOMException && e.name === 'AbortError') return
        setNote('تعذّرت المشاركة. استخدم «تنزيل الملف».')
      })
  }

  function copyMessage() {
    if (!message) return
    navigator.clipboard
      .writeText(message)
      .then(() => setNote('نُسخ النص. الصقه في واتساب بعد المرفق.'))
      .catch(() => setNote('تعذّر النسخ. انسخه يدوياً من الفاتورة.'))
  }

  return (
    <Modal
      title="الملف جاهز"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إغلاق
          </Button>
          <Button variant="secondary" onClick={() => downloadFile(file)}>
            تنزيل الملف
          </Button>
          {shareable ? <Button onClick={share}>مشاركة</Button> : null}
        </>
      }
    >
      <p className="m-0 text-[14px] font-semibold break-all">{file.name}</p>
      <p className="mt-2 mb-0 text-[13px] text-muted leading-relaxed">
        {shareable
          ? 'اضغط «مشاركة» لتفتح لوحة الجهاز — ومنها واتساب أو الحفظ في «الملفات».'
          : 'اضغط «تنزيل الملف» ليُحفظ على الجهاز، ثم أرفقه من واتساب.'}
      </p>

      {message ? (
        <div className="mt-4 pt-4 border-t border-line">
          <p className="m-0 mb-2 text-[13px] text-muted">
            ونصّ الرسالة جاهز إن أردت إلصاقه مع المرفق:
          </p>
          <pre className="m-0 mb-3 p-3 rounded-xl bg-cream text-[12px] leading-relaxed whitespace-pre-wrap max-h-44 overflow-y-auto">
            {message}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={copyMessage}>
              نسخ النص
            </Button>
            {whatsapp ? (
              <Button
                variant="secondary"
                onClick={() => window.open(whatsapp, '_blank', 'noopener')}
              >
                فتح محادثة العميل
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {note ? <p className="mt-3 mb-0 text-[13px] text-accent">{note}</p> : null}
    </Modal>
  )
}
