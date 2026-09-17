// ============================================================
// Ingredients.tsx — المكونات والأسعار
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
  Select,
  Table,
  Td,
  TextInput,
  Th,
} from '../components/UI.tsx'
import { addPrice, deleteIngredient, saveIngredient, type IngredientInput } from '../lib/api.ts'
import { baseUnitCost, effectiveUnitCost, round } from '../lib/cost.ts'
import { basisFor } from '../lib/derive.ts'
import { arabicDate, money, percent, todayISO, unitPrice } from '../lib/format.ts'
import { dbErrorMessage } from '../lib/supabase.ts'
import {
  ALL_BASE_UNITS,
  BASE_UNIT_LABELS,
  UNIT_LABELS,
  baseToPackageSize,
  packageLabel,
  packageSizeToBase,
  purchaseUnitsFor,
} from '../lib/units.ts'
import type { BaseUnit, Ingredient, Unit } from '../types.ts'

interface FormState {
  name: string
  baseUnit: BaseUnit
  purchaseUnit: Unit
  packageSize: string
  wastePercent: string
  supplierId: string
}

const EMPTY_FORM: FormState = {
  name: '',
  baseUnit: 'g',
  purchaseUnit: 'kg',
  packageSize: '',
  wastePercent: '0',
  supplierId: '',
}

export default function IngredientsScreen({ data, reload, onError }: ScreenProps) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(data.ingredients[0]?.id ?? null)
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [showPriceForm, setShowPriceForm] = useState(false)
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim()
    if (!q) return data.ingredients
    return data.ingredients.filter((i) => i.name.includes(q))
  }, [data.ingredients, search])

  const selected = data.ingredients.find((i) => i.id === selectedId) ?? null

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(ingredient: Ingredient) {
    setEditing(ingredient)
    setForm({
      name: ingredient.name,
      baseUnit: ingredient.base_unit,
      purchaseUnit: ingredient.purchase_unit,
      packageSize: String(
        round(baseToPackageSize(ingredient.package_size, ingredient.purchase_unit, ingredient.base_unit), 4),
      ),
      wastePercent: String(ingredient.waste_percent),
      supplierId: ingredient.supplier_id ?? '',
    })
    setFormError(null)
    setShowForm(true)
  }

  function validate(): IngredientInput | string {
    const name = form.name.trim()
    if (!name) return 'اسم المكون مطلوب.'

    const sizeInput = Number(form.packageSize)
    if (!Number.isFinite(sizeInput) || sizeInput <= 0) return 'حجم العبوة لازم يكون رقماً أكبر من صفر.'

    const packageSize = packageSizeToBase(sizeInput, form.purchaseUnit, form.baseUnit)
    if (packageSize === null || packageSize <= 0) {
      return `وحدة الشراء «${UNIT_LABELS[form.purchaseUnit]}» لا تتوافق مع وحدة القياس «${BASE_UNIT_LABELS[form.baseUnit]}».`
    }

    const waste = Number(form.wastePercent)
    if (!Number.isFinite(waste) || waste < 0 || waste >= 100) return 'نسبة الهدر لازم تكون بين 0 و 99.99.'

    return {
      name,
      base_unit: form.baseUnit,
      purchase_unit: form.purchaseUnit,
      package_size: packageSize,
      waste_percent: waste,
      supplier_id: form.supplierId || null,
    }
  }

  async function submit() {
    const result = validate()
    if (typeof result === 'string') {
      setFormError(result)
      return
    }
    setBusy(true)
    try {
      const id = await saveIngredient(result, editing?.id)
      await reload()
      setSelectedId(id)
      setShowForm(false)
    } catch (e) {
      setFormError(dbErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(ingredient: Ingredient) {
    if (!window.confirm(`حذف «${ingredient.name}»؟ لا يمكن التراجع.`)) return
    try {
      await deleteIngredient(ingredient.id)
      if (selectedId === ingredient.id) setSelectedId(null)
      await reload()
    } catch (e) {
      onError(dbErrorMessage(e))
    }
  }

  return (
    <>
      <PageHeader
        title="المكونات والأسعار"
        subtitle={`${data.ingredients.length} مكوّن · التكلفة الفعلية تُحسب من آخر سعر بعد احتساب الهدر`}
        action={
          <div className="flex items-center gap-2">
            <label htmlFor="ing-search" className="sr-only">
              بحث في المكونات
            </label>
            <div className="w-[190px]">
              <TextInput id="ing-search" type="search" value={search} onChange={setSearch} placeholder="ابحث عن مكون…" />
            </div>
            <Button onClick={openNew}>مكون جديد</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_1fr] gap-5 items-start">
        <Card pad={false} className="overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              title={data.ingredients.length === 0 ? 'لا توجد مكونات بعد' : 'لا نتائج للبحث'}
              hint={
                data.ingredients.length === 0
                  ? 'أضف أول مكون، ثم سجّل سعر شرائه — وستُحسب تكلفة كل وصفة تستخدمه تلقائياً.'
                  : undefined
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th className="ps-5">المكون</Th>
                  <Th>العبوة</Th>
                  <Th>آخر سعر</Th>
                  <Th>سعر الوحدة</Th>
                  <Th>هدر</Th>
                  <Th>تكلفة فعلية</Th>
                  <Th className="pe-5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((ingredient) => {
                  const latest = data.latest[ingredient.id]
                  const basis = basisFor(data, ingredient.id)
                  const isSelected = ingredient.id === selectedId
                  const supplier = data.suppliers.find((s) => s.id === ingredient.supplier_id)

                  return (
                    <tr
                      key={ingredient.id}
                      onClick={() => setSelectedId(ingredient.id)}
                      className={`cursor-pointer ${isSelected ? 'bg-sand/60' : 'hover:bg-cream'}`}
                    >
                      <Td className="ps-5">
                        <span className="font-semibold text-[14px]">{ingredient.name}</span>
                        <span className="block text-[11.5px] text-muted mt-0.5">
                          {supplier?.name ?? 'بدون مورد'}
                        </span>
                      </Td>
                      <Td className="num">
                        {packageLabel(ingredient.package_size, ingredient.purchase_unit, ingredient.base_unit)}
                      </Td>
                      <Td className="num">
                        {latest?.last_price != null ? money(latest.last_price) : <Pill tone="warn">بلا سعر</Pill>}
                      </Td>
                      <Td className="num text-soft">
                        {basis ? `${unitPrice(baseUnitCost(basis))} / ${BASE_UNIT_LABELS[ingredient.base_unit]}` : '—'}
                      </Td>
                      <Td className={`num ${ingredient.waste_percent >= 10 ? 'text-bad font-semibold' : ''}`}>
                        {percent(ingredient.waste_percent, 0)}
                      </Td>
                      <Td className="num font-semibold">
                        {basis
                          ? `${unitPrice(effectiveUnitCost(basis))} / ${BASE_UNIT_LABELS[ingredient.base_unit]}`
                          : '—'}
                      </Td>
                      <Td className="pe-5">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            className="!px-2.5 !text-[13px]"
                            onClick={() => openEdit(ingredient)}
                          >
                            تعديل
                          </Button>
                          <Button
                            variant="ghost"
                            className="!px-2.5 !text-[13px] !text-bad"
                            onClick={() => void remove(ingredient)}
                          >
                            حذف
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
          <p className="m-0 px-5 py-3 text-[12.5px] text-muted bg-cream border-t border-line">
            «تكلفة فعلية» = سعر الوحدة ÷ (1 − نسبة الهدر). هي الرقم الذي تستخدمه الوصفات.
          </p>
        </Card>

        <div className="flex flex-col gap-4">
          <PriceHistory
            data={data}
            ingredient={selected}
            onAddPrice={() => setShowPriceForm(true)}
          />
          <CostEngineCard />
        </div>
      </div>

      {showForm ? (
        <Modal
          title={editing ? `تعديل «${editing.name}»` : 'مكون جديد'}
          onClose={() => setShowForm(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                إلغاء
              </Button>
              <Button onClick={() => void submit()} disabled={busy}>
                {busy ? 'جاري الحفظ…' : 'حفظ'}
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="اسم المكون" htmlFor="f-name">
              <TextInput id="f-name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            </Field>

            <Field label="المورد" htmlFor="f-supplier">
              <Select
                id="f-supplier"
                value={form.supplierId}
                onChange={(v) => setForm({ ...form, supplierId: v })}
                placeholder="بدون مورد"
                options={data.suppliers.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Field>

            <Field label="وحدة القياس" htmlFor="f-base" hint="الوحدة المستخدمة في الوصفات">
              <Select
                id="f-base"
                value={form.baseUnit}
                onChange={(v: BaseUnit) => {
                  const units = purchaseUnitsFor(v)
                  setForm({ ...form, baseUnit: v, purchaseUnit: units[0] ?? 'pack' })
                }}
                options={ALL_BASE_UNITS.map((u) => ({ value: u, label: BASE_UNIT_LABELS[u] }))}
              />
            </Field>

            <Field label="وحدة الشراء" htmlFor="f-purchase">
              <Select
                id="f-purchase"
                value={form.purchaseUnit}
                onChange={(v: Unit) => setForm({ ...form, purchaseUnit: v })}
                options={purchaseUnitsFor(form.baseUnit).map((u) => ({ value: u, label: UNIT_LABELS[u] }))}
              />
            </Field>

            <Field
              label="حجم العبوة"
              htmlFor="f-size"
              hint={
                form.purchaseUnit === 'pack'
                  ? `عدد الـ${BASE_UNIT_LABELS[form.baseUnit]} داخل العلبة`
                  : `بوحدة ${UNIT_LABELS[form.purchaseUnit]}`
              }
            >
              <NumberInput
                id="f-size"
                value={form.packageSize}
                onChange={(v) => setForm({ ...form, packageSize: v })}
              />
            </Field>

            <Field label="نسبة الهدر %" htmlFor="f-waste" hint="ما يضيع من العبوة قبل أن يصل للطبق">
              <NumberInput
                id="f-waste"
                value={form.wastePercent}
                onChange={(v) => setForm({ ...form, wastePercent: v })}
                step="0.1"
              />
            </Field>
          </div>

          {formError ? <p className="mt-4 mb-0 text-[13px] text-bad">{formError}</p> : null}
        </Modal>
      ) : null}

      {showPriceForm && selected ? (
        <PriceModal
          ingredient={selected}
          onClose={() => setShowPriceForm(false)}
          onSaved={async () => {
            setShowPriceForm(false)
            await reload()
          }}
        />
      ) : null}
    </>
  )
}

// ─── سجل الأسعار ─────────────────────────────────────────────

function PriceHistory({
  data,
  ingredient,
  onAddPrice,
}: {
  data: ScreenProps['data']
  ingredient: Ingredient | null
  onAddPrice: () => void
}) {
  if (!ingredient) {
    return (
      <Card>
        <EmptyState title="اختر مكوناً" hint="اضغط على أي صف في الجدول لعرض سجل أسعاره." />
      </Card>
    )
  }

  const history = data.prices
    .filter((p) => p.ingredient_id === ingredient.id)
    .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date))
  const latest = data.latest[ingredient.id]

  return (
    <Card>
      <CardTitle
        title={`سجل أسعار ${ingredient.name}`}
        subtitle={`${history.length} سجل`}
        action={
          <Button variant="secondary" className="!px-3 !text-[13px]" onClick={onAddPrice}>
            تسجيل سعر
          </Button>
        }
      />

      <div className="flex gap-2.5">
        <div className="flex-1 bg-cream rounded-xl px-3 py-2.5">
          <div className="text-[11.5px] text-muted">آخر سعر شراء</div>
          <div className="mt-1 text-[19px] font-bold num">
            {latest?.last_price != null ? money(latest.last_price) : '—'}
          </div>
        </div>
        <div className="flex-1 bg-cream rounded-xl px-3 py-2.5">
          <div className="text-[11.5px] text-muted">متوسط سعر الشراء</div>
          <div className="mt-1 text-[19px] font-bold num">
            {latest?.avg_price != null ? money(latest.avg_price) : '—'}
          </div>
        </div>
      </div>

      {history.length === 0 ? (
        <EmptyState title="لا توجد أسعار مسجّلة" hint="سجّل سعر شراء لتبدأ حسابات التكلفة." />
      ) : (
        <ul className="list-none m-0 mt-3 p-0">
          {history.map((price, index) => (
            <li
              key={price.id}
              className="flex items-center justify-between gap-3 py-2.5 border-b border-line-soft last:border-0"
            >
              <div>
                <div className={`text-[13.5px] ${index === 0 ? 'font-semibold' : 'text-soft'}`}>
                  {arabicDate(price.purchase_date)}
                </div>
                <div className="text-[11.5px] text-muted mt-0.5 num">
                  {unitPrice(price.unit_cost)} ر.س / {BASE_UNIT_LABELS[ingredient.base_unit]}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[14px] num ${index === 0 ? 'font-semibold' : 'text-soft'}`}>
                  {money(price.package_price)}
                </span>
                {index === 0 ? <Pill tone="good">الحالي</Pill> : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="m-0 mt-3 text-[12.5px] text-muted leading-relaxed">
        الأسعار القديمة لا تُحذف. كل شراء جديد يضيف سجلاً ويصبح هو السعر المعتمد للحساب.
      </p>
    </Card>
  )
}

function CostEngineCard() {
  return (
    <Card className="!bg-sand !border-line">
      <CardTitle title="محرك حساب التكلفة" />
      <div className="bg-surface rounded-xl px-3.5 py-3 text-[13.5px] leading-loose num">
        <div>سعر الوحدة = سعر العبوة ÷ حجم العبوة</div>
        <div>التكلفة الفعلية = سعر الوحدة ÷ (1 − نسبة الهدر)</div>
        <div>تكلفة المكون = التكلفة الفعلية × الكمية</div>
      </div>
      <p className="m-0 mt-3 text-[13px] leading-loose text-soft">
        مثال: عبوة كريمة 1 لتر بـ20 ر.س ← 0.0200 ر.س للمل. مع هدر 4% ← 0.0208. الوصفة تستخدم 250 مل ← 5.21 ر.س.
      </p>
    </Card>
  )
}

// ─── تسجيل سعر يدوي ──────────────────────────────────────────

function PriceModal({
  ingredient,
  onClose,
  onSaved,
}: {
  ingredient: Ingredient
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [size, setSize] = useState(
    String(round(baseToPackageSize(ingredient.package_size, ingredient.purchase_unit, ingredient.base_unit), 4)),
  )
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(todayISO())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sizeBase = packageSizeToBase(Number(size), ingredient.purchase_unit, ingredient.base_unit)
  const preview =
    sizeBase && sizeBase > 0 && Number(price) > 0
      ? effectiveUnitCost({
          packagePrice: Number(price),
          packageSize: sizeBase,
          wastePercent: ingredient.waste_percent,
        })
      : null

  async function submit() {
    const sizeValue = Number(size)
    const priceValue = Number(price)

    if (!Number.isFinite(sizeValue) || sizeValue <= 0) return setError('حجم العبوة لازم يكون أكبر من صفر.')
    if (!Number.isFinite(priceValue) || priceValue < 0) return setError('السعر لازم يكون رقماً موجباً.')
    if (!date) return setError('التاريخ مطلوب.')

    const base = packageSizeToBase(sizeValue, ingredient.purchase_unit, ingredient.base_unit)
    if (base === null || base <= 0) return setError('وحدة الشراء لا تتوافق مع وحدة القياس.')

    setBusy(true)
    try {
      await addPrice({
        ingredientId: ingredient.id,
        packageSize: base,
        packagePrice: priceValue,
        purchaseDate: date,
      })
      await onSaved()
    } catch (e) {
      setError(dbErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`تسجيل سعر — ${ingredient.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'جاري الحفظ…' : 'حفظ السعر'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field
          label="حجم العبوة"
          htmlFor="p-size"
          hint={
            ingredient.purchase_unit === 'pack'
              ? `عدد الـ${BASE_UNIT_LABELS[ingredient.base_unit]}`
              : UNIT_LABELS[ingredient.purchase_unit]
          }
        >
          <NumberInput id="p-size" value={size} onChange={setSize} />
        </Field>
        <Field label="سعر العبوة" htmlFor="p-price" hint="بالريال">
          <NumberInput id="p-price" value={price} onChange={setPrice} step="0.01" />
        </Field>
        <Field label="تاريخ الشراء" htmlFor="p-date">
          <TextInput id="p-date" type="date" value={date} onChange={setDate} />
        </Field>
      </div>

      {preview !== null ? (
        <p className="mt-4 mb-0 text-[13px] text-soft leading-loose">
          التكلفة الفعلية بعد هدر {percent(ingredient.waste_percent, 0)}:{' '}
          <strong className="num">{unitPrice(preview)}</strong> ر.س لكل{' '}
          {BASE_UNIT_LABELS[ingredient.base_unit]}.
        </p>
      ) : null}

      {error ? <p className="mt-3 mb-0 text-[13px] text-bad">{error}</p> : null}
    </Modal>
  )
}
