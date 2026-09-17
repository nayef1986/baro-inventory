// ============================================================
// Recipes.tsx — الوصفات
// التكلفة تُحسب لحظياً من الأسعار الحالية، ولا تُخزَّن أبداً.
// ============================================================

import { useEffect, useMemo, useState } from 'react'

import type { ScreenProps } from '../App.tsx'
import {
  Button,
  Card,
  EmptyState,
  Field,
  NumberInput,
  PageHeader,
  Pill,
  ProgressBar,
  Select,
  Table,
  Td,
  TextInput,
  Th,
} from '../components/UI.tsx'
import { deleteRecipe, saveRecipe, type RecipeLineInput } from '../lib/api.ts'
import { profitOf, recipeCost, type RecipeLineInput as EngineLine } from '../lib/cost.ts'
import { basisFor, recipeCostFor } from '../lib/derive.ts'
import { money, percent, unitPrice } from '../lib/format.ts'
import { dbErrorMessage } from '../lib/supabase.ts'
import { UNIT_LABELS, unitsFor } from '../lib/units.ts'
import type { Recipe, Unit } from '../types.ts'

interface DraftLine {
  key: string
  ingredientId: string
  quantity: string
  unit: Unit | ''
}

let lineCounter = 0
const nextKey = () => `line-${++lineCounter}`

export default function RecipesScreen({ data, reload, onError }: ScreenProps) {
  const [selectedId, setSelectedId] = useState<string | null>(data.recipes[0]?.id ?? null)
  const [isNew, setIsNew] = useState(false)

  const selected = data.recipes.find((r) => r.id === selectedId) ?? null

  async function remove(recipe: Recipe) {
    if (!window.confirm(`حذف وصفة «${recipe.name}»؟`)) return
    try {
      await deleteRecipe(recipe.id)
      setSelectedId(null)
      await reload()
    } catch (e) {
      onError(dbErrorMessage(e))
    }
  }

  return (
    <>
      <PageHeader
        title="الوصفات"
        subtitle={`${data.recipes.length} وصفة · التكلفة تُعاد حسابتها مع كل تغيّر في أسعار المكونات`}
        action={
          <Button
            onClick={() => {
              setIsNew(true)
              setSelectedId(null)
            }}
            disabled={data.ingredients.length === 0}
          >
            وصفة جديدة
          </Button>
        }
      />

      {data.ingredients.length === 0 ? (
        <Card>
          <EmptyState
            title="أضف المكونات أولاً"
            hint="الوصفة تحتاج مكونات لها أسعار مسجّلة حتى تُحسب تكلفتها."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[230px_1fr] gap-5 items-start">
          <Card pad={false} className="p-2.5">
            {data.recipes.length === 0 ? (
              <EmptyState title="لا توجد وصفات" />
            ) : (
              <ul className="list-none m-0 p-0 flex flex-col gap-0.5">
                {data.recipes.map((recipe) => {
                  const cost = recipeCostFor(data, recipe)
                  const p = profitOf(recipe.sell_price, cost.perUnit)
                  const active = recipe.id === selectedId

                  return (
                    <li key={recipe.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsNew(false)
                          setSelectedId(recipe.id)
                        }}
                        className={`w-full text-right min-h-11 px-3 py-2.5 rounded-xl cursor-pointer border-0 ${
                          active ? 'bg-sand' : 'bg-transparent hover:bg-cream'
                        }`}
                      >
                        <span className={`block text-[14px] ${active ? 'font-semibold' : 'font-medium'}`}>
                          {recipe.name}
                        </span>
                        <span
                          className={`block text-[12px] mt-0.5 num ${
                            cost.incompleteCount > 0
                              ? 'text-warn'
                              : p.marginPercent < 35
                                ? 'text-bad'
                                : 'text-muted'
                          }`}
                        >
                          {cost.incompleteCount > 0 ? 'تكلفة غير مكتملة' : `هامش ${percent(p.marginPercent)}`}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {isNew || selected ? (
            <RecipeEditor
              key={selected?.id ?? 'new'}
              data={data}
              recipe={selected}
              onDelete={selected ? () => void remove(selected) : undefined}
              onSaved={async (id) => {
                setIsNew(false)
                setSelectedId(id)
                await reload()
              }}
              onError={onError}
            />
          ) : (
            <Card>
              <EmptyState title="اختر وصفة" hint="أو أنشئ وصفة جديدة لحساب تكلفتها وربحها." />
            </Card>
          )}
        </div>
      )}
    </>
  )
}

// ─── محرر الوصفة ─────────────────────────────────────────────

function RecipeEditor({
  data,
  recipe,
  onSaved,
  onDelete,
  onError,
}: {
  data: ScreenProps['data']
  recipe: Recipe | null
  onSaved: (id: string) => Promise<void>
  onDelete?: () => void
  onError: (message: string) => void
}) {
  const [name, setName] = useState(recipe?.name ?? '')
  const [sellPrice, setSellPrice] = useState(String(recipe?.sell_price ?? ''))
  const [yieldUnits, setYieldUnits] = useState(String(recipe?.yield_units ?? '1'))
  const [batchLabel, setBatchLabel] = useState(recipe?.batch_label ?? 'صينية')
  const [yieldUnitLabel, setYieldUnitLabel] = useState(recipe?.yield_unit_label ?? 'قطعة')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!recipe) {
      setLines([{ key: nextKey(), ingredientId: '', quantity: '', unit: '' }])
      return
    }
    setLines(
      data.recipeItems
        .filter((item) => item.recipe_id === recipe.id)
        .map((item) => ({
          key: nextKey(),
          ingredientId: item.ingredient_id,
          quantity: String(item.quantity),
          unit: item.unit,
        })),
    )
  }, [recipe, data.recipeItems])

  // الحساب الحيّ — نفس محرك التكلفة المستخدم في كل مكان
  const engineLines: EngineLine[] = useMemo(
    () =>
      lines
        .map((line) => {
          const ingredient = data.ingredients.find((i) => i.id === line.ingredientId)
          if (!ingredient || !line.unit) return null
          return {
            ingredientId: line.ingredientId,
            quantity: Number(line.quantity) || 0,
            unit: line.unit,
            baseUnit: ingredient.base_unit,
            basis: basisFor(data, line.ingredientId),
          }
        })
        .filter((l): l is EngineLine => l !== null),
    [lines, data],
  )

  const yieldValue = Number(yieldUnits) > 0 ? Number(yieldUnits) : 1
  const cost = recipeCost(engineLines, yieldValue)
  const price = Number(sellPrice) || 0
  const p = profitOf(price, cost.perUnit)

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function onIngredientChange(key: string, ingredientId: string) {
    const ingredient = data.ingredients.find((i) => i.id === ingredientId)
    updateLine(key, {
      ingredientId,
      unit: ingredient ? (unitsFor(ingredient.base_unit)[0] ?? '') : '',
    })
  }

  async function submit() {
    if (!name.trim()) return setError('اسم المنتج مطلوب.')
    if (!batchLabel.trim()) return setError('اسم الوعاء مطلوب (صينية، زبدية…).')
    if (!yieldUnitLabel.trim()) return setError('وحدة البيع مطلوبة (قطعة، حبة…).')
    if (!Number.isFinite(yieldValue) || yieldValue <= 0) return setError('عدد القطع لازم يكون أكبر من صفر.')
    if (!Number.isFinite(price) || price < 0) return setError('سعر البيع لازم يكون رقماً موجباً.')

    const payload: RecipeLineInput[] = []
    for (const [index, line] of lines.entries()) {
      if (!line.ingredientId && !line.quantity) continue
      if (!line.ingredientId) return setError(`المكوّن ${index + 1}: اختر المكوّن.`)
      if (!line.unit) return setError(`المكوّن ${index + 1}: اختر الوحدة.`)

      const quantity = Number(line.quantity)
      if (!Number.isFinite(quantity) || quantity <= 0) return setError(`المكوّن ${index + 1}: الكمية لازم تكون أكبر من صفر.`)

      payload.push({ ingredient_id: line.ingredientId, quantity, unit: line.unit })
    }

    if (payload.length === 0) return setError('أضف مكوّناً واحداً على الأقل.')

    const ids = payload.map((l) => l.ingredient_id)
    if (new Set(ids).size !== ids.length) return setError('لا تكرّر المكوّن نفسه في الوصفة — اجمع الكمية في سطر واحد.')

    setBusy(true)
    setError(null)
    try {
      const id = await saveRecipe(
        {
          name: name.trim(),
          sell_price: price,
          yield_units: yieldValue,
          batch_label: batchLabel.trim(),
          yield_unit_label: yieldUnitLabel.trim(),
          notes: recipe?.notes ?? null,
        },
        payload,
        recipe?.id,
      )
      await onSaved(id)
    } catch (e) {
      const message = dbErrorMessage(e)
      setError(message)
      onError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_286px] gap-4 items-start">
      <div className="flex flex-col gap-4">
        <Card>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <Field label="اسم المنتج" htmlFor="r-name">
                <TextInput id="r-name" value={name} onChange={setName} />
              </Field>
            </div>
            <Field label="الوعاء" htmlFor="r-batch" hint="صينية، زبدية، قالب…">
              <TextInput id="r-batch" value={batchLabel} onChange={setBatchLabel} />
            </Field>
            <Field label="وحدة البيع" htmlFor="r-unitlabel" hint="قطعة، حبة، كوب…">
              <TextInput id="r-unitlabel" value={yieldUnitLabel} onChange={setYieldUnitLabel} />
            </Field>
            <Field label={`عدد الـ${yieldUnitLabel || 'قطع'}`} htmlFor="r-yield" hint={`في الـ${batchLabel || 'وعاء'}`}>
              <NumberInput id="r-yield" value={yieldUnits} onChange={setYieldUnits} />
            </Field>
            <Field label={`سعر بيع الـ${yieldUnitLabel || 'قطعة'}`} htmlFor="r-price">
              <NumberInput id="r-price" value={sellPrice} onChange={setSellPrice} step="0.25" />
            </Field>
          </div>
          <p className="m-0 mt-3 text-[12.5px] text-muted leading-relaxed">
            {batchLabel || 'وعاء'} واحدة فيها {yieldValue} {yieldUnitLabel || 'قطعة'}، وتُباع بـ{' '}
            <span className="num">{money(price * yieldValue)}</span> ر.س.
          </p>
        </Card>

        <Card pad={false} className="overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
            <h2 className="m-0 text-[16.5px] font-bold">مكونات الوصفة</h2>
            <Button
              variant="secondary"
              className="!px-3.5 !text-[13.5px]"
              onClick={() => setLines((prev) => [...prev, { key: nextKey(), ingredientId: '', quantity: '', unit: '' }])}
            >
              إضافة مكون
            </Button>
          </div>

          <Table>
            <thead>
              <tr>
                <Th className="ps-5">المكون</Th>
                <Th>الكمية</Th>
                <Th>الوحدة</Th>
                <Th>تكلفة الوحدة</Th>
                <Th>التكلفة</Th>
                <Th className="pe-5" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const ingredient = data.ingredients.find((i) => i.id === line.ingredientId)
                const computed = cost.lines.find((l) => l.ingredientId === line.ingredientId)

                return (
                  <tr key={line.key}>
                    <Td className="ps-5 min-w-[160px]">
                      <label htmlFor={`rl-ing-${line.key}`} className="sr-only">
                        المكون
                      </label>
                      <Select
                        id={`rl-ing-${line.key}`}
                        value={line.ingredientId}
                        onChange={(v) => onIngredientChange(line.key, v)}
                        placeholder="اختر مكوناً"
                        options={data.ingredients.map((i) => ({ value: i.id, label: i.name }))}
                      />
                    </Td>
                    <Td className="w-[110px]">
                      <label htmlFor={`rl-qty-${line.key}`} className="sr-only">
                        الكمية
                      </label>
                      <NumberInput
                        id={`rl-qty-${line.key}`}
                        value={line.quantity}
                        onChange={(v) => updateLine(line.key, { quantity: v })}
                      />
                    </Td>
                    <Td className="w-[110px]">
                      <label htmlFor={`rl-unit-${line.key}`} className="sr-only">
                        الوحدة
                      </label>
                      <Select
                        id={`rl-unit-${line.key}`}
                        value={line.unit}
                        onChange={(v: Unit) => updateLine(line.key, { unit: v })}
                        placeholder="—"
                        options={(ingredient ? unitsFor(ingredient.base_unit) : []).map((u) => ({
                          value: u,
                          label: UNIT_LABELS[u],
                        }))}
                      />
                    </Td>
                    <Td className="num text-soft">
                      {computed && computed.problem === null ? unitPrice(computed.unitCost) : '—'}
                    </Td>
                    <Td className="num font-semibold">
                      {computed?.problem === 'no_price' ? (
                        <Pill tone="warn">بلا سعر</Pill>
                      ) : computed?.problem === 'unit_mismatch' ? (
                        <Pill tone="bad">وحدة خاطئة</Pill>
                      ) : computed ? (
                        money(computed.cost)
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="pe-5">
                      <Button
                        variant="ghost"
                        className="!px-2 !text-[12.5px] !text-bad"
                        onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                      >
                        حذف
                      </Button>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-cream">
                <td colSpan={4} className="px-5 py-3.5 text-right text-[14.5px] font-bold border-t border-line">
                  {`إجمالي تكلفة الـ${batchLabel || 'وصفة'}`}
                </td>
                <td className="px-3 py-3.5 text-right text-[17px] font-bold num border-t border-line" colSpan={2}>
                  {money(cost.total)}
                </td>
              </tr>
            </tfoot>
          </Table>

          {cost.incompleteCount > 0 ? (
            <p className="m-0 px-5 py-3 text-[12.5px] text-warn bg-warn-soft border-t border-line leading-relaxed">
              {cost.incompleteCount} مكوّن بلا سعر أو بوحدة غير متوافقة — التكلفة المعروضة ناقصة حتى تُصلحه.
            </p>
          ) : null}
        </Card>

        {error ? <p className="m-0 text-[13px] text-bad">{error}</p> : null}
      </div>

      <aside className="bg-bark rounded-2xl p-5 text-[#f5efe6] flex flex-col gap-4">
        <h2 className="m-0 text-[16.5px] font-bold text-honey">التكلفة والربح</h2>

        <dl className="m-0 flex flex-col gap-2.5">
          <Row label={`تكلفة الـ${batchLabel || 'وصفة'}`} value={money(cost.total)} />
          <Row label={`عدد الـ${yieldUnitLabel || 'قطع'} في الـ${batchLabel || 'وعاء'}`} value={String(yieldValue)} />
          <Row label={`تكلفة الـ${yieldUnitLabel || 'قطعة'}`} value={money(cost.perUnit)} bordered />
          <Row label={`سعر بيع الـ${yieldUnitLabel || 'قطعة'}`} value={money(price)} />
        </dl>

        <div className="bg-bark-2 rounded-xl p-4">
          <div className="text-[12.5px] text-[#bfae99]">الربح للـ{yieldUnitLabel || 'قطعة'}</div>
          <div className={`mt-1 text-[30px] font-bold num leading-tight ${p.profit < 0 ? 'text-[#f0a28e]' : ''}`}>
            {money(p.profit)} <span className="text-[14px] font-medium text-[#bfae99]">ر.س</span>
          </div>
          <ProgressBar percent={Math.max(0, p.marginPercent)} className="mt-3.5 !bg-[#48382c]" />
          <div className="flex justify-between mt-2 text-[12.5px] text-[#bfae99] num">
            <span>هامش الربح</span>
            <span className={`font-semibold ${p.marginPercent < 35 ? 'text-[#f0a28e]' : 'text-[#8fd3b8]'}`}>
              {percent(p.marginPercent)}
            </span>
          </div>
        </div>

        <dl className="m-0">
          <Row label={`إجمالي بيع الـ${batchLabel || 'وصفة'}`} value={money(price * yieldValue)} bordered />
        </dl>

        {p.profit < 0 && price > 0 ? (
          <p className="m-0 text-[12.5px] leading-relaxed text-[#f0a28e]">
            سعر البيع أقل من التكلفة. راجع السعر أو مكونات الوصفة.
          </p>
        ) : null}

        <div className="mt-auto flex flex-col gap-2">
          <Button onClick={() => void submit()} disabled={busy} className="w-full">
            {busy ? 'جاري الحفظ…' : recipe ? 'حفظ التعديلات' : 'حفظ الوصفة'}
          </Button>
          {onDelete ? (
            <Button variant="ghost" onClick={onDelete} className="w-full !text-[#f0a28e]">
              حذف الوصفة
            </Button>
          ) : null}
        </div>
      </aside>
    </div>
  )
}

function Row({ label, value, bordered = false }: { label: string; value: string; bordered?: boolean }) {
  return (
    <div className={`flex justify-between items-baseline ${bordered ? 'border-t border-bark-3 pt-2.5' : ''}`}>
      <dt className="text-[13.5px] text-[#bfae99]">{label}</dt>
      <dd className="m-0 text-[15px] font-semibold num">{value}</dd>
    </div>
  )
}
