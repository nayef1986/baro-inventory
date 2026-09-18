// ============================================================
// Invoices.tsx — فواتير التوريد
// الفاتورة هي مصدر المبيعات في لوحة المتابعة.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'

import type { ScreenProps } from '../App.tsx'
import { InvoiceCapture, InvoicePrint } from '../components/InvoicePrint.tsx'
import { StatementCapture, StatementPrint } from '../components/StatementPrint.tsx'
import {
  ACTION_ICONS,
  ActionButton,
  ActionGroup,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  Modal,
  NumberInput,
  PageHeader,
  Pill,
  ReadOnlyValue,
  Select,
  StatTile,
  Table,
  Td,
  TextInput,
  Th,
} from '../components/UI.tsx'
import {
  deleteCustomer,
  deleteInvoice,
  deletePayment,
  saveCustomer,
  saveInvoice,
  savePayment,
  saveSettings,
  type InvoiceLineInput,
} from '../lib/api.ts'
import { rangeFor, totalsIn } from '../lib/analytics.ts'
import { profitOf, round } from '../lib/cost.ts'
import {
  dueDateFor,
  dueOf,
  receivablesOf,
  termOf,
  TERMS,
  type PaymentState,
  type TermKey,
} from '../lib/dues.ts'
import { invoiceMessage, normalizePhone, statementMessage, whatsappUrl } from '../lib/whatsapp.ts'
import { invoiceFileName, invoicePdfBlob, statementFileName } from '../lib/invoicePdf.ts'
import { buildStatement, currentMonth, monthLabel, monthRange } from '../lib/statement.ts'
import { canShareFile, downloadFile, shareFile } from '../lib/share.ts'
import { recipeCostFor } from '../lib/derive.ts'
import { arabicDateShort, arabicDays, money, percent, todayISO } from '../lib/format.ts'
import { dbErrorMessage } from '../lib/supabase.ts'
import type { Customer, PaymentMethod, SalesInvoice, SweetCostData } from '../types.ts'

const DUE_LABEL: Record<PaymentState, string> = {
  draft: 'مسودة',
  cancelled: 'ملغاة',
  paid: 'مدفوعة',
  partial: 'مدفوعة جزئياً',
  due: 'بالآجل',
  overdue: 'متأخرة',
}
const DUE_TONE: Record<PaymentState, 'good' | 'warn' | 'bad' | 'neutral'> = {
  draft: 'neutral',
  cancelled: 'neutral',
  paid: 'good',
  partial: 'warn',
  due: 'warn',
  overdue: 'bad',
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'نقداً',
  transfer: 'تحويل',
  card: 'شبكة',
  other: 'أخرى',
}

/** CC-2026-004 — يعتمد على أعلى رقم مستخدم في السنة الحالية */
function nextInvoiceNo(data: SweetCostData): string {
  const prefix = data.settings.invoice_prefix || 'CC'
  const year = todayISO().slice(0, 4)
  const head = `${prefix}-${year}-`
  let max = 0
  for (const invoice of data.invoices) {
    if (!invoice.invoice_no.startsWith(head)) continue
    const n = Number(invoice.invoice_no.slice(head.length))
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${head}${String(max + 1).padStart(3, '0')}`
}

export default function InvoicesScreen({ data, reload, onError }: ScreenProps) {
  const [editing, setEditing] = useState<SalesInvoice | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showStore, setShowStore] = useState(false)
  const [showCustomers, setShowCustomers] = useState(false)
  const [showStatement, setShowStatement] = useState(false)
  const [printId, setPrintId] = useState<string | null>(null)
  const [payFor, setPayFor] = useState<SalesInvoice | null>(null)
  // الفاتورة التي تُصوَّر الآن إلى PDF، والعقدة التي تحمل رسمها
  const [sendId, setSendId] = useState<string | null>(null)
  const captureNode = useRef<HTMLDivElement | null>(null)

  // الطباعة تبقى مركّبة حتى ينتهي المتصفح منها
  useEffect(() => {
    if (!printId) return
    const done = () => setPrintId(null)
    window.addEventListener('afterprint', done)
    const timer = setTimeout(() => window.print(), 80)
    return () => {
      window.removeEventListener('afterprint', done)
      clearTimeout(timer)
    }
  }, [printId])

  const monthTotals = useMemo(() => totalsIn(data, rangeFor('month')), [data])
  const today = todayISO()
  const dues = useMemo(
    () => receivablesOf(data.invoices, data.invoiceTotals, today),
    [data.invoices, data.invoiceTotals, today],
  )

  const printInvoice = printId ? (data.invoices.find((i) => i.id === printId) ?? null) : null

  /**
   * يرسل الفاتورة كملف PDF عبر لوحة مشاركة الجوال — ومنها واتساب.
   *
   * التصوير يحتاج العنصر مرسوماً في الصفحة فعلاً، فنركّب نسخة خارج
   * حدود الشاشة أولاً (setSendId)، ثم يكمل التأثير أدناه بعد رسمها.
   * على الكمبيوتر حيث لا مشاركة ملفات: نُنزّل الملف ونفتح واتساب
   * بالنص، ليُرفق يدوياً.
   */
  function sendWhatsApp(invoice: SalesInvoice) {
    const customer = data.customers.find((c) => c.id === invoice.customer_id) ?? null
    if (!normalizePhone(customer?.phone)) {
      onError('لا يوجد رقم جوال صالح لهذا العميل. أضفه من «العملاء».')
      return
    }
    setSendId(invoice.id)
  }

  const sendInvoice = sendId ? (data.invoices.find((i) => i.id === sendId) ?? null) : null

  useEffect(() => {
    if (!sendInvoice) return
    let cancelled = false

    // إطاران: الأول ليُركَّب العنصر، والثاني ليكتمل تخطيطه
    const timer = setTimeout(() => {
      void (async () => {
        const node = captureNode.current
        if (!node || cancelled) return

        const customer = data.customers.find((c) => c.id === sendInvoice.customer_id) ?? null
        const phone = normalizePhone(customer?.phone)
        const message = invoiceMessage({
          invoice: sendInvoice,
          items: data.invoiceItems.filter((i) => i.invoice_id === sendInvoice.id),
          due: dueOf(sendInvoice, data.invoiceTotals[sendInvoice.id], today),
          settings: data.settings,
          customerName: customer?.name ?? null,
        })

        try {
          const blob = await invoicePdfBlob(node)
          if (cancelled) return
          const file = new File([blob], invoiceFileName(sendInvoice.invoice_no), {
            type: 'application/pdf',
          })

          if (canShareFile(file)) {
            const outcome = await shareFile(file, message, `فاتورة ${sendInvoice.invoice_no}`)
            if (outcome === 'unsupported' && phone) {
              downloadFile(file)
              window.open(whatsappUrl(phone, message), '_blank', 'noopener')
            }
          } else {
            downloadFile(file)
            if (phone) window.open(whatsappUrl(phone, message), '_blank', 'noopener')
          }
        } catch {
          onError('تعذّر تجهيز ملف الفاتورة. جرّب زر PDF للطباعة.')
        } finally {
          if (!cancelled) setSendId(null)
        }
      })()
    }, 120)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // التأثير يعتمد على sendInvoice وحدها عمداً: data تتغيّر مع كل
    // تحميل، وإعادة التشغيل معها تُلغي التصوير في منتصفه.
  }, [sendInvoice])

  async function remove(invoice: SalesInvoice) {
    if (!window.confirm(`حذف الفاتورة ${invoice.invoice_no}؟ لا يمكن التراجع.`)) return
    try {
      await deleteInvoice(invoice.id)
      await reload()
    } catch (e) {
      onError(dbErrorMessage(e))
    }
  }


  return (
    <>
      <PageHeader
        title="فواتير التوريد"
        subtitle={`${data.invoices.length} فاتورة · ${data.settings.store_name}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setShowCustomers(true)}>
              العملاء
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowStatement(true)}
              disabled={data.invoices.length === 0}
            >
              كشف شهري
            </Button>
            <Button variant="secondary" onClick={() => setShowStore(true)}>
              بيانات المتجر
            </Button>
            <Button
              onClick={() => {
                setEditing(null)
                setShowForm(true)
              }}
              disabled={data.recipes.length === 0}
            >
              فاتورة جديدة
            </Button>
          </div>
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="مبيعات الشهر" value={money(monthTotals.sales)} note="بدون الضريبة" />
        <StatTile label="ربح الشهر" value={money(monthTotals.profit)} tone="good" note={percent(monthTotals.marginPercent)} />
        <StatTile label="فواتير الشهر" value={String(monthTotals.invoiceCount)} />
        <StatTile
          label="لك عند العملاء"
          value={money(dues.outstanding)}
          note={
            dues.overdue > 0
              ? `منها ${money(dues.overdue)} متأخر — ${dues.overdueCount} فاتورة`
              : `${dues.openCount} فاتورة بالآجل`
          }
          tone={dues.overdue > 0 ? 'bad' : dues.outstanding > 0 ? 'warn' : 'neutral'}
        />
      </section>

      <Card pad={false} className="overflow-hidden">
        {data.invoices.length === 0 ? (
          <EmptyState
            title="لا توجد فواتير بعد"
            hint={
              data.recipes.length === 0
                ? 'أنشئ وصفة أولاً — بنود الفاتورة تُختار من منتجاتك.'
                : 'أصدر أول فاتورة توريد، ومنها تُحتسب مبيعاتك وأرباحك.'
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="ps-5">الرقم</Th>
                <Th>التاريخ</Th>
                <Th>العميل</Th>
                <Th>البنود</Th>
                <Th>الإجمالي</Th>
                <Th>الربح</Th>
                <Th>المتبقي</Th>
                <Th>الحالة</Th>
                <Th className="pe-5" />
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((invoice) => {
                const totals = data.invoiceTotals[invoice.id]
                const customer = data.customers.find((c) => c.id === invoice.customer_id)
                const p = profitOf(totals?.taxable ?? 0, totals?.cost ?? 0)
                const cancelled = invoice.status === 'cancelled'
                const due = dueOf(invoice, totals, today)

                return (
                  <tr key={invoice.id} className={cancelled ? 'opacity-55' : ''}>
                    <Td className="ps-5 num font-semibold">{invoice.invoice_no}</Td>
                    <Td className="text-soft">{arabicDateShort(invoice.issued_on)}</Td>
                    <Td>{customer?.name ?? 'عميل نقدي'}</Td>
                    <Td className="num text-soft">{totals?.line_count ?? 0}</Td>
                    <Td className="num font-semibold">{money(totals?.total ?? 0)}</Td>
                    <Td className="num">
                      {money(p.profit)}
                      <span className="block text-[11.5px] text-muted mt-0.5">
                        {percent(p.marginPercent)}
                      </span>
                    </Td>
                    <Td className="num">
                      {due.balance > 0 ? (
                        <>
                          <span className="font-semibold">{money(due.balance)}</span>
                          {due.paid > 0 ? (
                            <span className="block text-[11.5px] text-muted mt-0.5">
                              دُفع {money(due.paid)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td>
                      <Pill tone={DUE_TONE[due.state]}>{DUE_LABEL[due.state]}</Pill>
                      {due.daysLate !== null ? (
                        <span className="block text-[11.5px] text-bad mt-0.5">
                          متأخرة {arabicDays(due.daysLate)}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="pe-5">
                      <div className="flex justify-end">
                        <ActionGroup>
                          <ActionButton
                            icon={ACTION_ICONS.print}
                            label="PDF"
                            onClick={() => setPrintId(invoice.id)}
                          />
                          <ActionButton
                            icon={ACTION_ICONS.whatsapp}
                            label={sendId === invoice.id ? 'جاري…' : 'واتساب'}
                            disabled={
                              cancelled || sendId !== null || !normalizePhone(customer?.phone)
                            }
                            onClick={() => sendWhatsApp(invoice)}
                          />
                          <ActionButton
                            icon={ACTION_ICONS.paid}
                            label="تسديد"
                            disabled={cancelled || invoice.status === 'draft'}
                            onClick={() => setPayFor(invoice)}
                          />
                          <ActionButton
                            icon={ACTION_ICONS.edit}
                            label="تعديل"
                            onClick={() => {
                              setEditing(invoice)
                              setShowForm(true)
                            }}
                          />
                          <ActionButton
                            icon={ACTION_ICONS.remove}
                            label="حذف"
                            tone="danger"
                            onClick={() => void remove(invoice)}
                          />
                        </ActionGroup>
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
        <p className="m-0 px-5 py-3 text-[12.5px] text-muted bg-cream border-t border-line leading-relaxed">
          «PDF» يفتح طباعة المتصفح — اختر «حفظ كـPDF». الفواتير الملغاة والمسودات لا تدخل في حساب
          المبيعات.
        </p>
      </Card>

      {showForm ? (
        <InvoiceForm
          data={data}
          invoice={editing}
          onClose={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false)
            await reload()
          }}
          onError={onError}
        />
      ) : null}

      {showStore ? (
        <StoreModal
          data={data}
          onClose={() => setShowStore(false)}
          onSaved={async () => {
            setShowStore(false)
            await reload()
          }}
          onError={onError}
        />
      ) : null}

      {payFor ? (
        <PaymentModal
          invoice={payFor}
          data={data}
          onClose={() => setPayFor(null)}
          onSaved={reload}
          onError={onError}
        />
      ) : null}

      {showStatement ? (
        <StatementModal data={data} onClose={() => setShowStatement(false)} onError={onError} />
      ) : null}

      {showCustomers ? (
        <CustomersModal
          data={data}
          onClose={() => setShowCustomers(false)}
          onChanged={reload}
          onError={onError}
        />
      ) : null}

      {sendInvoice ? (
        <InvoiceCapture
          nodeRef={(node) => {
            captureNode.current = node
          }}
          invoice={sendInvoice}
          items={data.invoiceItems.filter((i) => i.invoice_id === sendInvoice.id)}
          totals={data.invoiceTotals[sendInvoice.id]}
          customer={data.customers.find((c) => c.id === sendInvoice.customer_id) ?? null}
          settings={data.settings}
        />
      ) : null}

      {printInvoice ? (
        <InvoicePrint
          invoice={printInvoice}
          items={data.invoiceItems.filter((i) => i.invoice_id === printInvoice.id)}
          totals={data.invoiceTotals[printInvoice.id]}
          customer={data.customers.find((c) => c.id === printInvoice.customer_id) ?? null}
          settings={data.settings}
        />
      ) : null}
    </>
  )
}

// ─── نموذج الفاتورة ──────────────────────────────────────────

interface DraftLine {
  key: string
  recipeId: string
  description: string
  unitLabel: string
  quantity: string
  unitPrice: string
  unitCost: number
}

let lineSeq = 0
const newKey = () => `ln-${++lineSeq}`

function InvoiceForm({
  data,
  invoice,
  onClose,
  onSaved,
  onError,
}: {
  data: SweetCostData
  invoice: SalesInvoice | null
  onClose: () => void
  onSaved: () => Promise<void>
  onError: (message: string) => void
}) {
  const [invoiceNo, setInvoiceNo] = useState(invoice?.invoice_no ?? nextInvoiceNo(data))
  const [customerId, setCustomerId] = useState(invoice?.customer_id ?? '')
  const [issuedOn, setIssuedOn] = useState(invoice?.issued_on ?? todayISO())
  const [dueOn, setDueOn] = useState(invoice?.due_on ?? '')
  const [term, setTerm] = useState<TermKey>(
    invoice ? termOf(invoice.issued_on, invoice.due_on) : 'immediate',
  )

  /** المدة تُحدّد التاريخ. «تاريخ أحدده» وحدها تترك الحقل لصاحب المتجر. */
  function applyTerm(next: TermKey, issued = issuedOn) {
    setTerm(next)
    if (next === 'custom') return
    setDueOn(dueDateFor(next, issued) ?? '')
  }
  const [discount, setDiscount] = useState(String(invoice?.discount ?? '0'))
  const [vatRate, setVatRate] = useState(
    String(invoice ? invoice.vat_rate : data.settings.vat_enabled ? data.settings.vat_rate : 0),
  )
  const [notes, setNotes] = useState(invoice?.notes ?? '')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!invoice) {
      setLines([{ key: newKey(), recipeId: '', description: '', unitLabel: 'قطعة', quantity: '1', unitPrice: '', unitCost: 0 }])
      return
    }
    setLines(
      data.invoiceItems
        .filter((i) => i.invoice_id === invoice.id)
        .map((i) => ({
          key: newKey(),
          recipeId: i.recipe_id ?? '',
          description: i.description,
          unitLabel: i.unit_label,
          quantity: String(i.quantity),
          unitPrice: String(i.unit_price),
          unitCost: i.unit_cost,
        })),
    )
  }, [invoice, data.invoiceItems])

  function update(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  /** اختيار المنتج يملأ الاسم والوحدة والسعر ولقطة التكلفة */
  function pickRecipe(key: string, recipeId: string) {
    const recipe = data.recipes.find((r) => r.id === recipeId)
    if (!recipe) {
      update(key, { recipeId: '' })
      return
    }
    update(key, {
      recipeId,
      description: recipe.name,
      unitLabel: recipe.yield_unit_label,
      unitPrice: String(recipe.sell_price),
      unitCost: round(recipeCostFor(data, recipe).perUnit, 4),
    })
  }

  const subtotal = lines.reduce((sum, l) => {
    const q = Number(l.quantity)
    const p = Number(l.unitPrice)
    return sum + (Number.isFinite(q) && Number.isFinite(p) ? q * p : 0)
  }, 0)
  const discountValue = Number(discount) || 0
  const taxable = Math.max(subtotal - discountValue, 0)
  const rate = Number(vatRate) || 0
  const vatAmount = round((taxable * rate) / 100, 2)
  const total = taxable + vatAmount
  const cost = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * l.unitCost, 0)
  const p = profitOf(taxable, cost)

  async function submit() {
    if (!invoiceNo.trim()) return setError('رقم الفاتورة مطلوب.')
    if (!issuedOn) return setError('تاريخ الإصدار مطلوب.')
    if (!Number.isFinite(discountValue) || discountValue < 0) return setError('الخصم لازم يكون رقماً موجباً.')
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return setError('نسبة الضريبة لازم تكون بين 0 و 100.')
    if (discountValue > subtotal) return setError('الخصم أكبر من إجمالي البنود.')

    const payload: InvoiceLineInput[] = []
    for (const [index, line] of lines.entries()) {
      if (!line.description.trim() && !line.quantity && !line.unitPrice) continue
      if (!line.description.trim()) return setError(`البند ${index + 1}: اختر المنتج أو اكتب وصفاً.`)

      const q = Number(line.quantity)
      const price = Number(line.unitPrice)
      if (!Number.isFinite(q) || q <= 0) return setError(`البند ${index + 1}: الكمية لازم تكون أكبر من صفر.`)
      if (!Number.isFinite(price) || price < 0) return setError(`البند ${index + 1}: السعر لازم يكون رقماً موجباً.`)

      payload.push({
        recipe_id: line.recipeId || null,
        description: line.description.trim(),
        unit_label: line.unitLabel.trim() || 'قطعة',
        quantity: q,
        unit_price: price,
        unit_cost: line.unitCost,
      })
    }
    if (payload.length === 0) return setError('أضف بنداً واحداً على الأقل.')

    setBusy(true)
    setError(null)
    try {
      await saveInvoice(
        {
          invoice_no: invoiceNo.trim(),
          customer_id: customerId || null,
          issued_on: issuedOn,
          due_on: dueOn || null,
          vat_rate: rate,
          discount: discountValue,
          status: invoice?.status ?? 'issued',
          notes: notes.trim() || null,
        },
        payload,
        invoice?.id,
      )
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
      title={invoice ? `تعديل ${invoice.invoice_no}` : 'فاتورة توريد جديدة'}
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="رقم الفاتورة" htmlFor="in-no">
          <TextInput id="in-no" value={invoiceNo} onChange={setInvoiceNo} />
        </Field>
        <Field label="العميل" htmlFor="in-cust">
          <Select
            id="in-cust"
            value={customerId}
            onChange={setCustomerId}
            placeholder="عميل نقدي"
            options={data.customers.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Field>
        <Field label="تاريخ الإصدار" htmlFor="in-date">
          <TextInput
            id="in-date"
            type="date"
            value={issuedOn}
            onChange={(v) => {
              setIssuedOn(v)
              if (term !== 'custom') setDueOn(dueDateFor(term, v) ?? '')
            }}
          />
        </Field>
        <Field label="مدة السداد" htmlFor="in-term">
          <Select
            id="in-term"
            value={term}
            onChange={(v) => applyTerm(v as TermKey)}
            options={TERMS.map((t) => ({ value: t.key, label: t.label }))}
          />
        </Field>
        <Field
          label="تاريخ الاستحقاق"
          htmlFor="in-due"
          hint={term === 'custom' ? 'اكتبه بنفسك' : 'يُحسب من المدة'}
        >
          <TextInput
            id="in-due"
            type="date"
            value={dueOn}
            onChange={(v) => {
              setDueOn(v)
              setTerm('custom')
            }}
          />
        </Field>
        <Field label="الخصم" htmlFor="in-disc" hint="بالريال">
          <NumberInput id="in-disc" value={discount} onChange={setDiscount} step="0.01" />
        </Field>
        {data.settings.vat_enabled ? (
          <Field label="نسبة الضريبة %" htmlFor="in-vat" hint="صفر = بلا ضريبة">
            <NumberInput id="in-vat" value={vatRate} onChange={setVatRate} step="0.5" />
          </Field>
        ) : null}
      </div>

      <h3 className="mt-6 mb-3 text-[14.5px] font-bold">البنود</h3>

      <div className="flex flex-col gap-3">
        {lines.map((line, index) => (
          <div key={line.key} className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end bg-cream rounded-xl p-3">
            <div className="col-span-2">
              <Field label="المنتج" htmlFor={`il-r-${line.key}`}>
                <Select
                  id={`il-r-${line.key}`}
                  value={line.recipeId}
                  onChange={(v) => pickRecipe(line.key, v)}
                  placeholder="اختر منتجاً"
                  options={data.recipes.map((r) => ({ value: r.id, label: r.name }))}
                />
              </Field>
            </div>
            <Field label="الكمية" htmlFor={`il-q-${line.key}`} hint={line.unitLabel}>
              <NumberInput
                id={`il-q-${line.key}`}
                value={line.quantity}
                onChange={(v) => update(line.key, { quantity: v })}
              />
            </Field>
            <Field label="سعر الوحدة" htmlFor={`il-p-${line.key}`}>
              <NumberInput
                id={`il-p-${line.key}`}
                value={line.unitPrice}
                onChange={(v) => update(line.key, { unitPrice: v })}
                step="0.25"
              />
            </Field>
            <ReadOnlyValue label="الإجمالي">
              {money((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0))}
            </ReadOnlyValue>

            {lines.length > 1 ? (
              <div className="col-span-2 sm:col-span-5 flex justify-end">
                <Button
                  variant="ghost"
                  className="!px-2 !text-[12.5px] !text-bad !min-h-9"
                  onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                >
                  حذف البند {index + 1}
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <Button
          variant="secondary"
          onClick={() =>
            setLines((prev) => [
              ...prev,
              { key: newKey(), recipeId: '', description: '', unitLabel: 'قطعة', quantity: '1', unitPrice: '', unitCost: 0 },
            ])
          }
        >
          إضافة بند
        </Button>

        <dl className="m-0 w-full sm:w-[280px] bg-sand rounded-xl p-4 flex flex-col gap-2">
          <Row label="الإجمالي قبل الضريبة" value={money(subtotal)} />
          {discountValue > 0 ? <Row label="الخصم" value={`(${money(discountValue)})`} /> : null}
          {rate > 0 ? <Row label={`ضريبة ${rate}%`} value={money(vatAmount)} /> : null}
          <Row label="الإجمالي المستحق" value={money(total)} strong />
          <Row label="ربح الفاتورة" value={`${money(p.profit)} · ${percent(p.marginPercent)}`} />
        </dl>
      </div>

      <div className="mt-4">
        <Field label="ملاحظات" htmlFor="in-notes" hint="تظهر في الفاتورة المطبوعة">
          <TextInput id="in-notes" value={notes} onChange={setNotes} />
        </Field>
      </div>

      {error ? <p className="mt-3 mb-0 text-[13px] text-bad">{error}</p> : null}
    </Modal>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between items-baseline ${strong ? 'border-t border-line pt-2' : ''}`}>
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className={`m-0 num ${strong ? 'text-[15px] font-bold' : 'text-[13.5px] font-semibold'}`}>{value}</dd>
    </div>
  )
}

// ─── بيانات المتجر والضريبة ──────────────────────────────────

function StoreModal({
  data,
  onClose,
  onSaved,
  onError,
}: {
  data: SweetCostData
  onClose: () => void
  onSaved: () => Promise<void>
  onError: (message: string) => void
}) {
  const s = data.settings
  const [storeName, setStoreName] = useState(s.store_name)
  const [tagline, setTagline] = useState(s.store_tagline)
  const [phone, setPhone] = useState(s.store_phone ?? '')
  const [address, setAddress] = useState(s.store_address ?? '')
  const [vatNumber, setVatNumber] = useState(s.vat_number ?? '')
  const [vatEnabled, setVatEnabled] = useState(s.vat_enabled ? 'yes' : 'no')
  const [vatRate, setVatRate] = useState(String(s.vat_rate))
  const [prefix, setPrefix] = useState(s.invoice_prefix)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!storeName.trim()) return setError('اسم المتجر مطلوب.')
    if (!prefix.trim()) return setError('بادئة رقم الفاتورة مطلوبة.')
    const rate = Number(vatRate)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return setError('نسبة الضريبة لازم تكون بين 0 و 100.')

    setBusy(true)
    try {
      await saveSettings({
        store_name: storeName.trim(),
        store_tagline: tagline.trim(),
        store_phone: phone.trim() || null,
        store_address: address.trim() || null,
        vat_number: vatNumber.trim() || null,
        vat_enabled: vatEnabled === 'yes',
        vat_rate: rate,
        invoice_prefix: prefix.trim(),
      })
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
      title="بيانات المتجر والضريبة"
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
        <Field label="اسم المتجر" htmlFor="st-name" hint="يظهر في ترويسة الفاتورة">
          <TextInput id="st-name" value={storeName} onChange={setStoreName} />
        </Field>
        <Field
          label="السطر الإنجليزي"
          htmlFor="st-tagline"
          hint="يظهر تحت الشعار في الفاتورة"
        >
          <TextInput id="st-tagline" value={tagline} onChange={setTagline} />
        </Field>
        <Field label="رقم التواصل" htmlFor="st-phone">
          <TextInput id="st-phone" type="tel" value={phone} onChange={setPhone} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="العنوان" htmlFor="st-addr">
            <TextInput id="st-addr" value={address} onChange={setAddress} />
          </Field>
        </div>
        <Field label="بادئة رقم الفاتورة" htmlFor="st-prefix" hint="مثال: CC-2026-001">
          <TextInput id="st-prefix" value={prefix} onChange={setPrefix} />
        </Field>
        <Field label="إظهار الضريبة" htmlFor="st-vat">
          <Select
            id="st-vat"
            value={vatEnabled}
            onChange={setVatEnabled}
            options={[
              { value: 'no', label: 'بدون ضريبة' },
              { value: 'yes', label: 'مع ضريبة القيمة المضافة' },
            ]}
          />
        </Field>
        <Field label="نسبة الضريبة %" htmlFor="st-rate">
          <NumberInput id="st-rate" value={vatRate} onChange={setVatRate} step="0.5" />
        </Field>
        <Field label="الرقم الضريبي" htmlFor="st-vatno" hint="يظهر في الفاتورة عند تفعيل الضريبة">
          <TextInput id="st-vatno" value={vatNumber} onChange={setVatNumber} />
        </Field>
      </div>

      <p className="mt-4 mb-0 text-[12.5px] text-muted leading-relaxed">
        هذه فاتورة تجارية للتوريد. ليست فاتورة ضريبية إلكترونية معتمدة من هيئة الزكاة والضريبة
        والجمارك — تلك تتطلب رمز QR ومتطلبات فوترة إضافية.
      </p>

      {error ? <p className="mt-3 mb-0 text-[13px] text-bad">{error}</p> : null}
    </Modal>
  )
}

// ─── العملاء ─────────────────────────────────────────────────

function CustomersModal({
  data,
  onClose,
  onChanged,
  onError,
}: {
  data: SweetCostData
  onClose: () => void
  onChanged: () => Promise<void>
  onError: (message: string) => void
}) {
  const [editing, setEditing] = useState<Customer | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [taxNumber, setTaxNumber] = useState('')
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function reset() {
    setEditing(null)
    setName('')
    setPhone('')
    setTaxNumber('')
    setAddress('')
  }

  function edit(customer: Customer) {
    setEditing(customer)
    setName(customer.name)
    setPhone(customer.phone ?? '')
    setTaxNumber(customer.tax_number ?? '')
    setAddress(customer.address ?? '')
  }

  async function submit() {
    if (!name.trim()) return setError('اسم العميل مطلوب.')
    setBusy(true)
    try {
      await saveCustomer(
        {
          name: name.trim(),
          phone: phone.trim() || null,
          tax_number: taxNumber.trim() || null,
          address: address.trim() || null,
          notes: null,
        },
        editing?.id,
      )
      reset()
      setError(null)
      await onChanged()
    } catch (e) {
      const message = dbErrorMessage(e)
      setError(message)
      onError(message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(customer: Customer) {
    if (!window.confirm(`حذف العميل «${customer.name}»؟`)) return
    try {
      await deleteCustomer(customer.id)
      await onChanged()
    } catch (e) {
      onError(dbErrorMessage(e))
    }
  }

  return (
    <Modal
      title="العملاء"
      onClose={onClose}
      footer={<Button onClick={onClose}>تمام</Button>}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="اسم العميل" htmlFor="cu-name">
          <TextInput id="cu-name" value={name} onChange={setName} />
        </Field>
        <Field
          label="رقم الجوال"
          htmlFor="cu-phone"
          hint="لإرسال الفاتورة بالواتساب — 05… أو ‎+966…"
        >
          <TextInput id="cu-phone" type="tel" value={phone} onChange={setPhone} />
        </Field>
        <Field label="الرقم الضريبي" htmlFor="cu-tax" hint="اختياري">
          <TextInput id="cu-tax" value={taxNumber} onChange={setTaxNumber} />
        </Field>
        <Field label="العنوان" htmlFor="cu-addr" hint="اختياري">
          <TextInput id="cu-addr" value={address} onChange={setAddress} />
        </Field>
      </div>

      <div className="mt-4 flex gap-2">
        <Button onClick={() => void submit()} disabled={busy}>
          {busy ? 'جاري الحفظ…' : editing ? 'حفظ التعديل' : 'إضافة عميل'}
        </Button>
        {editing ? (
          <Button variant="secondary" onClick={reset}>
            إلغاء التعديل
          </Button>
        ) : null}
      </div>

      {error ? <p className="mt-3 mb-0 text-[13px] text-bad">{error}</p> : null}

      <div className="mt-6">
        <CardTitle title="العملاء المسجّلون" subtitle={`${data.customers.length} عميل`} />
        {data.customers.length === 0 ? (
          <EmptyState title="لا يوجد عملاء" hint="أضف عميلاً ليظهر في قائمة الفواتير." />
        ) : (
          <ul className="list-none m-0 p-0">
            {data.customers.map((customer) => (
              <li
                key={customer.id}
                className="flex items-start justify-between gap-3 py-3 border-b border-line-soft last:border-0"
              >
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold">{customer.name}</div>
                  {customer.phone ? (
                    <div className="text-[12.5px] text-muted mt-0.5 num" dir="ltr">
                      {customer.phone}
                    </div>
                  ) : null}
                  {customer.address ? (
                    <div className="text-[12.5px] text-muted mt-0.5">{customer.address}</div>
                  ) : null}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" className="!px-2 !text-[12.5px]" onClick={() => edit(customer)}>
                    تعديل
                  </Button>
                  <Button
                    variant="ghost"
                    className="!px-2 !text-[12.5px] !text-bad"
                    onClick={() => void remove(customer)}
                  >
                    حذف
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}


// ─── التسديد ─────────────────────────────────────────────────

function PaymentModal({
  invoice,
  data,
  onClose,
  onSaved,
  onError,
}: {
  invoice: SalesInvoice
  data: SweetCostData
  onClose: () => void
  onSaved: () => Promise<void>
  onError: (message: string) => void
}) {
  const today = todayISO()
  const totals = data.invoiceTotals[invoice.id]
  const due = dueOf(invoice, totals, today)
  const payments = data.invoicePayments.filter((p) => p.invoice_id === invoice.id)

  const [amount, setAmount] = useState(due.balance > 0 ? String(round(due.balance, 2)) : '')
  const [paidOn, setPaidOn] = useState(today)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) return setError('المبلغ لازم يكون أكبر من صفر.')
    if (value > due.balance + 0.005) {
      return setError(`المبلغ أكبر من المتبقي (${money(due.balance)}). صحّح المبلغ أو عدّل الفاتورة.`)
    }

    setBusy(true)
    setError(null)
    try {
      await savePayment({
        invoice_id: invoice.id,
        paid_on: paidOn,
        amount: value,
        method,
        note: note.trim() || null,
      })
      await onSaved()
      onClose()
    } catch (e) {
      const message = dbErrorMessage(e)
      setError(message)
      onError(message)
    } finally {
      setBusy(false)
    }
  }

  async function removePayment(id: string, value: number) {
    if (!window.confirm(`حذف دفعة ${money(value)}؟`)) return
    try {
      await deletePayment(id)
      await onSaved()
    } catch (e) {
      onError(dbErrorMessage(e))
    }
  }

  return (
    <Modal
      title={`تسديد الفاتورة ${invoice.invoice_no}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إغلاق
          </Button>
          <Button onClick={() => void submit()} disabled={busy || due.balance <= 0}>
            {busy ? 'جاري الحفظ…' : 'تسجيل الدفعة'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <ReadOnlyValue label="إجمالي الفاتورة">{money(due.total)}</ReadOnlyValue>
        <ReadOnlyValue label="المدفوع">{money(due.paid)}</ReadOnlyValue>
        <ReadOnlyValue label="المتبقي">{money(due.balance)}</ReadOnlyValue>
      </div>

      {due.balance > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field label="المبلغ" htmlFor="pay-amount" hint="سدِّد كله أو جزءاً منه">
            <NumberInput id="pay-amount" value={amount} onChange={setAmount} step="0.01" />
          </Field>
          <Field label="تاريخ السداد" htmlFor="pay-date">
            <TextInput id="pay-date" type="date" value={paidOn} onChange={setPaidOn} />
          </Field>
          <Field label="طريقة السداد" htmlFor="pay-method">
            <Select
              id="pay-method"
              value={method}
              onChange={(v) => setMethod(v as PaymentMethod)}
              options={[
                { value: 'cash', label: 'نقداً' },
                { value: 'transfer', label: 'تحويل' },
                { value: 'card', label: 'شبكة' },
                { value: 'other', label: 'أخرى' },
              ]}
            />
          </Field>
          <Field label="ملاحظة" htmlFor="pay-note">
            <TextInput id="pay-note" value={note} onChange={setNote} />
          </Field>
        </div>
      ) : (
        <p className="mt-4 mb-0 text-[13.5px] text-good font-semibold">
          هذه الفاتورة مسدَّدة بالكامل.
        </p>
      )}

      {payments.length > 0 ? (
        <div className="mt-5">
          <CardTitle title="الدفعات المسجّلة" />
          <div className="mt-2 border border-line rounded-xl overflow-hidden">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-line-soft last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="num font-semibold text-[14px]">{money(payment.amount)}</div>
                  <div className="text-[12px] text-muted">
                    {arabicDateShort(payment.paid_on)} · {METHOD_LABEL[payment.method]}
                    {payment.note ? ` · ${payment.note}` : ''}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  className="!px-2.5 !text-[13px] !text-bad"
                  onClick={() => void removePayment(payment.id, payment.amount)}
                >
                  حذف
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-4 mb-0 text-[12.5px] text-muted leading-relaxed">
        السداد لا يغيّر المبيعات ولا الربح — الفاتورة تدخل الحساب يوم إصدارها. الدفعات تبيّن كم لك
        عند العملاء فقط.
      </p>

      {error ? <p className="mt-3 mb-0 text-[13px] text-bad">{error}</p> : null}
    </Modal>
  )
}

// ─── كشف الحساب الشهري ───────────────────────────────────────

function StatementModal({
  data,
  onClose,
  onError,
}: {
  data: SweetCostData
  onClose: () => void
  onError: (message: string) => void
}) {
  const today = todayISO()
  const [customerId, setCustomerId] = useState<string>(data.customers[0]?.id ?? '')
  const [month, setMonth] = useState(currentMonth(today))
  const [busy, setBusy] = useState(false)
  const captureNode = useRef<HTMLDivElement | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [printing, setPrinting] = useState(false)

  const customer = data.customers.find((c) => c.id === customerId) ?? null
  const range = monthRange(month)
  const statement = useMemo(
    () =>
      buildStatement({
        invoices: data.invoices,
        totals: data.invoiceTotals,
        payments: data.invoicePayments,
        customerId: customerId || null,
        ...range,
      }),
    [data, customerId, range.from, range.to],
  )

  const sheet = {
    statement,
    month,
    customer,
    settings: data.settings,
    issuedOn: today,
  }

  // الطباعة تبقى مركّبة حتى ينتهي المتصفح منها
  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done)
    const timer = setTimeout(() => window.print(), 80)
    return () => {
      window.removeEventListener('afterprint', done)
      clearTimeout(timer)
    }
  }, [printing])

  /** يولّد الملف ثم يشارك أو ينزّل — نفس مسار الفاتورة */
  async function makePdf(share: boolean) {
    setBusy(true)
    setCapturing(true)
    try {
      await new Promise((r) => setTimeout(r, 160))
      const node = captureNode.current
      if (!node) throw new Error('no node')

      const blob = await invoicePdfBlob(node)
      const file = new File([blob], statementFileName(customer?.name ?? 'نقدي', month), {
        type: 'application/pdf',
      })

      if (!share) {
        downloadFile(file)
        return
      }

      const phone = normalizePhone(customer?.phone)
      const message = statementMessage({
        statement,
        monthText: monthLabel(month),
        settings: data.settings,
        customerName: customer?.name ?? null,
      })

      if (canShareFile(file)) {
        const outcome = await shareFile(file, message, `كشف ${monthLabel(month)}`)
        if (outcome === 'unsupported') {
          downloadFile(file)
          if (phone) window.open(whatsappUrl(phone, message), '_blank', 'noopener')
        }
      } else {
        downloadFile(file)
        if (phone) window.open(whatsappUrl(phone, message), '_blank', 'noopener')
      }
    } catch {
      onError('تعذّر تجهيز ملف الكشف. جرّب الطباعة.')
    } finally {
      setCapturing(false)
      setBusy(false)
    }
  }

  const hasPhone = Boolean(normalizePhone(customer?.phone))

  return (
    <Modal
      title="كشف حساب شهري"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إغلاق
          </Button>
          <Button variant="secondary" onClick={() => setPrinting(true)} disabled={busy}>
            طباعة
          </Button>
          <Button variant="secondary" onClick={() => void makePdf(false)} disabled={busy}>
            {busy ? 'جاري…' : 'تنزيل PDF'}
          </Button>
          <Button onClick={() => void makePdf(true)} disabled={busy || !hasPhone}>
            واتساب
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="العميل" htmlFor="st-cust">
          <Select
            id="st-cust"
            value={customerId}
            onChange={setCustomerId}
            placeholder="عميل نقدي"
            options={data.customers.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Field>
        <Field label="الشهر" htmlFor="st-month">
          <TextInput id="st-month" type="month" value={month} onChange={setMonth} />
        </Field>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <ReadOnlyValue label="رصيد سابق">{money(statement.opening)}</ReadOnlyValue>
        <ReadOnlyValue label={`فواتير الشهر (${statement.lines.length})`}>
          {money(statement.charges)}
        </ReadOnlyValue>
        <ReadOnlyValue label="المسدَّد">{money(statement.payments)}</ReadOnlyValue>
        <ReadOnlyValue label="الرصيد المستحق">{money(statement.closing)}</ReadOnlyValue>
      </div>

      {statement.lines.length === 0 ? (
        <p className="mt-4 mb-0 text-[13.5px] text-muted">
          لا توجد فواتير لهذا العميل في {monthLabel(month)}.
        </p>
      ) : (
        <div className="mt-4 border border-line rounded-xl overflow-hidden">
          {statement.lines.map((line) => (
            <div
              key={line.invoice.id}
              className="flex items-center justify-between gap-3 px-3 py-2 border-b border-line-soft last:border-b-0 text-[13.5px]"
            >
              <span className="num font-semibold">{line.invoice.invoice_no}</span>
              <span className="text-muted">{arabicDateShort(line.invoice.issued_on)}</span>
              <span className="num">{money(line.total)}</span>
              <span className={`num ${line.balance > 0 ? 'text-bad font-semibold' : 'text-muted'}`}>
                {line.balance > 0 ? money(line.balance) : 'مسدَّدة'}
              </span>
            </div>
          ))}
        </div>
      )}

      {!hasPhone ? (
        <p className="mt-3 mb-0 text-[12.5px] text-muted">
          لا يوجد رقم جوال لهذا العميل — أضفه من «العملاء» ليعمل الإرسال.
        </p>
      ) : null}

      {capturing ? (
        <StatementCapture
          nodeRef={(node) => {
            captureNode.current = node
          }}
          {...sheet}
        />
      ) : null}

      {printing ? <StatementPrint {...sheet} /> : null}
    </Modal>
  )
}
