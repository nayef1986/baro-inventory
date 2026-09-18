// ============================================================
// StatementPrint.tsx — كشف الحساب الشهري للطباعة / PDF
//
// يشارك تنسيق الفاتورة نفسه (.invoice-*) فيبقى المستندان أخوين
// في الشكل، ويُحفظ مكان واحد للتعديل.
// ============================================================

import { createPortal } from 'react-dom'

import { money, arabicDate, hijriDate, integer } from '../lib/format.ts'
import { monthLabel } from '../lib/statement.ts'
import type { Statement } from '../lib/statement.ts'
import type { Customer, Settings } from '../types.ts'
import { Wordmark } from './Wordmark.tsx'

export interface StatementProps {
  statement: Statement
  month: string
  customer: Customer | null
  settings: Settings
  issuedOn: string
}

export function StatementSheet({
  statement,
  month,
  customer,
  settings,
  issuedOn,
}: StatementProps) {
  const hijri = hijriDate(issuedOn)
  const s = statement

  return (
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
          </div>
        </div>

        <div className="invoice-id">
          <div className="invoice-kind">كشف حساب شهري</div>
          <table className="invoice-id-table">
            <tbody>
              <tr>
                <th>الشهر</th>
                <td>{monthLabel(month)}</td>
              </tr>
              <tr>
                <th>الفترة</th>
                <td className="num" dir="ltr">
                  {s.from} — {s.to}
                </td>
              </tr>
              <tr>
                <th>تاريخ الإصدار</th>
                <td>{arabicDate(issuedOn)}</td>
              </tr>
              {hijri ? (
                <tr>
                  <th>الموافق</th>
                  <td>{hijri}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </header>

      <section className="invoice-party">
        <h2>كشف حساب</h2>
        <div className="invoice-party-name">{customer?.name ?? 'عميل نقدي'}</div>
        <div className="invoice-meta">
          {customer?.phone ? <div dir="ltr">{customer.phone}</div> : null}
          {customer?.address ? <div>{customer.address}</div> : null}
        </div>
      </section>

      <table className="invoice-lines">
        <thead>
          <tr>
            <th className="col-idx">#</th>
            <th className="col-name">الفاتورة</th>
            <th className="col-num">التاريخ</th>
            <th className="col-num">الإجمالي</th>
            <th className="col-num">المدفوع</th>
            <th className="col-num">المتبقي</th>
          </tr>
        </thead>
        <tbody>
          {s.lines.map((line, index) => (
            <tr key={line.invoice.id}>
              <td className="col-idx num">{index + 1}</td>
              <td className="col-name num">{line.invoice.invoice_no}</td>
              <td className="col-num">{arabicDate(line.invoice.issued_on)}</td>
              <td className="col-num num">{money(line.total)}</td>
              <td className="col-num num">{line.paid > 0 ? money(line.paid) : '—'}</td>
              <td className="col-num num">{line.balance > 0 ? money(line.balance) : '—'}</td>
            </tr>
          ))}
          {s.lines.length === 0 ? (
            <tr>
              <td colSpan={6}>لا توجد فواتير في هذا الشهر.</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <p className="invoice-count num">
        {integer(s.lines.length)} فاتورة في الشهر
      </p>

      {s.paymentRows.length > 0 ? (
        <>
          <p className="invoice-subhead">الدفعات المستلمة خلال الشهر</p>
          <table className="invoice-lines">
            <thead>
              <tr>
                <th className="col-idx">#</th>
                <th className="col-name">على الفاتورة</th>
                <th className="col-num">التاريخ</th>
                <th className="col-num">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {s.paymentRows.map((row, index) => (
                <tr key={row.payment.id}>
                  <td className="col-idx num">{index + 1}</td>
                  <td className="col-name num">{row.invoiceNo}</td>
                  <td className="col-num">{arabicDate(row.payment.paid_on)}</td>
                  <td className="col-num num">{money(row.payment.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <section className="invoice-foot">
        <div className="invoice-notes">
          <h3>كيف يُقرأ الكشف</h3>
          <p>الرصيد الختامي = الرصيد السابق + فواتير الشهر − المسدَّد خلاله.</p>
        </div>

        <table className="invoice-totals">
          <tbody>
            <tr>
              <th>رصيد ما قبل الشهر</th>
              <td className="num">{money(s.opening)}</td>
            </tr>
            <tr>
              <th>فواتير الشهر</th>
              <td className="num">{money(s.charges)}</td>
            </tr>
            <tr>
              <th>المسدَّد خلال الشهر</th>
              <td className="num" dir="ltr">
                −{money(s.payments)}
              </td>
            </tr>
            <tr className={s.closing > 0 ? 'invoice-balance' : 'invoice-grand'}>
              <th>{s.closing > 0 ? 'الرصيد المستحق' : 'الرصيد'}</th>
              <td className="num">
                {money(s.closing)} {settings.currency}
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
  )
}

/** يظهر في الطباعة فقط */
export function StatementPrint(props: StatementProps) {
  return createPortal(
    <div className="print-root" dir="rtl" lang="ar">
      <StatementSheet {...props} />
    </div>,
    document.body,
  )
}

/** نسخة مرئية خارج حدود الشاشة، لتصويرها إلى PDF */
export function StatementCapture({
  nodeRef,
  ...props
}: StatementProps & { nodeRef: (node: HTMLDivElement | null) => void }) {
  return createPortal(
    <div
      ref={nodeRef}
      dir="rtl"
      lang="ar"
      aria-hidden="true"
      style={{
        position: 'fixed',
        insetInlineStart: '-10000px',
        top: 0,
        width: '794px',
        padding: '40px',
        background: '#ffffff',
        pointerEvents: 'none',
      }}
    >
      <StatementSheet {...props} />
    </div>,
    document.body,
  )
}
