// ============================================================
// Suppliers.tsx — الموردين والمشتريات
// ============================================================

import { useState } from 'react'

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
  ReadOnlyValue,
  Select,
  Table,
  Td,
  TextInput,
  Th,
} from '../components/UI.tsx'
import {
  deletePurchase,
  deleteSupplier,
  saveSupplier,
  savePurchase,
  type PurchaseLineInput,
} from '../lib/api.ts'
import { round } from '../lib/cost.ts'
import { arabicDateShort, money, todayISO } from '../lib/format.ts'
import { dbErrorMessage } from '../lib/supabase.ts'
import { BASE_UNIT_LABELS, UNIT_LABELS, baseToPackageSize, packageSizeToBase } from '../lib/units.ts'
import type { Supplier } from '../types.ts'

export default function SuppliersScreen({ data, reload, onError }: ScreenProps) {
  const [showPurchase, setShowPurchase] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [showSupplier, setShowSupplier] = useState(false)

  const periodTotal = data.purchaseItems.reduce((sum, item) => sum + item.total_price, 0)

  async function removeSupplier(supplier: Supplier) {
    if (!window.confirm(`حذف المورد «${supplier.name}»؟`)) return
    try {
      await deleteSupplier(supplier.id)
      await reload()
    } catch (e) {
      onError(dbErrorMessage(e))
    }
  }

  async function removePurchase(id: string, invoice: string | null) {
    if (!window.confirm(`حذف الفاتورة ${invoice ?? ''}؟ سجلات الأسعار المرتبطة تبقى محفوظة.`)) return
    try {
      await deletePurchase(id)
      await reload()
    } catch (e) {
      onError(dbErrorMessage(e))
    }
  }

  return (
    <>
      <PageHeader
        title="الموردين والمشتريات"
        subtitle={`${data.suppliers.length} مورد · إجمالي المشتريات المسجّلة ${money(periodTotal)} ر.س`}
        action={
          <Button onClick={() => setShowPurchase(true)} disabled={data.ingredients.length === 0}>
            تسجيل فاتورة شراء
          </Button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
        <Card pad={false} className="overflow-hidden">
          <div className="px-5 pt-4 pb-3">
            <CardTitle title="آخر المشتريات" subtitle="كل بند يضيف سجل سعر جديد للمكوّن تلقائياً" />
          </div>

          {data.purchases.length === 0 ? (
            <EmptyState
              title="لا توجد مشتريات بعد"
              hint="سجّل أول فاتورة — وسيتحدّث سعر المكوّن وتكلفة كل وصفة تستخدمه."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th className="ps-5">الفاتورة</Th>
                  <Th>التاريخ</Th>
                  <Th>المورد</Th>
                  <Th>البنود</Th>
                  <Th>الإجمالي</Th>
                  <Th className="pe-5" />
                </tr>
              </thead>
              <tbody>
                {data.purchases.map((purchase) => {
                  const items = data.purchaseItems.filter((i) => i.purchase_id === purchase.id)
                  const total = items.reduce((s, i) => s + i.total_price, 0)
                  const supplier = data.suppliers.find((s) => s.id === purchase.supplier_id)

                  return (
                    <tr key={purchase.id} className="hover:bg-cream align-top">
                      <Td className="ps-5 num">{purchase.invoice_no ?? '—'}</Td>
                      <Td className="text-soft">{arabicDateShort(purchase.purchased_on)}</Td>
                      <Td>{supplier?.name ?? '—'}</Td>
                      <Td>
                        <ul className="list-none m-0 p-0 flex flex-col gap-1">
                          {items.map((item) => {
                            const ingredient = data.ingredients.find((x) => x.id === item.ingredient_id)
                            return (
                              <li key={item.id} className="text-[13px]">
                                <span className="font-semibold">{ingredient?.name ?? 'مكوّن محذوف'}</span>
                                <span className="text-muted num">
                                  {' '}
                                  — {item.quantity} × {money(item.package_price)}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      </Td>
                      <Td className="num font-semibold">{money(total)}</Td>
                      <Td className="pe-5">
                        <Button
                          variant="ghost"
                          className="!px-2.5 !text-[13px] !text-bad"
                          onClick={() => void removePurchase(purchase.id, purchase.invoice_no)}
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

        <Card>
          <CardTitle
            title="الموردين"
            action={
              <Button
                variant="secondary"
                className="!px-3 !text-[13px]"
                onClick={() => {
                  setEditingSupplier(null)
                  setShowSupplier(true)
                }}
              >
                مورد جديد
              </Button>
            }
          />

          {data.suppliers.length === 0 ? (
            <EmptyState title="لا يوجد موردون" hint="أضف مورداً لربط المكونات والفواتير به." />
          ) : (
            <ul className="list-none m-0 p-0">
              {data.suppliers.map((supplier) => (
                <li key={supplier.id} className="py-3 border-b border-line-soft last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold">{supplier.name}</div>
                      {supplier.phone ? (
                        <div className="text-[12.5px] text-muted mt-0.5 num" dir="ltr">
                          {supplier.phone}
                        </div>
                      ) : null}
                      {supplier.notes ? (
                        <p className="m-0 mt-1 text-[12.5px] text-muted leading-relaxed">{supplier.notes}</p>
                      ) : null}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        className="!px-2 !text-[12.5px]"
                        onClick={() => {
                          setEditingSupplier(supplier)
                          setShowSupplier(true)
                        }}
                      >
                        تعديل
                      </Button>
                      <Button
                        variant="ghost"
                        className="!px-2 !text-[12.5px] !text-bad"
                        onClick={() => void removeSupplier(supplier)}
                      >
                        حذف
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {showSupplier ? (
        <SupplierModal
          supplier={editingSupplier}
          onClose={() => setShowSupplier(false)}
          onSaved={async () => {
            setShowSupplier(false)
            await reload()
          }}
        />
      ) : null}

      {showPurchase ? (
        <PurchaseModal
          data={data}
          onClose={() => setShowPurchase(false)}
          onSaved={async () => {
            setShowPurchase(false)
            await reload()
          }}
        />
      ) : null}
    </>
  )
}

// ─── نموذج المورد ────────────────────────────────────────────

function SupplierModal({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [name, setName] = useState(supplier?.name ?? '')
  const [phone, setPhone] = useState(supplier?.phone ?? '')
  const [notes, setNotes] = useState(supplier?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim()) return setError('اسم المورد مطلوب.')
    setBusy(true)
    try {
      await saveSupplier(
        { name: name.trim(), phone: phone.trim() || null, notes: notes.trim() || null },
        supplier?.id,
      )
      await onSaved()
    } catch (e) {
      setError(dbErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={supplier ? `تعديل «${supplier.name}»` : 'مورد جديد'}
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
        <Field label="اسم المورد" htmlFor="s-name">
          <TextInput id="s-name" value={name} onChange={setName} />
        </Field>
        <Field label="رقم التواصل" htmlFor="s-phone">
          <TextInput id="s-phone" type="tel" value={phone} onChange={setPhone} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="ملاحظات" htmlFor="s-notes">
            <TextInput id="s-notes" value={notes} onChange={setNotes} />
          </Field>
        </div>
      </div>
      {error ? <p className="mt-4 mb-0 text-[13px] text-bad">{error}</p> : null}
    </Modal>
  )
}

// ─── نموذج فاتورة الشراء ─────────────────────────────────────

interface DraftLine {
  ingredientId: string
  quantity: string
  packageSize: string
  packagePrice: string
}

function PurchaseModal({
  data,
  onClose,
  onSaved,
}: {
  data: ScreenProps['data']
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const firstIngredient = data.ingredients[0]
  const [supplierId, setSupplierId] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [date, setDate] = useState(todayISO())
  const [lines, setLines] = useState<DraftLine[]>([
    {
      ingredientId: firstIngredient?.id ?? '',
      quantity: '1',
      packageSize: firstIngredient
        ? String(
            round(
              baseToPackageSize(
                firstIngredient.package_size,
                firstIngredient.purchase_unit,
                firstIngredient.base_unit,
              ),
              4,
            ),
          )
        : '',
      packagePrice: '',
    },
  ])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  function onIngredientChange(index: number, ingredientId: string) {
    const ingredient = data.ingredients.find((i) => i.id === ingredientId)
    updateLine(index, {
      ingredientId,
      packageSize: ingredient
        ? String(
            round(baseToPackageSize(ingredient.package_size, ingredient.purchase_unit, ingredient.base_unit), 4),
          )
        : '',
    })
  }

  const total = lines.reduce((sum, line) => {
    const q = Number(line.quantity)
    const p = Number(line.packagePrice)
    return sum + (Number.isFinite(q) && Number.isFinite(p) ? q * p : 0)
  }, 0)

  async function submit() {
    if (!date) return setError('تاريخ الشراء مطلوب.')

    const parsed: PurchaseLineInput[] = []
    for (const [index, line] of lines.entries()) {
      const ingredient = data.ingredients.find((i) => i.id === line.ingredientId)
      if (!ingredient) return setError(`البند ${index + 1}: اختر المكوّن.`)

      const quantity = Number(line.quantity)
      const sizeInput = Number(line.packageSize)
      const price = Number(line.packagePrice)

      if (!Number.isFinite(quantity) || quantity <= 0) return setError(`البند ${index + 1}: الكمية لازم تكون أكبر من صفر.`)
      if (!Number.isFinite(sizeInput) || sizeInput <= 0) return setError(`البند ${index + 1}: حجم العبوة لازم يكون أكبر من صفر.`)
      if (!Number.isFinite(price) || price < 0) return setError(`البند ${index + 1}: السعر لازم يكون رقماً موجباً.`)

      const packageSize = packageSizeToBase(sizeInput, ingredient.purchase_unit, ingredient.base_unit)
      if (packageSize === null || packageSize <= 0) return setError(`البند ${index + 1}: وحدة الشراء غير متوافقة.`)

      parsed.push({
        ingredient_id: ingredient.id,
        quantity,
        package_size: packageSize,
        package_price: price,
      })
    }

    setBusy(true)
    try {
      await savePurchase(
        {
          supplier_id: supplierId || null,
          invoice_no: invoiceNo.trim() || null,
          purchased_on: date,
          notes: null,
        },
        parsed,
      )
      await onSaved()
    } catch (e) {
      setError(dbErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="فاتورة شراء جديدة"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'جاري الحفظ…' : 'حفظ الفاتورة'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="المورد" htmlFor="pu-supplier">
          <Select
            id="pu-supplier"
            value={supplierId}
            onChange={setSupplierId}
            placeholder="بدون مورد"
            options={data.suppliers.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Field>
        <Field label="رقم الفاتورة" htmlFor="pu-invoice">
          <TextInput id="pu-invoice" value={invoiceNo} onChange={setInvoiceNo} />
        </Field>
        <Field label="تاريخ الشراء" htmlFor="pu-date">
          <TextInput id="pu-date" type="date" value={date} onChange={setDate} />
        </Field>
      </div>

      <h3 className="mt-6 mb-3 text-[14.5px] font-bold">البنود</h3>

      <div className="flex flex-col gap-3">
        {lines.map((line, index) => {
          const ingredient = data.ingredients.find((i) => i.id === line.ingredientId)
          const sizeHint = ingredient
            ? ingredient.purchase_unit === 'pack'
              ? `عدد الـ${BASE_UNIT_LABELS[ingredient.base_unit]}`
              : UNIT_LABELS[ingredient.purchase_unit]
            : ''

          return (
            <div key={index} className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end bg-cream rounded-xl p-3">
              <div className="col-span-2 sm:col-span-2">
                <Field label="المكون" htmlFor={`pl-ing-${index}`}>
                  <Select
                    id={`pl-ing-${index}`}
                    value={line.ingredientId}
                    onChange={(v) => onIngredientChange(index, v)}
                    placeholder="اختر مكوناً"
                    options={data.ingredients.map((i) => ({ value: i.id, label: i.name }))}
                  />
                </Field>
              </div>
              <Field label="عدد العبوات" htmlFor={`pl-qty-${index}`}>
                <NumberInput
                  id={`pl-qty-${index}`}
                  value={line.quantity}
                  onChange={(v) => updateLine(index, { quantity: v })}
                />
              </Field>
              <Field label="حجم العبوة" htmlFor={`pl-size-${index}`} hint={sizeHint}>
                <NumberInput
                  id={`pl-size-${index}`}
                  value={line.packageSize}
                  onChange={(v) => updateLine(index, { packageSize: v })}
                />
              </Field>
              <Field label="سعر العبوة" htmlFor={`pl-price-${index}`}>
                <NumberInput
                  id={`pl-price-${index}`}
                  value={line.packagePrice}
                  onChange={(v) => updateLine(index, { packagePrice: v })}
                  step="0.01"
                />
              </Field>

              {lines.length > 1 ? (
                <div className="col-span-2 sm:col-span-5 flex justify-end">
                  <Button
                    variant="ghost"
                    className="!px-2 !text-[12.5px] !text-bad !min-h-9"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                  >
                    حذف البند
                  </Button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <Button
          variant="secondary"
          onClick={() =>
            setLines((prev) => [...prev, { ingredientId: '', quantity: '1', packageSize: '', packagePrice: '' }])
          }
        >
          إضافة بند
        </Button>
        <div className="w-[190px]">
          <ReadOnlyValue label="إجمالي الفاتورة">{money(total)} ر.س</ReadOnlyValue>
        </div>
      </div>

      <p className="mt-4 mb-0 text-[12.5px] text-muted leading-relaxed">
        عند الحفظ يُضاف سجل سعر جديد لكل مكوّن ويصبح هو السعر المعتمد. السجلات السابقة تبقى محفوظة.
      </p>

      {error ? <p className="mt-3 mb-0 text-[13px] text-bad">{error}</p> : null}
    </Modal>
  )
}
