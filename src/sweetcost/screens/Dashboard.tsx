// ============================================================
// Dashboard.tsx — التكلفة والربح + لوحة المتابعة
// كل عناصر المساعد الذكي موجودة هنا، بلا شاشة إضافية.
// ============================================================

import { useMemo, useState } from 'react'

import type { ScreenProps } from '../App.tsx'
import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  Modal,
  NumberInput,
  PageHeader,
  Pill,
  ProgressBar,
  StatTile,
  Table,
  Td,
  TextInput,
  Th,
} from '../components/UI.tsx'
import { saveSettings } from '../lib/api.ts'
import {
  goalFor,
  previousRange,
  rangeFor,
  totalsIn,
  type PeriodKey,
  type Range,
} from '../lib/analytics.ts'
import { buildCoach, type InsightTone } from '../lib/coach.ts'
import { changePercent } from '../lib/cost.ts'
import { productRows } from '../lib/derive.ts'
import { arabicDate, money, percent, signedPercent, todayISO } from '../lib/format.ts'
import { dbErrorMessage } from '../lib/supabase.ts'

const PERIOD_TABS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'اليوم' },
  { key: 'week', label: 'هذا الأسبوع' },
  { key: 'month', label: 'هذا الشهر' },
  { key: 'custom', label: 'فترة مخصصة' },
]

const INSIGHT_DOT: Record<InsightTone, string> = {
  good: 'bg-good',
  warn: 'bg-bad',
  info: 'bg-warn',
}

export default function DashboardScreen({ data, reload, onError, goTo }: ScreenProps) {
  const [periodKey, setPeriodKey] = useState<PeriodKey>('month')
  const [custom, setCustom] = useState<Range>({ from: todayISO().slice(0, 8) + '01', to: todayISO() })
  const [showGoals, setShowGoals] = useState(false)

  const range = periodKey === 'custom' ? custom : rangeFor(periodKey)
  const totals = useMemo(() => totalsIn(data, range), [data, range])
  const previous = useMemo(() => totalsIn(data, previousRange(range)), [data, range])

  const goal = goalFor(periodKey, data.settings.weekly_goal, data.settings.monthly_goal)
  const coach = useMemo(
    () => buildCoach({ data, periodKey, totals, previous, goal }),
    [data, periodKey, totals, previous, goal],
  )

  const products = useMemo(() => productRows(data), [data])
  const salesChange = changePercent(totals.sales, previous.sales)
  const profitChange = changePercent(totals.profit, previous.profit)
  const marginDelta = totals.marginPercent - previous.marginPercent
  const wasteShare = totals.totalCost > 0 ? (totals.wasteValue / totals.totalCost) * 100 : 0

  return (
    <>
      <PageHeader
        title="التكلفة والربح"
        subtitle={`${arabicDate(range.from)} — ${arabicDate(range.to)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1.5 bg-sand border border-line rounded-xl p-1.5">
              {PERIOD_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPeriodKey(tab.key)}
                  aria-pressed={periodKey === tab.key}
                  className={`min-h-11 px-3.5 rounded-lg text-[13.5px] cursor-pointer border-0 transition-colors ${
                    periodKey === tab.key
                      ? 'bg-surface text-ink font-semibold'
                      : 'bg-transparent text-muted hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={() => setShowGoals(true)}>
              الأهداف
            </Button>
          </div>
        }
      />

      {periodKey === 'custom' ? (
        <Card>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="من" htmlFor="cr-from">
              <TextInput id="cr-from" type="date" value={custom.from} onChange={(v) => setCustom({ ...custom, from: v })} />
            </Field>
            <Field label="إلى" htmlFor="cr-to">
              <TextInput id="cr-to" type="date" value={custom.to} onChange={(v) => setCustom({ ...custom, to: v })} />
            </Field>
          </div>
        </Card>
      ) : null}

      {/* ── رسالتك اليوم ─────────────────────────────────── */}
      <section className="bg-bark rounded-2xl p-6 sm:p-7 text-[#f5efe6] flex flex-col lg:flex-row gap-7">
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex items-center gap-2.5 text-[11.5px] tracking-[0.12em] text-[#e0a96d]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M12 3v2" /><path d="M12 19v2" /><path d="M5 12H3" /><path d="M21 12h-2" />
              <circle cx="12" cy="12" r="4.5" />
            </svg>
            <span>رسالتك اليوم</span>
          </div>

          <h2 className="display m-0 text-[24px] sm:text-[27px] font-bold leading-snug">{coach.card.head}</h2>
          <p className="m-0 text-[15.5px] leading-loose text-[#e4dacb] max-w-[560px]">{coach.card.body}</p>
          {coach.card.action ? (
            <p className="m-0 text-[13.5px] leading-loose text-[#bfae99] border-r-2 border-[#5a4433] pr-3 max-w-[560px]">
              {coach.card.action}
            </p>
          ) : null}
        </div>

        <div className="w-full lg:w-[302px] shrink-0 bg-bark-2 rounded-2xl p-5">
          {coach.progress ? (
            <div className="flex flex-col gap-2.5">
              <div className="text-[12.5px] text-[#bfae99]">{coach.progress.label}</div>
              <div className="text-[28px] font-bold num leading-none">
                {money(coach.progress.goal)} <span className="text-[14px] font-medium text-[#bfae99]">ر.س</span>
              </div>
              <ProgressBar percent={coach.progress.percent} className="mt-1 !bg-[#48382c]" />
              <div className="flex justify-between text-[12.5px] text-[#bfae99] num">
                <span>المحقق {money(coach.progress.achieved)}</span>
                <span>{percent(coach.progress.percent, 1)}</span>
              </div>
              <p className="m-0 mt-1.5 bg-bark-3 rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed text-[#f0e5d6]">
                {coach.progress.message}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="text-[12.5px] text-[#bfae99]">
                {periodKey === 'custom' ? 'الفترة المخصصة' : 'بدون هدف'}
              </div>
              <p className="m-0 text-[14.5px] leading-loose text-[#e4dacb]">
                {periodKey === 'custom'
                  ? 'لا يوجد هدف مرتبط بفترة مخصصة. اختر الأسبوع أو الشهر لمتابعة التقدم.'
                  : periodKey === 'today'
                    ? 'الأهداف محدّدة أسبوعياً وشهرياً. اختر «هذا الأسبوع» لمتابعة تقدمك.'
                    : 'لم تُحدَّد أهداف بعد.'}
              </p>
              <button
                type="button"
                onClick={() => setShowGoals(true)}
                className="self-start text-[13.5px] text-[#e0a96d] bg-transparent border-0 border-b border-[#5a4433] pb-0.5 cursor-pointer"
              >
                تعديل الأهداف
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── الأرقام ──────────────────────────────────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile
          label="إجمالي المبيعات"
          value={money(totals.sales)}
          note={salesChange !== null ? `${signedPercent(salesChange)} عن الفترة السابقة` : 'لا مقارنة متاحة'}
        />
        <StatTile label="تكلفة الإنتاج" value={money(totals.productionCost)} note="من مكونات الوصفات الفعلية" />
        <StatTile
          label="إجمالي الهدر"
          value={money(totals.wasteValue)}
          note={totals.totalCost > 0 ? `${percent(wasteShare)} من إجمالي التكلفة` : undefined}
          tone="bad"
        />
        <StatTile
          label="إجمالي الربح"
          value={money(totals.profit)}
          note={profitChange !== null ? `${signedPercent(profitChange)} عن الفترة السابقة` : undefined}
          tone={totals.profit >= 0 ? 'good' : 'bad'}
        />
        <StatTile
          label="متوسط هامش الربح"
          value={percent(totals.marginPercent)}
          note={previous.batchCount > 0 ? `${signedPercent(marginDelta)} نقطة` : undefined}
        />
      </section>

      {/* ── المنتجات + المساعد ───────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-5 items-start">
        <Card pad={false} className="overflow-hidden">
          <div className="px-5 pt-4 pb-3">
            <CardTitle
              title="أداء المنتجات"
              subtitle="بالأسعار الحالية · مرتّبة حسب الهامش"
              action={
                <Button variant="ghost" className="!px-2 !text-[13px]" onClick={() => goTo('recipes')}>
                  فتح الوصفات
                </Button>
              }
            />
          </div>

          {products.length === 0 ? (
            <EmptyState title="لا توجد منتجات" hint="أنشئ وصفة لتظهر ربحيتها هنا." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th className="ps-5">المنتج</Th>
                  <Th>سعر البيع</Th>
                  <Th>التكلفة</Th>
                  <Th>الربح</Th>
                  <Th>الهامش</Th>
                  <Th className="pe-5">الحالة</Th>
                </tr>
              </thead>
              <tbody>
                {products.map((row, index) => {
                  const lowest = index === products.length - 1 && products.length > 1
                  const highest = index === 0 && products.length > 1

                  return (
                    <tr key={row.recipe.id} className={lowest ? 'bg-bad-soft/40' : ''}>
                      <Td className="ps-5 font-semibold text-[14px]">{row.recipe.name}</Td>
                      <Td className="num">{money(row.sellPrice)}</Td>
                      <Td className="num">{money(row.unitCost)}</Td>
                      <Td className="num">{money(row.profit)}</Td>
                      <Td className={`num font-semibold ${row.marginPercent < 35 ? 'text-bad' : ''}`}>
                        {percent(row.marginPercent)}
                      </Td>
                      <Td className="pe-5">
                        {row.incompleteCount > 0 ? (
                          <Pill tone="warn">تكلفة ناقصة</Pill>
                        ) : row.sellPrice === 0 ? (
                          <Pill tone="neutral">بلا سعر بيع</Pill>
                        ) : highest ? (
                          <Pill tone="good">الأعلى ربحية</Pill>
                        ) : row.marginPercent < 35 ? (
                          <Pill tone="bad">هامش منخفض</Pill>
                        ) : lowest ? (
                          <Pill tone="warn">الأقل هامشاً</Pill>
                        ) : (
                          <Pill tone="good">جيد</Pill>
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}

          <p className="m-0 px-5 py-3 text-[12.5px] text-muted bg-cream border-t border-line leading-relaxed">
            التكلفة محسوبة من آخر أسعار الشراء بعد احتساب نسبة الهدر لكل مكوّن.
          </p>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardTitle title="الإنجازات" />
            {coach.milestones.length === 0 ? (
              <EmptyState title="لا توجد إنجازات بعد" hint="سجّل إنتاجك وستظهر إنجازاتك هنا تلقائياً." />
            ) : (
              <div className="flex flex-col gap-2.5">
                {coach.milestones.map((m, index) => (
                  <div
                    key={m.id}
                    className={`rounded-xl px-4 py-3.5 border ${
                      index === 0 ? 'bg-[#fcf7ee] border-[#e2d6c4]' : 'bg-surface border-line'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[11.5px] font-semibold text-warn tracking-wide">
                      {index === 0 ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="9" r="6" />
                          <path d="M8.5 14.5 7 22l5-2.5L17 22l-1.5-7.5" />
                        </svg>
                      ) : null}
                      <span>{m.badge}</span>
                    </div>
                    <div className="mt-2 text-[14.5px] font-semibold leading-relaxed">{m.title}</div>
                    <p className="m-0 mt-1 text-[13px] text-muted leading-relaxed">{m.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardTitle title="ملاحظات ذكية" />
            {coach.insights.length === 0 ? (
              <EmptyState title="لا توجد ملاحظات" hint="الملاحظات تظهر عندما تتوفّر بيانات كافية للمقارنة." />
            ) : (
              <ul className="list-none m-0 p-0 flex flex-col gap-3">
                {coach.insights.map((insight, index) => (
                  <li key={index} className="flex gap-2.5">
                    <span className={`w-[7px] h-[7px] rounded-full mt-2 shrink-0 ${INSIGHT_DOT[insight.tone]}`} />
                    <span className="text-[13.5px] leading-loose">{insight.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {showGoals ? (
        <GoalsModal
          weekly={data.settings.weekly_goal}
          monthly={data.settings.monthly_goal}
          onClose={() => setShowGoals(false)}
          onSaved={async () => {
            setShowGoals(false)
            await reload()
          }}
          onError={onError}
        />
      ) : null}
    </>
  )
}

function GoalsModal({
  weekly,
  monthly,
  onClose,
  onSaved,
  onError,
}: {
  weekly: number
  monthly: number
  onClose: () => void
  onSaved: () => Promise<void>
  onError: (message: string) => void
}) {
  const [weeklyGoal, setWeeklyGoal] = useState(String(weekly || ''))
  const [monthlyGoal, setMonthlyGoal] = useState(String(monthly || ''))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    const w = Number(weeklyGoal || 0)
    const m = Number(monthlyGoal || 0)
    if (!Number.isFinite(w) || w < 0) return setError('هدف الأسبوع لازم يكون رقماً موجباً.')
    if (!Number.isFinite(m) || m < 0) return setError('هدف الشهر لازم يكون رقماً موجباً.')

    setBusy(true)
    try {
      await saveSettings({ weekly_goal: w, monthly_goal: m })
      await onSaved()
    } catch (e) {
      const message = dbErrorMessage(e)
      setError(message)
      onError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="أهداف المبيعات"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'جاري الحفظ…' : 'حفظ'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="هدف الأسبوع" htmlFor="g-week" hint="بالريال · صفر = بدون هدف">
          <NumberInput id="g-week" value={weeklyGoal} onChange={setWeeklyGoal} step="100" />
        </Field>
        <Field label="هدف الشهر" htmlFor="g-month" hint="بالريال · صفر = بدون هدف">
          <NumberInput id="g-month" value={monthlyGoal} onChange={setMonthlyGoal} step="1000" />
        </Field>
      </div>
      <p className="mt-4 mb-0 text-[12.5px] text-muted leading-relaxed">
        الأسبوع يبدأ من السبت. التقدّم يُقاس بالمبيعات المسجّلة في شاشة الإنتاج الفعلي.
      </p>
      {error ? <p className="mt-3 mb-0 text-[13px] text-bad">{error}</p> : null}
    </Modal>
  )
}
