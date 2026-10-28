// ============================================================
// ProfitHero.tsx — بطاقة الربح: أول ما تقع عليه العين
//
// الشاشة كانت تفتح برسالة المساعد، والربح رابعُ خمسةِ مربّعات
// متشابهة — يقف بجانب الهدر وتكلفة المبيعات بالوزن نفسه. وصاحب
// المتجر يفتح هذه الشاشة لسؤال واحد: «هل أكسب؟».
//
// فصار الربح وحده بحجم لا يُنازَع، وتحته شريطٌ واحد يحلّ محلّ
// المربّعات الخمسة: من كل ريال مبيعات، كم ذهب عجيناً، وكم هدراً،
// وكم بقي ربحاً. جسمٌ واحد يُقرأ بنظرة بدل خمسة أرقام تُقارَن.
//
// وألوان الشريط مواد لا رموز: القشرة عسلية، والهدر محروق،
// والربح شوكولاتة — لون الهوية نفسه، وأعلى تبايناً على الكريمي
// فتقع عليه العين أولاً.
// ============================================================

import type { ReactNode } from 'react'

import { money, percent, signedPercent } from '../lib/format.ts'

interface Totals {
  sales: number
  cogs: number
  wasteValue: number
  totalCost: number
  profit: number
  marginPercent: number
  invoiceCount: number
}

export function ProfitHero({
  period,
  totals,
  profitChange,
  gap,
}: {
  /** «هذا الشهر» — الفترة مكتوبة لا مفهومة من السياق */
  period: string
  totals: Totals
  /** تغيّر الربح عن الفترة السابقة، أو null إن لا سابقة */
  profitChange: number | null
  /** ما ينقص الحساب ليصحّ — يُعرض تحت الأرقام لا مكانها */
  gap: ReactNode
}) {
  const loss = totals.profit < 0
  const hasSales = totals.sales > 0

  return (
    <section className="rounded-[18px] bg-surface border border-line overflow-hidden">
      <div className="tart-rim" aria-hidden="true" />

      <div className="px-5 pt-5 pb-6 sm:px-8 sm:pt-6 sm:pb-7">
      {/* الكلمة تسبق الرقم: «خسارة ٥٤٠» لا «٥٤٠ … خسارة».
          الرقم الأحمر وحده يُقرأ ربحاً عند العجلة. */}
      <h2 className={`display m-0 text-[17px] sm:text-[18px] ${loss ? 'text-bad' : 'text-soft'}`}>
        {hasSales ? `${loss ? 'خسارة' : 'ربح'} ${period}` : `ربح ${period}`}
      </h2>

      {hasSales ? (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <div
            className={`num text-[46px] sm:text-[62px] font-bold leading-none tracking-[-0.015em] ${
              loss ? 'text-bad' : 'text-ink'
            }`}
          >
            {money(Math.abs(totals.profit))}
            <span className="text-[17px] font-medium text-muted ms-2">ر.س</span>
          </div>

          {!loss && profitChange !== null ? (
            <span
              className={`num text-[14px] font-semibold ${
                profitChange >= 0 ? 'text-good' : 'text-bad'
              }`}
            >
              {signedPercent(profitChange)} عن الفترة السابقة
            </span>
          ) : null}
        </div>
      ) : null}

      {hasSales ? (
        <Band totals={totals} loss={loss} />
      ) : (
        <p className="mt-3 mb-0 text-[15px] leading-loose text-soft max-w-[52ch]">
          ما في فواتير في هذه الفترة، فلا ربح يُحسب. اختر فترة أخرى، أو أصدر فاتورة من شاشة
          الفواتير.
        </p>
      )}

      {/* الرقم أعلاه يكذب ما دام ينقصه شيء — نقول ماذا ينقص وأين يُكمَل */}
      {gap ? <div className="mt-6 pt-5 border-t border-line-soft">{gap}</div> : null}
      </div>
    </section>
  )
}

/**
 * الشريط: عرض كل قطعة نسبتها من المبيعات، فتجتمع القطع فتساوي
 * المبيعات تماماً. وفي الخسارة لا قطعةَ ربحٍ تُرسم — تُقاس القطع
 * من التكلفة بدلاً عنها، فالسؤال حينها «كم غطّت المبيعات؟».
 */
function Band({ totals, loss }: { totals: Totals; loss: boolean }) {
  const base = loss ? totals.totalCost : totals.sales
  const share = (value: number) => (base > 0 ? (value / base) * 100 : 0)

  const parts = [
    { key: 'cogs', label: 'التكلفة', value: totals.cogs, fill: 'bg-honey' },
    { key: 'waste', label: 'الهدر', value: totals.wasteValue, fill: 'bg-bad' },
    ...(loss ? [] : [{ key: 'profit', label: 'الربح', value: totals.profit, fill: 'bg-ink' }]),
  ].filter((p) => p.value > 0)

  return (
    <>
      <div
        className="mt-6 flex h-5 w-full overflow-hidden rounded-full bg-sand"
        role="img"
        aria-label={`من ${money(base)} ريال: تكلفة ${money(totals.cogs)}، هدر ${money(
          totals.wasteValue,
        )}، ربح ${money(totals.profit)}`}
      >
        {parts.map((part) => (
          <div key={part.key} className={part.fill} style={{ width: `${share(part.value)}%` }} />
        ))}
      </div>

      <dl className="mt-3.5 m-0 flex flex-wrap gap-x-6 gap-y-2">
        {parts.map((part) => (
          <div key={part.key} className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${part.fill}`} aria-hidden="true" />
            <dt className="text-[12.5px] text-muted">{part.label}</dt>
            <dd className="num m-0 text-[13.5px] font-semibold">{money(part.value)}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 mb-0 text-[13px] leading-loose text-muted">
        {loss
          ? `المبيعات ${money(totals.sales)} ر.س غطّت ${percent(
              totals.totalCost > 0 ? (totals.sales / totals.totalCost) * 100 : 0,
            )} من التكلفة.`
          : `من مبيعات ${money(totals.sales)} ر.س في ${arabicInvoices(
              totals.invoiceCount,
            )}، هامش الربح ${percent(totals.marginPercent)}.`}
      </p>
    </>
  )
}

/** تمييز العدد: فاتورة واحدة، فاتورتان، ثلاث فواتير… */
function arabicInvoices(count: number): string {
  if (count === 1) return 'فاتورة واحدة'
  if (count === 2) return 'فاتورتين'
  if (count <= 10) return `${count} فواتير`
  return `${count} فاتورة`
}
