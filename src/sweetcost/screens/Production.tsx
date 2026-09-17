// ============================================================
// Production.tsx — الإنتاج الفعلي
// يقارن الاستهلاك القياسي حسب الوصفة بالاستهلاك الفعلي،
// ويحفظ لقطة التكلفة لأن الأسعار تتغيّر مع كل دفعة.
// ============================================================

import { useEffect, useMemo, useState } from 'react'

import type { ScreenProps } from '../App.tsx'
import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  NumberInput,
  PageHeader,
  Select,
  Table,
  Td,
  TextInput,
  Th,
} from '../components/UI.tsx'
import { deleteProduction, saveProduction, type ProductionLineInput } from '../lib/api.ts'
import { ingredientCost, profitOf, round } from '../lib/cost.ts'
import { basisFor } from '../lib/derive.ts'
import {
  arabicDateShort,
  money,
  percent,
  quantity as fmtQty,
  signedMoney,
  signedPercent,
  signedQuantity,
  todayISO,
} from '../lib/format.ts'
import { dbErrorMessage } from '../lib/supabase.ts'
import { UNIT_LABELS } from '../lib/units.ts'
import type { Unit } from '../types.ts'

interface Line {
  ingredientId: string
  name: string
  unit: Unit
  standardQty: number
  actualInput: string
  unitCost: number
  standardCost: number
}

export default function ProductionScreen({ data, reload, onError }: ScreenProps) {
  const [recipeId, setRecipeId] = useState(data.recipes[0]?.id ?? '')
  const [date, setDate] = useState(todayISO())
  const [batches, setBatches] = useState('1')
  const [producedUnits, setProducedUnits] = useState('')
  const [soldUnits, setSoldUnits] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const recipe = data.recipes.find((r) => r.id === recipeId) ?? null
  const batchCount = Number(batches) > 0 ? Number(batches) : 0
  const batchWord = recipe?.batch_label ?? 'وصفة'
  const unitWord = recipe?.yield_unit_label ?? 'قطعة'

  // بناء الأسطر من الوصفة — القياسي = كمية الوصفة × عدد الوصفات
  useEffect(() => {
    if (!recipe) {
      setLines([])
      return
    }
    const items = data.recipeItems.filter((item) => item.recipe_id === recipe.id)
    setLines(
      items.map((item) => {
        const ingredient = data.ingredients.find((i) => i.id === item.ingredient_id)
        const baseUnit = ingredient?.base_unit ?? 'g'
        const basis = basisFor(data, item.ingredient_id)
        const standardQty = item.quantity * (Number(batches) > 0 ? Number(batches) : 1)
        const unitCost = basis
          ? ((ingredientCost(basis, 1, item.unit, baseUnit) ?? 0))
          : 0

        return {
          ingredientId: item.ingredient_id,
          name: ingredient?.name ?? 'مكوّن محذوف',
          unit: item.unit,
          standardQty,
          actualInput: String(round(standardQty, 3)),
          unitCost,
          standardCost: unitCost * standardQty,
        }
      }),
    )
  }, [recipe, batches, data])

  // اقتراح الكمية المنتجة من الوصفة
  useEffect(() => {
    if (recipe && batchCount > 0) setProducedUnits(String(round(recipe.yield_units * batchCount, 2)))
  }, [recipe, batchCount])

  const totals = useMemo(() => {
    const standardCost = lines.reduce((s, l) => s + l.standardCost, 0)
    const actualCost = lines.reduce((s, l) => s + l.unitCost * (Number(l.actualInput) || 0), 0)
    const variance = actualCost - standardCost
    return {
      standardCost,
      actualCost,
      variance,
      variancePercent: standardCost > 0 ? (variance / standardCost) * 100 : 0,
    }
  }, [lines])

  const produced = Number(producedUnits) || 0
  const sold = soldUnits === '' ? produced : Number(soldUnits) || 0
  const sellPrice = recipe?.sell_price ?? 0
  const perUnitActual = produced > 0 ? totals.actualCost / produced : 0
  const perUnitStandard = produced > 0 ? totals.standardCost / produced : 0
  const actualMargin = profitOf(sellPrice, perUnitActual)

  function updateActual(ingredientId: string, value: string) {
    setLines((prev) => prev.map((l) => (l.ingredientId === ingredientId ? { ...l, actualInput: value } : l)))
  }

  async function submit() {
    if (!recipe) return setError('اختر الوصفة.')
    if (!date) return setError('التاريخ مطلوب.')
    if (!Number.isFinite(batchCount) || batchCount <= 0) return setError('عدد الوصفات لازم يكون أكبر من صفر.')
    if (!Number.isFinite(produced) || produced <= 0) return setError('الكمية المنتجة لازم تكون أكبر من صفر.')
    if (!Number.isFinite(sold) || sold < 0) return setError('الكمية المباعة لازم تكون رقماً موجباً.')
    if (sold > produced) return setError('الكمية المباعة لا يمكن أن تتجاوز المنتجة.')

    for (const line of lines) {
      const actual = Number(line.actualInput)
      if (!Number.isFinite(actual) || actual < 0) return setError(`${line.name}: الكمية الفعلية غير صحيحة.`)
    }

    const payload: ProductionLineInput[] = lines.map((l) => ({
      ingredient_id: l.ingredientId,
      unit: l.unit,
      standard_qty: round(l.standardQty, 4),
      actual_qty: round(Number(l.actualInput) || 0, 4),
      unit_cost: round(l.unitCost, 8),
    }))

    setBusy(true)
    setError(null)
    try {
      await saveProduction(
        {
          recipe_id: recipe.id,
          produced_on: date,
          batches: batchCount,
          produced_units: produced,
          sold_units: sold,
          sell_price: sellPrice,
          standard_cost: round(totals.standardCost, 4),
          actual_cost: round(totals.actualCost, 4),
          notes: null,
        },
        payload,
      )
      setSoldUnits('')
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
    if (!window.confirm('حذف هذه الدفعة؟')) return
    try {
      await deleteProduction(id)
      await reload()
    } catch (e) {
      onError(dbErrorMessage(e))
    }
  }

  if (data.recipes.length === 0) {
    return (
      <>
        <PageHeader title="الإنتاج الفعلي" />
        <Card>
          <EmptyState title="أنشئ وصفة أولاً" hint="الإنتاج يقارن الاستهلاك الفعلي بوصفة قياسية." />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="الإنتاج الفعلي"
        subtitle="قارن الاستهلاك القياسي حسب الوصفة بالاستهلاك الفعلي في المطبخ"
        action={
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'جاري الحفظ…' : 'تسجيل الدفعة'}
          </Button>
        }
      />

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          <Field label="التاريخ" htmlFor="pr-date">
            <TextInput id="pr-date" type="date" value={date} onChange={setDate} />
          </Field>
          <Field label="المنتج / الوصفة" htmlFor="pr-recipe">
            <Select
              id="pr-recipe"
              value={recipeId}
              onChange={setRecipeId}
              options={data.recipes.map((r) => ({ value: r.id, label: r.name }))}
            />
          </Field>
          <Field label={`عدد الـ${batchWord}`} htmlFor="pr-batches">
            <NumberInput id="pr-batches" value={batches} onChange={setBatches} step="0.5" />
          </Field>
          <Field label="الكمية المنتجة" htmlFor="pr-produced" hint={unitWord}>
            <NumberInput id="pr-produced" value={producedUnits} onChange={setProducedUnits} />
          </Field>
          <Field label="الكمية المباعة" htmlFor="pr-sold" hint="فارغ = كل المنتج بيع">
            <NumberInput id="pr-sold" value={soldUnits} onChange={setSoldUnits} placeholder={String(produced)} />
          </Field>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">
        <Card pad={false} className="overflow-hidden">
          <div className="px-5 pt-4 pb-3">
            <CardTitle
              title="القياسي مقابل الفعلي"
              subtitle={recipe ? `${recipe.name} · ${batchCount} ${batchWord} · ${fmtQty(produced)} ${unitWord}` : ''}
            />
          </div>

          {lines.length === 0 ? (
            <EmptyState title="هذه الوصفة بلا مكونات" hint="أضف مكوناتها من شاشة الوصفات." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th className="ps-5">المكون</Th>
                  <Th>قياسي</Th>
                  <Th>فعلي</Th>
                  <Th>الفرق</Th>
                  <Th className="pe-5">تأثير التكلفة</Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const actual = Number(line.actualInput) || 0
                  const diff = actual - line.standardQty
                  const impact = diff * line.unitCost
                  const tone = diff > 0 ? 'text-bad' : diff < 0 ? 'text-good' : 'text-soft'

                  return (
                    <tr key={line.ingredientId}>
                      <Td className="ps-5 font-semibold text-[14px]">{line.name}</Td>
                      <Td className="num text-soft">
                        {fmtQty(line.standardQty)} {UNIT_LABELS[line.unit]}
                      </Td>
                      <Td className="w-[130px]">
                        <label htmlFor={`pi-${line.ingredientId}`} className="sr-only">
                          الكمية الفعلية لـ{line.name}
                        </label>
                        <NumberInput
                          id={`pi-${line.ingredientId}`}
                          value={line.actualInput}
                          onChange={(v) => updateActual(line.ingredientId, v)}
                        />
                      </Td>
                      <Td className={`num font-semibold ${tone}`}>
                        {diff === 0 ? '—' : `${signedQuantity(diff)} ${UNIT_LABELS[line.unit]}`}
                      </Td>
                      <Td className={`pe-5 num font-semibold ${tone}`}>
                        {Math.abs(impact) < 0.005 ? '—' : signedMoney(impact)}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-cream">
                  <td colSpan={4} className="px-5 py-3.5 text-right text-[14.5px] font-bold border-t border-line">
                    صافي أثر الانحراف على تكلفة الدفعة
                  </td>
                  <td
                    className={`px-5 py-3.5 text-right text-[17px] font-bold num border-t border-line ${
                      totals.variance > 0 ? 'text-bad' : totals.variance < 0 ? 'text-good' : ''
                    }`}
                  >
                    {Math.abs(totals.variance) < 0.005 ? '—' : signedMoney(totals.variance)}
                  </td>
                </tr>
              </tfoot>
            </Table>
          )}

          <p className="m-0 px-5 py-3 text-[12.5px] text-muted bg-cream border-t border-line">
            تأثير التكلفة = الفرق في الكمية × التكلفة الفعلية للوحدة من شاشة المكونات.
          </p>
        </Card>

        <div className="flex flex-col gap-4">
          <div className="bg-bark rounded-2xl p-5 text-[#f1ede0]">
            <h2 className="m-0 mb-4 text-[16.5px] font-bold text-honey">تكلفة الدفعة</h2>
            <dl className="m-0 flex flex-col gap-2.5">
              <DarkRow label="التكلفة القياسية" value={money(totals.standardCost)} />
              <DarkRow label="التكلفة الفعلية" value={money(totals.actualCost)} strong />
              <DarkRow
                label="الانحراف"
                value={`${signedMoney(totals.variance)} · ${signedPercent(totals.variancePercent)}`}
                tone={totals.variance > 0 ? 'bad' : totals.variance < 0 ? 'good' : undefined}
                bordered
              />
            </dl>

            <div className="bg-bark-2 rounded-xl p-4 mt-4 flex flex-col gap-2.5">
              <DarkRow label={`تكلفة الـ${unitWord} القياسية`} value={money(perUnitStandard)} />
              <DarkRow
                label={`تكلفة الـ${unitWord} الفعلية`}
                value={money(perUnitActual)}
                tone={perUnitActual > perUnitStandard ? 'bad' : undefined}
                strong
              />
              <DarkRow label="الهامش الفعلي" value={percent(actualMargin.marginPercent)} bordered />
            </div>

            <p className="m-0 mt-4 text-[12.5px] leading-relaxed text-[#93a683]">
              التكلفة تُحفظ مع الدفعة كما هي الآن، فلا تتغيّر أرقام الماضي عند تغيّر أسعار المكونات لاحقاً.
            </p>
          </div>

          {error ? <p className="m-0 text-[13px] text-bad">{error}</p> : null}

          <Card>
            <CardTitle title="دفعات سابقة" />
            {data.productions.length === 0 ? (
              <EmptyState title="لا توجد دفعات مسجّلة" />
            ) : (
              <ul className="list-none m-0 p-0">
                {data.productions.slice(0, 8).map((production) => {
                  const r = data.recipes.find((x) => x.id === production.recipe_id)
                  const variance = production.actual_cost - production.standard_cost
                  const pct = production.standard_cost > 0 ? (variance / production.standard_cost) * 100 : 0

                  return (
                    <li
                      key={production.id}
                      className="flex items-center justify-between gap-3 py-2.5 border-b border-line-soft last:border-0"
                    >
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold truncate">{r?.name ?? 'وصفة محذوفة'}</div>
                        <div className="text-[12px] text-muted mt-0.5">
                          {arabicDateShort(production.produced_on)} · {fmtQty(production.produced_units)}{' '}
                          {r?.yield_unit_label ?? 'قطعة'} ·{' '}
                          {money(production.revenue)} ر.س
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[13px] font-semibold num ${
                            variance > 0 ? 'text-bad' : variance < 0 ? 'text-good' : 'text-muted'
                          }`}
                        >
                          {signedPercent(pct)}
                        </span>
                        <Button
                          variant="ghost"
                          className="!px-2 !text-[12.5px] !text-bad !min-h-9"
                          onClick={() => void remove(production.id)}
                        >
                          حذف
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

function DarkRow({
  label,
  value,
  bordered = false,
  strong = false,
  tone,
}: {
  label: string
  value: string
  bordered?: boolean
  strong?: boolean
  tone?: 'good' | 'bad'
}) {
  const color = tone === 'bad' ? 'text-[#e9a58c]' : tone === 'good' ? 'text-[#bbd79a]' : ''
  return (
    <div className={`flex justify-between items-baseline ${bordered ? 'border-t border-bark-3 pt-2.5' : ''}`}>
      <dt className="text-[13px] text-[#a3b491]">{label}</dt>
      <dd className={`m-0 text-[14.5px] num ${strong ? 'font-bold' : 'font-semibold'} ${color}`}>{value}</dd>
    </div>
  )
}
