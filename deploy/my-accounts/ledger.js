// ============================================================
// ledger.js — دفاتر العمولة: كل دفتر نسبة من بنود، وتُخصم الاستلامات
//
//     الباقي لي = مجموع النسب المستحقة − مجموع الاستلامات
//
// الدفاتر:
//   containers  فواتير الحاويات        2.5%
//   branches    مبيعات الفروع          0.5%
//
// البنود والاستلامات في نفس الجدولين، يفرّقها عمود ledger
// (migration 0011). في البند: ref = رقم الحاوية أو اسم الفرع،
// ref2 = رقم الفاتورة أو الفترة — مخزّنان في container_no و invoice_no.
//
// يعتمد على index.html (state, db, run, render, openDialog, money…)
// وexport.js (xlSheet, xlBook, printDoc).
// ============================================================

const LEDGERS = {
  containers: {
    title: 'نسبة الحاويات', rate: 2.5,
    item: 'فاتورة حاوية', items: 'الفواتير', unit: 'حاوية',
    ref: 'رقم الحاوية', refPh: 'MSCU1234567', ref2: 'رقم الفاتورة', ref2Ph: '',
    amount: 'مبلغ الفاتورة', ltr: true, bulkPh: '15/01/2025    MSCU1234567    48000\n20/01/2025    TGHU7654321    52,500',
  },
  branches: {
    title: 'نسبة مبيعات الفروع', rate: 0.5,
    item: 'مبيعات فرع', items: 'المبيعات', unit: 'قيد',
    ref: 'الفرع', refPh: 'مثلاً: فرع الرياض', ref2: 'الفترة / الشهر', ref2Ph: 'مثلاً: يناير 2025',
    amount: 'مبلغ المبيعات', ltr: false, bulkPh: '31/01/2025    فرع الرياض    250000\n31/01/2025    فرع جدة    180,000',
  },
}

const commissionOf = (amount, rate) => Math.round(num(amount) * num(rate)) / 100
const normRef = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9؀-ۿ]/g, '')
const itemsOf = (k) => state.invoices.filter((i) => i.ledger === k)
const receiptsOf = (k) => state.receipts.filter((r) => r.ledger === k)

/** رقم كل بند حسب ترتيب إدخاله داخل دفتره: الأول ١، الثاني ٢… */
function seqOf(k) {
  const map = new Map()
  ;[...itemsOf(k)].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .forEach((i, n) => map.set(i.id, n + 1))
  return map
}

/** المكرّرات: حاوية برقمها، أو فرع بنفس التاريخ والمبلغ */
function duplicatesOf(k) {
  const seen = new Map(), dup = new Set()
  for (const i of itemsOf(k)) {
    const key = k === 'containers' ? normRef(i.container_no) : `${normRef(i.container_no)}|${i.invoice_date}|${num(i.invoice_amount)}`
    if (!normRef(i.container_no)) continue
    if (seen.has(key)) { dup.add(i.id); dup.add(seen.get(key)) } else seen.set(key, i.id)
  }
  return dup
}

/** كشف الدفتر: البنود لك، الاستلامات عليك، برصيد جارٍ ورصيد سابق للفترة */
function statementOf(k) {
  const seq = seqOf(k)
  const moves = [
    ...itemsOf(k).map((i) => ({ type: 'inv', id: i.id, date: i.invoice_date, at: i.created_at, due: num(i.commission), paid: 0, row: i })),
    ...receiptsOf(k).map((r) => ({ type: 'rec', id: r.id, date: r.receipt_date, at: r.created_at, due: 0, paid: num(r.amount), row: r })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? a.at.localeCompare(b.at) : a.type === 'inv' ? -1 : 1))
  const opening = moves.filter((m) => state.from && m.date < state.from).reduce((s, m) => s + m.due - m.paid, 0)
  let run = opening
  const lines = moves.filter((m) => dateIn(m.date)).map((m) => ({ ...m, seq: seq.get(m.id), run: (run += m.due - m.paid) }))
  const items = itemsOf(k).filter((i) => dateIn(i.invoice_date))
  const due = lines.reduce((s, m) => s + m.due, 0)
  const paid = lines.reduce((s, m) => s + m.paid, 0)
  return {
    opening, lines, due, paid, closing: opening + due - paid,
    count: items.length, base: items.reduce((s, i) => s + num(i.invoice_amount), 0),
    receipts: lines.filter((m) => m.type === 'rec').length,
  }
}

/** وصف الحركة بكلمات واضحة */
function describe(k, m) {
  const L = LEDGERS[k]
  if (m.type === 'rec') return { title: ['استلام', m.row.method].filter(Boolean).join(' — '), sub: m.row.note }
  return {
    title: `${L.item} #${m.seq}${m.row.container_no ? ' — ' + m.row.container_no : ''}`,
    sub: [m.row.invoice_no, num(m.row.invoice_amount) ? `${L.amount} ${money(m.row.invoice_amount)} × ${pct(m.row.rate)}` : '', m.row.note].filter(Boolean).join(' · '),
  }
}

/** البنود مجمّعة بالسنة (الأحدث أولاً) مع العدد والمجاميع */
function byYear(k) {
  const years = new Map()
  for (const i of itemsOf(k).filter((x) => dateIn(x.invoice_date))) {
    const y = i.invoice_date.slice(0, 4)
    if (!years.has(y)) years.set(y, { year: y, list: [], base: 0, commission: 0, refs: new Set() })
    const g = years.get(y)
    g.list.push(i); g.base += num(i.invoice_amount); g.commission += num(i.commission)
    if (normRef(i.container_no)) g.refs.add(normRef(i.container_no))
  }
  return [...years.values()].sort((a, b) => b.year.localeCompare(a.year)).map((g) => ({
    ...g, count: g.list.length,
    // الحاويات: عدد الحاويات المختلفة. الفروع: عدد القيود
    units: k === 'containers' ? g.refs.size || g.list.length : g.list.length,
    list: g.list.sort((a, b) => a.invoice_date.localeCompare(b.invoice_date) || a.created_at.localeCompare(b.created_at)),
  }))
}

// ---------- الرئيسية ----------
function homeView() {
  const s = Object.fromEntries(Object.keys(LEDGERS).map((k) => [k, statementOf(k)]))
  const total = Object.values(s).reduce((x, v) => ({ due: x.due + v.due, paid: x.paid + v.paid, closing: x.closing + v.closing }), { due: 0, paid: 0, closing: 0 })
  return `
    <div class="tiles">
      <div class="tile hero span2">
        <span class="lbl">الباقي لي — كل النسب</span>
        <span class="big" style="font-size:34px">${money(total.closing)}</span>
        <span class="foot">مستحق ${money(total.due)} · مستلم ${money(total.paid)}</span>
      </div>
      ${Object.entries(LEDGERS).map(([k, L]) => `
        <button class="tile ledger" data-act="open" data-ledger="${k}">
          <span class="name">${esc(L.title)}</span>
          <span class="pill" style="align-self:flex-start">${pct(L.rate)}</span>
          <span class="lbl" style="margin-top:6px">الباقي لي</span>
          <span class="big">${money(s[k].closing)}</span>
          <span class="foot">${s[k].count} ${k === 'containers' ? 'فاتورة' : 'قيد'} · ${s[k].receipts} استلام</span>
        </button>`).join('')}
    </div>
    ${periodBar()}
    <div class="tiles">
      <button class="tile act" data-act="pdfAll"><span class="ic">📄</span>كشف شامل PDF</button>
      <button class="tile act" data-act="xlsxAll"><span class="ic">📊</span>كشف شامل Excel</button>
    </div>`
}

// ---------- شاشة الدفتر ----------
function ledgerView(k) {
  const L = LEDGERS[k]
  const s = statementOf(k)
  const tab = state.tab
  const tabs = `<div class="seg-tabs">
    ${[['statement', 'كشف الحساب'], ['items', `${L.items} (${s.count})`], ['receipts', `الاستلامات (${s.receipts})`]]
      .map(([t, label]) => `<button class="${tab === t ? 'on' : ''}" data-act="tab" data-tab="${t}">${label}</button>`).join('')}
  </div>`
  const body = tab === 'items' ? itemsList(k) : tab === 'receipts' ? receiptsList(k) : statementList(k, s)
  return `
    <div class="tiles three">
      <div class="tile"><span class="lbl">نسبتي المستحقة</span><span class="big in">${money(s.due)}</span><span class="foot">${s.count} ${k === 'containers' ? 'فاتورة' : 'قيد'}</span></div>
      <div class="tile"><span class="lbl">استلمت</span><span class="big out">${money(s.paid)}</span><span class="foot">${s.receipts} دفعة</span></div>
      <div class="tile hero"><span class="lbl">الباقي لي</span><span class="big">${money(s.closing)}</span>${s.closing < 0 ? '<span class="foot">استلمت أكثر من المستحق</span>' : ''}</div>
    </div>
    <div class="tiles">
      <button class="tile act primary" data-act="newItem"><span class="ic">＋</span>${esc(L.item)}</button>
      <button class="tile act" data-act="newRec"><span class="ic">💵</span>استلام</button>
      <button class="tile act" data-act="pdf"><span class="ic">📄</span>كشف PDF</button>
      <button class="tile act" data-act="xlsx"><span class="ic">📊</span>كشف Excel</button>
    </div>
    ${periodBar()}
    ${tabs}${body}
    <button class="btn" data-act="bulk" style="width:100%">📥 إدخال جماعي (للحسابات القديمة)</button>`
}

/** كشف الحساب: كل حركة سطر واضح — المبلغ بإشارته والباقي بعدها */
function statementList(k, s) {
  const dup = duplicatesOf(k)
  const rows = s.lines.slice().reverse().map((m) => {
    const d = describe(k, m)
    return `<div class="item tap" data-act="${m.type === 'inv' ? 'editItem' : 'editRec'}" data-id="${m.id}">
      <div><div class="t">${dup.has(m.id) ? '<span class="warn">⚠ </span>' : ''}${esc(d.title)}</div>
        <div class="s">${dt(m.date)}${d.sub ? ' · ' + esc(d.sub) : ''}</div></div>
      <div class="v"><b class="${m.due ? 'in' : 'out'}">${m.due ? '+' + money(m.due) : '−' + money(m.paid)}</b>
        <div class="s">الباقي ${money(m.run)}</div></div>
    </div>`
  }).join('')
  return `<p class="note">الأحدث فوق. اضغط على أي حركة لتعديلها.${dup.size ? ` <span class="warn">⚠ ${dup.size} مكرّرة.</span>` : ''}</p>
    <div class="list">
      ${rows || '<div class="empty">ما فيه حركات. أضف ' + esc(LEDGERS[k].item) + ' أو استلام.</div>'}
      ${state.from ? `<div class="item sum"><div>رصيد سابق قبل ${dt(state.from)}</div><div class="v">${money(s.opening)}</div></div>` : ''}
    </div>`
}

function itemsList(k) {
  const L = LEDGERS[k], seq = seqOf(k), dup = duplicatesOf(k), groups = byYear(k)
  if (!groups.length) return '<div class="list"><div class="empty">ما فيه بنود في هذه الفترة.</div></div>'
  const yearTiles = `<div class="tiles">${groups.map((g) => `<div class="tile">
      <span class="lbl">سنة ${g.year}</span><span class="big">${g.units} ${L.unit}</span>
      <span class="foot in">نسبتي ${money(g.commission)}</span></div>`).join('')}</div>`
  const list = groups.map((g) => `
    <div class="item head"><span>${g.year} — ${g.units} ${L.unit}</span><span>${money(g.commission)}</span></div>
    ${g.list.map((i) => `<div class="item tap" data-act="editItem" data-id="${i.id}">
      <div><div class="t"><span class="seq">${seq.get(i.id)}</span>${dup.has(i.id) ? '<span class="warn">⚠ </span>' : ''}<span ${L.ltr ? 'dir="ltr"' : ''}>${esc(i.container_no) || '—'}</span></div>
        <div class="s">${dt(i.invoice_date)}${i.invoice_no ? ' · ' + esc(i.invoice_no) : ''}${num(i.invoice_amount) ? ' · ' + money(i.invoice_amount) : ''}</div></div>
      <div class="v"><b class="in">${money(i.commission)}</b><div class="s">${pct(i.rate)}</div></div>
    </div>`).join('')}`).join('')
  return `${yearTiles}<p class="note">الرقم بجانب كل بند = ترتيب إدخاله. اضغط على أي بند لتعديله.</p><div class="list">${list}</div>`
}

function receiptsList(k) {
  const list = receiptsOf(k).filter((r) => dateIn(r.receipt_date))
    .sort((a, b) => b.receipt_date.localeCompare(a.receipt_date) || b.created_at.localeCompare(a.created_at))
  const total = list.reduce((s, r) => s + num(r.amount), 0)
  return `<div class="list">
    ${list.map((r) => `<div class="item tap" data-act="editRec" data-id="${r.id}">
      <div><div class="t">${esc([r.method, r.note].filter(Boolean).join(' — ')) || 'استلام'}</div><div class="s">${dt(r.receipt_date)}</div></div>
      <div class="v"><b class="out">${money(r.amount)}</b></div></div>`).join('') || '<div class="empty">ما فيه استلامات في هذه الفترة.</div>'}
    ${list.length ? `<div class="item sum"><div>المجموع — ${list.length} دفعة</div><div class="v">${money(total)}</div></div>` : ''}
  </div>`
}

// ---------- النوافذ ----------
const saveBtns = (existing) => `<div class="row" style="justify-content:space-between">
  ${existing ? '<button class="btn danger" value="delete" formnovalidate>حذف</button>' : '<span></span>'}
  <div class="row"><button class="btn" value="cancel" formnovalidate>إلغاء</button><button class="btn primary" value="save">حفظ</button></div>
</div>`

function itemDialog(k, i) {
  const L = LEDGERS[k]
  const refs = [...new Set(itemsOf(k).map((x) => x.container_no).filter(Boolean))]
  openDialog(`<h2>${i ? 'تعديل ' : ''}${esc(L.item)}</h2>
    <div class="grid2">
      <div class="field"><label>${esc(L.ref)}</label><input name="ref" value="${esc(i?.container_no)}" placeholder="${esc(L.refPh)}" ${L.ltr ? 'dir="ltr" autocapitalize="characters"' : 'list="refList"'}>
        ${L.ltr ? '' : `<datalist id="refList">${refs.map((r) => `<option value="${esc(r)}">`).join('')}</datalist>`}</div>
      <div class="field"><label>${esc(L.ref2)}</label><input name="ref2" value="${esc(i?.invoice_no)}" placeholder="${esc(L.ref2Ph)}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>${esc(L.amount)}</label><input name="amount" type="number" min="0" step="0.01" inputmode="decimal" value="${i ? num(i.invoice_amount) || '' : ''}" data-calc></div>
      <div class="field"><label>النسبة %</label><input name="rate" type="number" min="0" max="100" step="0.001" inputmode="decimal" value="${i ? num(i.rate) : L.rate}" data-calc></div>
    </div>
    <div class="grid2">
      <div class="field"><label>نسبتي (تنحسب تلقائياً)</label><input name="commission" type="number" min="0" step="0.01" inputmode="decimal" required value="${i ? num(i.commission) : ''}"></div>
      <div class="field"><label>التاريخ</label><input name="date" type="date" required value="${i?.invoice_date || today()}"></div>
    </div>
    <div class="field"><label>ملاحظة</label><input name="note" value="${esc(i?.note)}"></div>
    <p class="muted small" style="margin:0 0 12px">إذا ما تعرف المبلغ القديم، اكتب نسبتك مباشرة في «نسبتي».</p>
    ${saveBtns(i)}`, async (f, action) => {
    if (action === 'delete') {
      if (!confirm('حذف هذا البند؟')) return false
      return run(db.from('pa_container_invoices').delete().eq('id', i.id))
    }
    const ref = f.get('ref').trim()
    const row = {
      ledger: k,
      container_no: L.ltr ? ref.toUpperCase() : ref,
      invoice_no: f.get('ref2').trim(),
      invoice_amount: num(f.get('amount')),
      rate: num(f.get('rate')),
      commission: num(f.get('commission')),
      invoice_date: f.get('date'),
      note: f.get('note').trim(),
    }
    if (!row.commission) { alert(`اكتب ${L.amount} أو نسبتك.`); return false }
    if (k === 'containers' && row.container_no) {
      const clash = itemsOf(k).find((x) => x.id !== i?.id && normRef(x.container_no) === normRef(row.container_no))
      if (clash && !confirm(`الحاوية ${row.container_no} مسجّلة من قبل بتاريخ ${clash.invoice_date}. تحفظها مرة ثانية؟`)) return false
    }
    return i ? run(db.from('pa_container_invoices').update(row).eq('id', i.id))
             : run(db.from('pa_container_invoices').insert(row))
  })
}

function receiptDialog(k, r) {
  openDialog(`<h2>${r ? 'تعديل استلام' : 'استلام'} — ${esc(LEDGERS[k].title)}</h2>
    <div class="grid2">
      <div class="field"><label>المبلغ</label><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required value="${r ? num(r.amount) : ''}"></div>
      <div class="field"><label>التاريخ</label><input name="date" type="date" required value="${r?.receipt_date || today()}"></div>
    </div>
    <div class="field"><label>طريقة الاستلام</label>
      <select name="method">${['', 'تحويل', 'كاش', 'شيك'].map((m) => `<option ${r?.method === m ? 'selected' : ''} value="${m}">${m || '—'}</option>`).join('')}</select></div>
    <div class="field"><label>ملاحظة</label><input name="note" value="${esc(r?.note)}"></div>
    ${saveBtns(r)}`, async (f, action) => {
    if (action === 'delete') {
      if (!confirm('حذف هذا الاستلام؟')) return false
      return run(db.from('pa_commission_receipts').delete().eq('id', r.id))
    }
    const row = { ledger: k, amount: num(f.get('amount')), receipt_date: f.get('date'), method: f.get('method'), note: f.get('note').trim() }
    return r ? run(db.from('pa_commission_receipts').update(row).eq('id', r.id))
             : run(db.from('pa_commission_receipts').insert(row))
  })
}

// النسبة تنحسب تلقائياً لما يتغيّر المبلغ أو النسبة
document.addEventListener('input', (ev) => {
  if (!ev.target.hasAttribute('data-calc')) return
  const f = ev.target.form
  const amount = num(f.amount.value)
  if (amount) f.commission.value = commissionOf(amount, f.rate.value).toFixed(2)
})

// ---------- الإدخال الجماعي (للحسابات القديمة المبعثرة) ----------
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩', FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const latinDigits = (v) => String(v ?? '').replace(/[٠-٩۰-۹]/g, (d) => String(AR_DIGITS.indexOf(d) >= 0 ? AR_DIGITS.indexOf(d) : FA_DIGITS.indexOf(d)))
  .replace(/٫/g, '.').replace(/٬/g, ',')

/** تاريخ من خلية: 2025-01-15 أو 15/1/2025 أو 15-1-25 (اليوم أولاً) أو Date من Excel */
function parseDate(v) {
  if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  const t = latinDigits(v).trim()
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  let y, mo, d
  if (m) [, y, mo, d] = m
  else if ((m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) [, d, mo, y] = m
  else return null
  y = +y < 100 ? 2000 + +y : +y
  if (+mo > 12 && +d <= 12) [mo, d] = [d, mo] // صيغة أمريكية واضحة
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** مبلغ من خلية: يقبل الفواصل والأرقام العربية و«ر.س» */
function parseAmount(v) {
  if (typeof v === 'number') return v
  const t = latinDigits(v).replace(/(ر\.?س|ريال|sar|sr)/gi, '').replace(/[,\s]/g, '').trim()
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null
}

const CONT_RE = /^[A-Z]{3,4}U?\s?\d{6,7}$/i

/** سطر → خلايا: بالتاب (لصق من Excel) وإلا بـ| أو ; أو مسافتين */
function splitLine(line) {
  if (line.includes('\t')) return line.split('\t')
  if (/[|;]/.test(line)) return line.split(/[|;]/)
  return line.split(/\s{2,}|,\s+|\s+-\s+/)
}

/** خلايا → بند أو استلام. مبلغان في سطر البند = (المبلغ، نسبتي) */
function parseCells(k, cells, kind, rate) {
  cells = cells.map((c) => (c instanceof Date ? c : String(c ?? '').trim())).filter((c) => c !== '')
  let date = null, ref = '', amounts = [], rest = []
  for (const c of cells) {
    const d = !date && parseDate(c)
    if (d) { date = d; continue }
    const a = parseAmount(c)
    if (a !== null && a > 0) { amounts.push(a); continue }
    if (!ref && kind === 'inv' && k === 'containers' && CONT_RE.test(String(c))) { ref = String(c).replace(/\s/g, '').toUpperCase(); continue }
    rest.push(String(c))
  }
  if (!date || !amounts.length) return { error: !date ? 'ما لقيت تاريخ' : 'ما لقيت مبلغ' }
  if (kind === 'rec') {
    const mi = rest.findIndex((x) => /^(تحويل|كاش|نقد[اًا]?|شيك)$/.test(x.trim()))
    const method = mi < 0 ? '' : rest.splice(mi, 1)[0].trim().replace(/^نقد.*/, 'كاش')
    return { ledger: k, receipt_date: date, amount: amounts[0], method, note: rest.join(' — ') }
  }
  if (!ref && rest.length) ref = rest.shift()
  const [amount, explicit] = amounts.length > 1 ? [Math.max(...amounts), Math.min(...amounts)] : [amounts[0], null]
  return {
    ledger: k, invoice_date: date, container_no: k === 'containers' ? ref.toUpperCase() : ref, invoice_no: '',
    invoice_amount: amount, rate, commission: explicit ?? commissionOf(amount, rate), note: rest.join(' — '),
  }
}

function bulkDialog(k) {
  const L = LEDGERS[k]
  const preview = () => {
    const f = $('#dlgForm'), kind = f.kind.value, rate = num(f.rate.value) || L.rate
    const lines = (state.bulkRows || f.text.value.split(/\r?\n/).map(splitLine))
      .filter((c) => c.some((x) => String(x ?? '').trim()))
    const parsed = lines.map((c) => ({ cells: c, ...parseCells(k, c, kind, rate) }))
    state.bulkParsed = parsed
    const ok = parsed.filter((p) => !p.error)
    const total = ok.reduce((s, p) => s + num(kind === 'inv' ? p.commission : p.amount), 0)
    $('#bulkPreview').innerHTML = !parsed.length ? '' : `
      <p class="small"><b>${ok.length}</b> سطر جاهز${parsed.length - ok.length ? ` — <span class="out">${parsed.length - ok.length} ما انقرأ</span>` : ''} — المجموع <b>${money(total)}</b></p>
      <div class="list" style="max-height:240px;overflow:auto">
        ${parsed.map((p) => p.error
          ? `<div class="item"><span class="out small">${esc(p.cells.map((c) => (c instanceof Date ? parseDate(c) : c)).join(' | '))} ← ${p.error}</span></div>`
          : kind === 'inv'
            ? `<div class="item"><div><div class="t">${esc(p.container_no) || '—'}</div><div class="s">${dt(p.invoice_date)}${p.invoice_amount !== p.commission ? ' · ' + money(p.invoice_amount) : ''}</div></div><div class="v"><b class="in">${money(p.commission)}</b></div></div>`
            : `<div class="item"><div><div class="t">${esc([p.method, p.note].filter(Boolean).join(' — ')) || 'استلام'}</div><div class="s">${dt(p.receipt_date)}</div></div><div class="v"><b class="out">${money(p.amount)}</b></div></div>`).join('')}
      </div>`
  }
  state.bulkRows = null
  openDialog(`<h2>إدخال جماعي — ${esc(L.title)}</h2>
    <div class="field seg">
      <label><input type="radio" name="kind" value="inv" checked><span>${esc(L.items)}</span></label>
      <label><input type="radio" name="kind" value="rec"><span>استلامات</span></label>
    </div>
    <div class="field"><label>الصق الأسطر (من Excel أو الواتساب) — سطر لكل قيد</label>
      <textarea name="text" rows="5" dir="auto" placeholder="${esc(L.bulkPh)}&#10;&#10;أو للاستلامات:&#10;01/02/2025    2000    تحويل"></textarea></div>
    <div class="grid2">
      <div class="field"><label>أو ارفع ملف Excel</label><input type="file" name="file" accept=".xlsx,.xls,.csv"></div>
      <div class="field"><label>النسبة %</label><input name="rate" type="number" step="0.001" value="${L.rate}"></div>
    </div>
    <p class="muted small" style="margin:0 0 8px">أفهم التاريخ والمبلغ و${esc(L.ref)} بأي ترتيب، والأرقام العربية. إذا في السطر مبلغين آخذ الصغير كنسبتي.</p>
    <div id="bulkPreview"></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" value="cancel" formnovalidate>إلغاء</button><button class="btn primary" value="save">احفظ الكل</button></div>`, async (f) => {
    preview()
    const kind = f.get('kind'), ok = state.bulkParsed.filter((p) => !p.error)
    if (!ok.length) { alert('ما فيه أسطر صالحة للحفظ.'); return false }
    const rows = ok.map(({ cells, error, ...r }) => r)
    if (kind === 'inv' && k === 'containers') {
      const known = new Set(itemsOf(k).map((x) => normRef(x.container_no)).filter(Boolean))
      const rep = rows.filter((r) => r.container_no && known.has(normRef(r.container_no))).length
      if (rep && !confirm(`${rep} حاوية منها مسجّلة من قبل. تحفظها كلها مع ذلك؟`)) return false
    }
    if (!confirm(`حفظ ${rows.length} ${kind === 'inv' ? 'بند' : 'استلام'}؟`)) return false
    state.tab = kind === 'inv' ? 'items' : 'receipts'
    return run(db.from(kind === 'inv' ? 'pa_container_invoices' : 'pa_commission_receipts').insert(rows))
  })
  const f = $('#dlgForm')
  f.text.addEventListener('input', () => { state.bulkRows = null; f.file.value = ''; preview() })
  f.rate.addEventListener('input', preview)
  f.querySelectorAll('[name=kind]').forEach((r) => r.addEventListener('change', preview))
  f.file.addEventListener('change', async () => {
    const file = f.file.files[0]
    if (!file) return
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true })
    state.bulkRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' })
    f.text.value = ''
    preview()
  })
}

// ---------- التصدير ----------
const ST_HEAD = ['التاريخ', 'البيان', 'لي (نسبة)', 'استلمت', 'الباقي']

function statementRows(k, s) {
  const rows = []
  if (state.from) rows.push({ kind: 'sub', cells: ['', 'رصيد سابق', '', '', s.opening] })
  for (const m of s.lines) {
    const d = describe(k, m)
    rows.push([m.date, d.sub ? `${d.title} (${d.sub})` : d.title, m.due || '', m.paid || '', m.run])
  }
  rows.push({ kind: 'total', cells: ['', 'المجموع', s.due, s.paid, s.closing] })
  return rows
}

const itemHead = (k) => ['#', 'التاريخ', LEDGERS[k].ref, LEDGERS[k].ref2, LEDGERS[k].amount, 'النسبة', 'نسبتي', 'ملاحظة']

/** البنود مجمّعة بالسنة مع مجموع لكل سنة ومجموع كلي */
function itemRows(k) {
  const L = LEDGERS[k], seq = seqOf(k), groups = byYear(k).reverse()
  const rows = []
  let base = 0, commission = 0, count = 0
  for (const g of groups) {
    rows.push({ kind: 'group', cells: [`سنة ${g.year} — ${g.units} ${L.unit}`] })
    for (const i of g.list) rows.push([seq.get(i.id), i.invoice_date, i.container_no, i.invoice_no, num(i.invoice_amount) || '', pct(i.rate), num(i.commission), i.note])
    rows.push({ kind: 'sub', cells: ['', '', `مجموع ${g.year}`, `${g.count} بند`, g.base, '', g.commission, ''] })
    base += g.base; commission += g.commission; count += g.count
  }
  rows.push({ kind: 'total', cells: ['', '', 'المجموع الكلي', `${count} بند`, base, '', commission, ''] })
  return { rows, groups }
}

function yearRows(k, groups) {
  const rows = [...groups].reverse().map((g) => [g.year, g.units, g.base, g.commission])
  rows.push({ kind: 'total', cells: ['المجموع', groups.reduce((x, g) => x + g.units, 0), groups.reduce((x, g) => x + g.base, 0), groups.reduce((x, g) => x + g.commission, 0)] })
  return rows
}
const yearHead = (k) => ['السنة', k === 'containers' ? 'عدد الحاويات' : 'عدد القيود', LEDGERS[k].amount, 'نسبتي']

function receiptRows(k, s) {
  const rec = receiptsOf(k).filter((r) => dateIn(r.receipt_date)).sort((a, b) => a.receipt_date.localeCompare(b.receipt_date))
  return [...rec.map((r, n) => [n + 1, r.receipt_date, num(r.amount), r.method, r.note]),
    { kind: 'total', cells: ['', 'المجموع', s.paid, `${rec.length} دفعة`, ''] }]
}

/** أوراق Excel لدفتر واحد */
function ledgerSheets(k, prefix = '') {
  const L = LEDGERS[k], s = statementOf(k), { rows, groups } = itemRows(k)
  const sub = `${periodLabel()} — طُبع ${today()} — النسبة ${pct(L.rate)}`
  return [
    [prefix + 'كشف الحساب', xlSheet({ title: `كشف حساب ${L.title}`, subtitle: sub,
      stats: [['نسبتي المستحقة', s.due], ['استلمت', s.paid], ['الباقي لي', s.closing]],
      headers: ST_HEAD, rows: statementRows(k, s), widths: [13, 56, 16, 16, 16], money: [2, 3, 4], colors: { 2: 'green', 3: 'red' } })],
    [prefix + 'حسب السنة', xlSheet({ title: `${L.title} حسب السنة`, subtitle: sub,
      headers: yearHead(k), rows: yearRows(k, groups), widths: [12, 15, 20, 18], money: [2, 3], colors: { 3: 'green' } })],
    [prefix + L.items, xlSheet({ title: `${L.items} — ${L.title}`, subtitle: sub,
      headers: itemHead(k), rows, widths: [6, 13, 20, 18, 17, 9, 15, 30], money: [4, 6], colors: { 6: 'green' } })],
    [prefix + 'الاستلامات', xlSheet({ title: `الاستلامات — ${L.title}`, subtitle: sub,
      headers: ['#', 'التاريخ', 'المبلغ', 'الطريقة', 'ملاحظة'], rows: receiptRows(k, s), widths: [6, 13, 17, 12, 40], money: [2], colors: { 2: 'red' } })],
  ]
}

/** أقسام PDF لدفتر واحد */
function ledgerSections(k, withTitle) {
  const L = LEDGERS[k], s = statementOf(k), { rows, groups } = itemRows(k)
  const t = (x) => (withTitle ? `${L.title} — ${x}` : x)
  return [
    { title: t('كشف الحساب'), headers: ST_HEAD, rows: statementRows(k, s), money: [2, 3, 4], colors: { 2: 'green', 3: 'red' }, dates: [0] },
    { title: t('حسب السنة'), headers: yearHead(k), rows: yearRows(k, groups), money: [2, 3], colors: { 3: 'green' } },
    { title: t(L.items), headers: itemHead(k).slice(0, 7), rows: rows.map((r) => (Array.isArray(r) ? r.slice(0, 7) : { ...r, cells: r.cells.slice(0, 7) })), money: [4, 6], colors: { 6: 'green' }, dates: [1] },
    { title: t('الاستلامات'), headers: ['#', 'التاريخ', 'المبلغ', 'الطريقة', 'ملاحظة'], rows: receiptRows(k, s), money: [2], colors: { 2: 'red' }, dates: [1] },
  ]
}

function ledgerXlsx(k) {
  xlBook(ledgerSheets(k), `${LEDGERS[k].title} ${today()}.xlsx`)
}

function ledgerPdf(k) {
  const L = LEDGERS[k], s = statementOf(k)
  printDoc({
    title: `كشف حساب ${L.title} (${pct(L.rate)})`, meta: periodLabel(),
    stats: [[k === 'containers' ? 'عدد الفواتير' : 'عدد القيود', String(s.count)], [`إجمالي ${L.amount.replace('مبلغ ', '')}`, money(s.base)],
      ['نسبتي المستحقة', money(s.due), 'g'], ['استلمت', money(s.paid), 'r'], ['الباقي لي', money(s.closing)]],
    sections: ledgerSections(k, false),
  })
}

/** الملخص الشامل لكل الدفاتر */
function summaryRows() {
  const rows = Object.entries(LEDGERS).map(([k, L]) => { const s = statementOf(k); return [L.title, pct(L.rate), s.count, s.due, s.paid, s.closing] })
  const sum = (c) => rows.reduce((x, r) => x + r[c], 0)
  const due = sum(3), paid = sum(4), closing = sum(5)
  rows.push({ kind: 'total', cells: ['المجموع', '', sum(2), due, paid, closing] })
  return { rows, due, paid, closing }
}
const SUM_HEAD = ['النسبة', '٪', 'البنود', 'المستحق', 'المستلم', 'الباقي']

function allXlsx() {
  const sm = summaryRows()
  const sheets = [['الملخص', xlSheet({ title: 'ملخص كل النسب', subtitle: `${periodLabel()} — طُبع ${today()}`,
    stats: [['المستحق', sm.due], ['المستلم', sm.paid], ['الباقي لي', sm.closing]],
    headers: SUM_HEAD, rows: sm.rows, widths: [24, 8, 10, 16, 16, 16], money: [3, 4, 5], colors: { 3: 'green', 4: 'red' } })]]
  for (const k of Object.keys(LEDGERS)) sheets.push(...ledgerSheets(k, k === 'containers' ? 'حاويات - ' : 'فروع - '))
  xlBook(sheets, `حساباتي - كشف شامل ${today()}.xlsx`)
}

function allPdf() {
  const sm = summaryRows()
  printDoc({
    title: 'كشف شامل — كل النسب', meta: periodLabel(),
    stats: [['المستحق', money(sm.due), 'g'], ['المستلم', money(sm.paid), 'r'], ['الباقي لي', money(sm.closing)]],
    sections: [{ title: 'الملخص', headers: SUM_HEAD, rows: sm.rows, money: [3, 4, 5], colors: { 3: 'green', 4: 'red' } },
      ...Object.keys(LEDGERS).flatMap((k) => ledgerSections(k, true))],
  })
}

// ---------- النقرات ----------
function ledgerClick(t) {
  const k = state.ledger, id = t.dataset.id
  switch (t.dataset.act) {
    case 'open': state.ledger = t.dataset.ledger; state.tab = 'statement'; window.scrollTo(0, 0); return render()
    case 'tab': state.tab = t.dataset.tab; return render()
    case 'newItem': return itemDialog(k, null)
    case 'newRec': return receiptDialog(k, null)
    case 'editItem': return itemDialog(k, state.invoices.find((i) => i.id === id))
    case 'editRec': return receiptDialog(k, state.receipts.find((r) => r.id === id))
    case 'bulk': return bulkDialog(k)
    case 'pdf': return ledgerPdf(k)
    case 'xlsx': return ledgerXlsx(k)
    case 'pdfAll': return allPdf()
    case 'xlsxAll': return allXlsx()
  }
}
