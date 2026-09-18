// ============================================================
// InvoicePrint.tsx — قالب فاتورة التوريد للطباعة / PDF
//
// يُعرض عبر portal إلى body ويظهر في الطباعة فقط. التصدير
// يتم بطباعة المتصفح («حفظ كـPDF») لأنها ترسم العربية بشكل
// صحيح بلا أي مكتبة خارجية.
// ============================================================

import { createPortal } from 'react-dom'

import { money, quantity as fmtQty, arabicDate } from '../lib/format.ts'
import type { Customer, InvoiceTotals, SalesInvoice, SalesInvoiceItem, Settings } from '../types.ts'

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

  return createPortal(
    <div className="print-root" dir="rtl" lang="ar">
      <article className="invoice-sheet">
        <header className="invoice-head">
          <div>
            <h1 className="invoice-brand">{settings.store_name}</h1>
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
                {invoice.due_on ? (
                  <tr>
                    <th>تاريخ الاستحقاق</th>
                    <td>{arabicDate(invoice.due_on)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </header>

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
              <th>الصنف</th>
              <th className="col-num">الكمية</th>
              <th className="col-num">سعر الوحدة</th>
              <th className="col-num">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id}>
                <td className="col-idx num">{index + 1}</td>
                <td>{item.description}</td>
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
                  <td className="num" dir="ltr">−{money(invoice.discount)}</td>
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
                <td className="num">{money(total)} {settings.currency}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <footer className="invoice-thanks">شكراً لتعاملكم مع {settings.store_name}.</footer>
      </article>
    </div>,
    document.body,
  )
}
