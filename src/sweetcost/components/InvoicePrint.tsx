// ============================================================
// InvoicePrint.tsx — قالب فاتورة التوريد للطباعة / PDF
//
// يُعرض عبر portal إلى body ويظهر في الطباعة فقط. التصدير
// يتم بطباعة المتصفح («حفظ كـPDF») لأنها ترسم العربية بشكل
// صحيح بلا أي مكتبة خارجية.
//
// التخطيط على نسق مستندات باروو: ترويسة بشعار وبيانات مرجعية،
// بطاقات ملخّص مؤطّرة، جدول محدّد بالكامل، وتذييل توقيعات.
// ============================================================

import { createPortal } from 'react-dom'

import {
  money,
  quantity as fmtQty,
  integer,
  arabicDate,
  hijriDate,
} from '../lib/format.ts'
import type { Customer, InvoiceTotals, SalesInvoice, SalesInvoiceItem, Settings } from '../types.ts'
import { Wordmark } from './Wordmark.tsx'

const STATUS_TEXT: Record<SalesInvoice['status'], string> = {
  draft: 'مسودة',
  issued: 'صادرة',
  paid: 'مدفوعة',
  cancelled: 'ملغاة',
}

export function InvoicePrint({
  invoice,
  items,
  totals,
  customer,
  settings,
}: {
  invoice: SalesInvoice
  items: SalesInvoiceItem[]
  totals: InvoiceTotals | undefined
  customer: Customer | null
  settings: Settings
}) {
  const subtotal = totals?.subtotal ?? 0
  const vatAmount = totals?.vat_amount ?? 0
  const total = totals?.total ?? 0
  const showVat = invoice.vat_rate > 0
  const hijri = hijriDate(invoice.issued_on)
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0)

  return createPortal(
    <div className="print-root" dir="rtl" lang="ar">
      <article className="invoice-sheet">
        <header className="invoice-head">
          <div className="invoice-identity">
            <Wordmark className="invoice-logo" />
            {settings.store_tagline ? (
              <div className="invoice-tagline" dir="ltr">
                {settings.store_tagline}
              </div>
            ) : null}
            <div className="invoice-meta">
              {settings.store_phone ? <div dir="ltr">{settings.store_phone}</div> : null}
              {settings.store_address ? <div>{settings.store_address}</div> : null}
              {settings.vat_number ? <div>الرقم الضريبي: {settings.vat_number}</div> : null}
            </div>
          </div>

          <div className="invoice-id">
            <div className="invoice-kind">{showVat ? 'فاتورة ضريبية' : 'فاتورة توريد'}</div>
            <table className="invoice-id-table">
              <tbody>
                <tr>
                  <th>رقم الفاتورة</th>
                  <td className="num">{invoice.invoice_no}</td>
                </tr>
                <tr>
                  <th>تاريخ الإصدار</th>
                  <td>{arabicDate(invoice.issued_on)}</td>
                </tr>
                {hijri ? (
                  <tr>
                    <th>الموافق</th>
                    <td>{hijri}</td>
                  </tr>
                ) : null}
                {invoice.due_on ? (
                  <tr>
                    <th>تاريخ الاستحقاق</th>
                    <td>{arabicDate(invoice.due_on)}</td>
                  </tr>
                ) : null}
                <tr>
                  <th>الحالة</th>
                  <td>{STATUS_TEXT[invoice.status]}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </header>

        <section className="invoice-sum">
          <div>
            <div className="v num">{integer(items.length)}</div>
            <div className="l">عدد البنود</div>
          </div>
          <div>
            <div className="v num">{fmtQty(totalQty)}</div>
            <div className="l">إجمالي الكمية</div>
          </div>
          <div>
            <div className="v num">{money(total)}</div>
            <div className="l">الإجمالي المستحق — {settings.currency}</div>
          </div>
        </section>

        <section className="invoice-party">
          <h2>فاتورة إلى</h2>
          <div className="invoice-party-name">{customer?.name ?? 'عميل نقدي'}</div>
          <div className="invoice-meta">
            {customer?.phone ? <div dir="ltr">{customer.phone}</div> : null}
            {customer?.address ? <div>{customer.address}</div> : null}
            {customer?.tax_number ? <div>الرقم الضريبي: {customer.tax_number}</div> : null}
          </div>
        </section>

        <table className="invoice-lines">
          <thead>
            <tr>
              <th className="col-idx">#</th>
              <th className="col-name">الصنف</th>
              <th className="col-num">الكمية</th>
              <th className="col-num">سعر الوحدة</th>
              <th className="col-num">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id}>
                <td className="col-idx num">{index + 1}</td>
                <td className="col-name">{item.description}</td>
                <td className="col-num num">
                  {fmtQty(item.quantity)} {item.unit_label}
                </td>
                <td className="col-num num">{money(item.unit_price)}</td>
                <td className="col-num num">{money(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="invoice-foot">
          <div className="invoice-notes">
            {invoice.notes ? (
              <>
                <h3>ملاحظات</h3>
                <p>{invoice.notes}</p>
              </>
            ) : null}
          </div>

          <table className="invoice-totals">
            <tbody>
              <tr>
                <th>الإجمالي قبل الضريبة</th>
                <td className="num">{money(subtotal)}</td>
              </tr>
              {invoice.discount > 0 ? (
                <tr>
                  <th>الخصم</th>
                  <td className="num" dir="ltr">
                    −{money(invoice.discount)}
                  </td>
                </tr>
              ) : null}
              {showVat ? (
                <tr>
                  <th>ضريبة القيمة المضافة {invoice.vat_rate}%</th>
                  <td className="num">{money(vatAmount)}</td>
                </tr>
              ) : null}
              <tr className="invoice-grand">
                <th>الإجمالي المستحق</th>
                <td className="num">
                  {money(total)} {settings.currency}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="invoice-signs">
          <div className="sign">
            <div className="line" />
            المورّد
          </div>
          <div className="sign">
            <div className="line" />
            المستلم
          </div>
        </section>

        <footer className="invoice-thanks">شكراً لتعاملكم مع {settings.store_name}.</footer>
      </article>
    </div>,
    document.body,
  )
}
