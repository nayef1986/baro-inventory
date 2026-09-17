// ============================================================
// Waste.tsx — الهدر
// القيمة المالية تُحسب من تكلفة المكوّن أو تكلفة قطعة المنتج.
// ============================================================

import { useMemo, useState } from 'react'

import type { ScreenProps } from '../App.tsx'
import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  NumberInput,
  PageHeader,
  Pill,
  ProgressBar,
  ReadOnlyValue,
  Select,
  Table,
  Td,
  TextInput,
  Th,
} from '../components/UI.tsx'
import { deleteWaste, saveWaste } from '../lib/api.ts'
import { rangeFor, topWasted, wasteByReason } from '../lib/analytics.ts'
import { round } from '../lib/cost.ts'
import { rawUnitCostFor, recipeCostFor } from '../lib/derive.ts'
import { arabicDateShort, money, percent, quantity as fmtQty, todayISO, unitPrice } from '../lib/format.ts'
import { dbErrorMessage } from '../lib/supabase.ts'
import { ALL_WASTE_REASONS, BASE_UNIT_LABELS, UNIT_LABELS, WASTE_REASON_LABELS, toBase, unitsFor } from '../lib/units.ts'
import type { Unit, WasteReason } from '../types.ts'

type TargetKind = 'ingredient' | 'recipe'

const REASON_TONE: Record<WasteReason, 'good' | 'warn' | 'bad' | 'neutral'> = {
  expired: 'warn',
  damaged: 'bad',
  production_error: 'bad',
  over_prep: 'neutral',
  broken: 'warn',
  other: 'neutral',
}

export default function WasteScreen({ data, reload, onError }: ScreenProps) {
  const [kind, setKind] = useState<TargetKind>('ingredient')
  const [targetId, setTargetId] = useState(data.ingredients[0]?.id ?? '')
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState<Unit | ''>(
    data.ingredients[0] ? (unitsFor(data.ingredients[0].base_unit)[0] ?? '') : '',
  )
  const [reason, setReason] = useState<WasteReason>('damaged')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const weekRange = rangeFor('week')
  const byReason = wasteByReason(data, weekRange)
  const top = topWasted(data, weekRange)
  const weekTotal = byReason.reduce((s, r) => s + r.value, 0)

  const ingredient = kind === 'ingredient' ? data.ingredients.find((i) => i.id === targetId) : undefined
  const recipe = kind === 'recipe' ? data.recipes.find((r) => r.id === targetId) : undefined

  /**
   * تكلفة الوحدة: للمكوّن سعر الشراء الخام (بلا تضخيم الهدر —
   * ما ضاع هو ما دُفع ثمنه فعلاً)، وللمنتج تكلفة القطعة من الوصفة.
   */
  const unitCost = useMemo(() => {
    if (kind === 'recipe') return recipe ? recipeCostFor(data, recipe).perUnit : 0
    if (!ingredient || !unit) return 0
    const perBase = rawUnitCostFor(data, ingredient.id)
    const factor = toBase(1, unit, ingredient.base_unit)
    return factor === null ? 0 : perBase * factor
  }, [kind, ingredient, recipe, unit, data])

  const value = unitCost * (Number(qty) || 0)

  function switchKind(next: TargetKind) {
    setKind(next)
    if (next === 'ingredient') {
      const first = data.ingredients[0]
      setTargetId(first?.id ?? '')
      setUnit(first ? (unitsFor(first.base_unit)[0] ?? '') : '')
    } else {
      setTargetId(data.recipes[0]?.id ?? '')
      setUnit('piece')
    }
  }

  function switchTarget(id: string) {
    setTargetId(id)
    if (kind === 'ingredient') {
      const found = data.ingredients.find((i) => i.id === id)
      setUnit(found ? (unitsFor(found.base_unit)[0] ?? '') : '')
    }
  }

  async function submit() {
    if (!targetId) return setError('اختر المكوّن أو المنتج.')
    if (!unit) return setError('اختر الوحدة.')
    if (!date) return setError('التاريخ مطلوب.')

    const quantityValue = Number(qty)
    if (!Number.isFinite(quantityValue) || quantityValue <= 0) return setError('الكمية لازم تكون أكبر من صفر.')

    setBusy(true)
    setError(null)
    try {
      await saveWaste({
        wasted_on: date,
        ingredient_id: kind === 'ingredient' ? targetId : null,
        recipe_id: kind === 'recipe' ? targetId : null,
        quantity: quantityValue,
        unit,
        unit_cost: round(unitCost, 8),
        reason,
        note: note.trim() || null,
      })
      setQty('')
      setNote('')
      await reload()
    } catch (e) {
      const message = dbErrorMessage(e)
      setError(message)
      onError(message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('حذف سجل الهدر؟')) return
    try {
      await deleteWaste(id)
      await reload()
    } catch (e) {
      onError(dbErrorMessage(e))
    }
  }

  const hasTargets = data.ingredients.length > 0 || data.recipes.length > 0

  return (
    <>
      <PageHeader
        title="الهدر"
        subtitle="القيمة المالية تُحسب تلقائياً من تكلفة المكوّن أو المنتج"
        action={
          <Button onClick={() => void submit()} disabled={busy || !hasTargets}>
            {busy ? 'جاري الحفظ…' : 'تسجيل هدر'}
          </Button>
        }
      />

      {!hasTargets ? (
        <Card>
          <EmptyState title="أضف مكوناً أو وصفة أولاً" hint="قيمة الهدر تُشتق من تكلفتهما." />
        </Card>
      ) : (
        <Card>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
            <Field label="التاريخ" htmlFor="wa-date">
              <TextInput id="wa-date" type="date" value={date} onChange={setDate} />
            </Field>

            <Field label="النوع" htmlFor="wa-kind">
              <Select
                id="wa-kind"
                value={kind}
                onChange={switchKind}
                options={[
                  { value: 'ingredient' as const, label: 'مكوّن' },
                  { value: 'recipe' as const, label: 'منتج جاهز' },
                ]}
              />
            </Field>

            <Field label={kind === 'ingredient' ? 'المكوّن' : 'المنتج'} htmlFor="wa-target">
              <Select
                id="wa-target"
                value={targetId}
                onChange={switchTarget}
                placeholder="اختر"
                options={(kind === 'ingredient' ? data.ingredients : data.recipes).map((x) => ({
                  value: x.id,
                  label: x.name,
                }))}
              />
            </Field>

            <Field label="الكمية" htmlFor="wa-qty">
              <NumberInput id="wa-qty" value={qty} onChange={setQty} />
            </Field>

            <Field label="الوحدة" htmlFor="wa-unit">
              <Select
                id="wa-unit"
                value={unit}
                onChange={(v: Unit) => setUnit(v)}
                placeholder="—"
                options={(ingredient ? unitsFor(ingredient.base_unit) : (['piece'] as Unit[])).map((u) => ({
                  value: u,
                  label: UNIT_LABELS[u],
                }))}
              />
            </Field>

            <Field label="السبب" htmlFor="wa-reason">
              <Select
                id="wa-reason"
                value={reason}
                onChange={(v: WasteReason) => setReason(v)}
                options={ALL_WASTE_REASONS.map((r) => ({ value: r, label: WASTE_REASON_LABELS[r] }))}
              />
            </Field>

            <div className="col-span-2 sm:col-span-4">
              <Field label="ملاحظة" htmlFor="wa-note">
                <TextInput id="wa-note" value={note} onChange={setNote} placeholder="اختياري" />
              </Field>
            </div>

            <div className="col-span-2">
              <ReadOnlyValue label="قيمة الهدر">
                <span className={value > 0 ? 'text-bad' : ''}>{money(value)} ر.س</span>
              </ReadOnlyValue>
            </div>
          </div>

          {unitCost > 0 && Number(qty) > 0 && unit ? (
            <p className="m-0 mt-3 text-[12.5px] text-muted leading-relaxed num">
              {fmtQty(Number(qty))} {UNIT_LABELS[unit]} × {unitPrice(unitCost)} ر.س = {money(value)} ر.س
            </p>
          ) : unitCost === 0 && targetId ? (
            <p className="m-0 mt-3 text-[12.5px] text-warn leading-relaxed">
              لا يوجد سعر مسجّل لهذا العنصر، فقيمة الهدر ستُحفظ صفراً. سجّل سعر شراء أولاً.
            </p>
          ) : null}

          {error ? <p className="m-0 mt-3 text-[13px] text-bad">{error}</p> : null}
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">
        <Card pad={false} className="overflow-hidden">
          <div className="px-5 pt-4 pb-3">
            <CardTitle title="سجل الهدر" subtitle={`${data.waste.length} سجل`} />
          </div>

          {data.waste.length === 0 ? (
            <EmptyState title="لا يوجد هدر مسجّل" hint="تسجيل الهدر يكشف أين تضيع أرباحك فعلاً." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th className="ps-5">التاريخ</Th>
                  <Th>العنصر</Th>
                  <Th>الكمية</Th>
                  <Th>تكلفة الوحدة</Th>
                  <Th>السبب</Th>
                  <Th>القيمة</Th>
                  <Th className="pe-5" />
                </tr>
              </thead>
              <tbody>
                {data.waste.slice(0, 30).map((entry) => {
                  const target = entry.ingredient_id
                    ? data.ingredients.find((i) => i.id === entry.ingredient_id)
                    : data.recipes.find((r) => r.id === entry.recipe_id)

                  return (
                    <tr key={entry.id}>
                      <Td className="ps-5 text-soft">{arabicDateShort(entry.wasted_on)}</Td>
                      <Td>
                        <span className="font-semibold text-[14px]">{target?.name ?? 'محذوف'}</span>
                        {entry.recipe_id ? <span className="text-[11px] text-muted"> (منتج)</span> : null}
                        {entry.note ? (
                          <span className="block text-[11.5px] text-muted mt-0.5">{entry.note}</span>
                        ) : null}
                      </Td>
                      <Td className="num">
                        {fmtQty(entry.quantity)} {UNIT_LABELS[entry.unit]}
                      </Td>
                      <Td className="num text-soft">{unitPrice(entry.unit_cost)}</Td>
                      <Td>
                        <Pill tone={REASON_TONE[entry.reason]}>{WASTE_REASON_LABELS[entry.reason]}</Pill>
                      </Td>
                      <Td className="num font-bold">{money(entry.value)}</Td>
                      <Td className="pe-5">
                        <Button
                          variant="ghost"
                          className="!px-2 !text-[12.5px] !text-bad"
                          onClick={() => void remove(entry.id)}
                        >
                          حذف
                        </Button>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="m-0 text-[16.5px] font-bold">هدر هذا الأسبوع</h2>
            <div className="mt-1 text-[30px] font-bold num text-bad leading-tight">
              {money(weekTotal)} <span className="text-[14px] font-medium text-muted">ر.س</span>
            </div>

            {byReason.length === 0 ? (
              <p className="m-0 mt-3 text-[13px] text-muted">لا يوجد هدر مسجّل هذا الأسبوع.</p>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                {byReason.map((row) => {
                  const share = weekTotal > 0 ? (row.value / weekTotal) * 100 : 0
                  return (
                    <div key={row.reason}>
                      <div className="flex justify-between text-[12.5px] mb-1.5">
                        <span>{WASTE_REASON_LABELS[row.reason as WasteReason] ?? row.reason}</span>
                        <span className="text-muted num">
                          {money(row.value)} · {percent(share, 0)}
                        </span>
                      </div>
                      <ProgressBar percent={share} className="!h-[7px]" />
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {top.length > 0 ? (
            <Card className="!bg-sand">
              <CardTitle title="الأعلى هدراً" subtitle="هذا الأسبوع" />
              <ul className="list-none m-0 p-0">
                {top.map((row) => (
                  <li
                    key={row.label}
                    className="flex justify-between py-2 border-b border-line last:border-0 text-[13.5px]"
                  >
                    <span className="font-semibold">{row.label}</span>
                    <span className="num">{money(row.value)}</span>
                  </li>
                ))}
              </ul>
              {top[0] ? (
                <p className="m-0 mt-3 text-[12.5px] leading-relaxed text-soft">
                  تقليل هدر {top[0].label} بنسبة 20% يوفّر نحو {money(top[0].value * 0.2)} ر.س أسبوعياً.
                </p>
              ) : null}
            </Card>
          ) : null}

          {ingredient ? (
            <p className="m-0 text-[12px] text-muted leading-relaxed px-1">
              تكلفة وحدة {ingredient.name}: {unitPrice(rawUnitCostFor(data, ingredient.id))} ر.س لكل{' '}
              {BASE_UNIT_LABELS[ingredient.base_unit]} — سعر الشراء قبل تضخيم الهدر، لأن ما ضاع هو ما دُفع ثمنه.
            </p>
          ) : null}
        </div>
      </div>
    </>
  )
}
