// ============================================================
// InstallButton.tsx — زر تثبيت التطبيق على الجوال
// يختفي تماماً عندما يكون التطبيق مثبّتاً أو غير قابل للتثبيت.
// ============================================================

import { useState } from 'react'

import { useInstall } from '../lib/pwa.ts'
import { Button, Modal } from './UI.tsx'

export function InstallButton({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { state, install } = useInstall()
  const [showIOS, setShowIOS] = useState(false)

  if (state === 'installed' || state === 'unavailable') return null

  const label = 'تثبيت على الجوال'
  const className =
    tone === 'dark'
      ? 'w-full !bg-bark-3 !text-[#ede7d6] !border-[#45593a] hover:!bg-bark-2'
      : '!px-3 !text-[13px]'

  return (
    <>
      <Button
        variant={tone === 'dark' ? 'secondary' : 'secondary'}
        className={className}
        onClick={() => (state === 'prompt' ? void install() : setShowIOS(true))}
      >
        <span className="inline-flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
          {label}
        </span>
      </Button>

      {showIOS ? (
        <Modal
          title="تثبيت سويت كوست على الآيفون"
          onClose={() => setShowIOS(false)}
          footer={<Button onClick={() => setShowIOS(false)}>تمام</Button>}
        >
          <ol className="m-0 ps-5 list-decimal flex flex-col gap-3 text-[14.5px] leading-loose text-soft">
            <li>
              اضغط زر <strong className="text-ink">المشاركة</strong> في شريط سفاري (المربع مع السهم لأعلى).
            </li>
            <li>
              اختر <strong className="text-ink">إضافة إلى الشاشة الرئيسية</strong>.
            </li>
            <li>
              اضغط <strong className="text-ink">إضافة</strong> — وسيظهر سويت كوست كتطبيق مستقل بأيقونته.
            </li>
          </ol>
          <p className="mt-4 mb-0 text-[13px] text-muted leading-relaxed">
            بعدها يفتح بملء الشاشة بدون شريط المتصفح، ويبدأ فوراً حتى مع شبكة بطيئة.
          </p>
        </Modal>
      ) : null}
    </>
  )
}
