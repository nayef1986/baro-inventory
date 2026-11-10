// ============================================================
// containers.js — نسبة فواتير الحاويات (افتراضياً 2.5%)
//
// جهة واحدة تحاسبك على كل فاتورة حاوية بنسبة، وتدفع لك دفعات عامة.
//
//     الباقي لك = مجموع النسب المستحقة − مجموع الاستلامات
//
// يعتمد على ما يعرّفه السكربت الرئيسي في index.html (state, db, run,
// render, openDialog, money, pct, dt, esc, num, today, periodLabel…)
// — تُستدعى الدوال هنا بعد تحميله، فالترتيب سليم.
// ============================================================

const DEFAULT_RATE = 2.5

const commissionOf = (amount, rate) => Math.round(num(amount) * num(rate)) / 100

function dateIn(d) {
  if (state.from && d < state.from) return false
  if (state.to && d > state.to) return false
  return true
}

/** يطبّع رقم الحاوية للمقارنة: حروف كبيرة بلا مسافات أو رموز */
const normCont = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/** الحاويات/الفواتير المكرّرة — أشهر أسباب اللخبطة في الحسابات القديمة */
function duplicates() {
  const seen = new Map(), dup = new Set()
  for (const i of state.invoices) {
    for (const key of [normCont(i.container_no) && 'c:' + normCont(i.container_no), i.invoice_no.trim() && 'i:' + i.invoice_no.trim()]) {
      if (!key) continue
      if (seen.has(key)) { dup.add(i.id); dup.add(seen.get(key)) } else seen.set(key, i.id)
    }
  }
  return dup
}

/** كشف الحساب: النسب مدينة لك، الاستلامات تخصم منها، برصيد جارٍ ورصيد سابق للفترة */
function contStatement() {
  const moves = [
    ...state.invoices.map((i) => ({ type: 'inv', id: i.id, date: i.invoice_date, at: i.created_at, due: num(i.commission), paid: 0, row: i })),
    ...state.receipts.map((r) => ({ type: 'rec', id: r.id, date: r.receipt_date, at: r.created_at, due: 0, paid: num(r.amount), row: r })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? a.at.localeCompare(b.at) : a.type === 'inv' ? -1 : 1))
  const opening = moves.filter((m) => state.from && m.date < state.from).reduce((s, m) => s + m.due - m.paid, 0)
  let run = opening
  const lines = moves.filter((m) => dateIn(m.date)).map((m) => ({ ...m, run: (run += m.due - m.paid) }))
  const inv = state.invoices.filter((i) => dateIn(i.invoice_date))
  const due = lines.reduce((s, m) => s + m.due, 0)
  const paid = lines.reduce((s, m) => s + m.paid, 0)
  return {
    opening, lines, due, paid, closing: opening + due - paid,
    count: inv.length, invTotal: inv.reduce((s, i) => s + num(i.invoice_amount), 0),
  }
}

const describe = (m) => m.type === 'inv'
  ? ['فاتورة', m.row.container_no && `حاوية ${m.row.container_no}`, m.row.invoice_no && `رقم ${m.row.invoice_no}`, m.row.note].filter(Boolean).join(' — ')
  : ['استلام', m.row.method, m.row.note].filter(Boolean).join(' — ')

// ---------- العرض ----------
function contView() {
  const s = contStatement()
  const dup = duplicates()
  const tab = state.contTab
  const sub = `<div class="tabs">
    <button class="btn ${tab === 'statement' ? 'on' : ''}" data-act="ctab" data-tab="statement">كشف الحساب</button>
    <button class="btn ${tab === 'invoices' ? 'on' : ''}" data-act="ctab" data-tab="invoices">الفواتير (${state.invoices.length})</button>
    <button class="btn ${tab === 'receipts' ? 'on' : ''}" data-act="ctab" data-tab="receipts">الاستلامات (${state.receipts.length})</button>
  </div>`

  let body = ''
  if (tab === 'invoices') {
    const list = state.invoices.filter((i) => dateIn(i.invoice_date))
      .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date) || b.created_at.localeCompare(a.created_at))
    body = `<div class="card tablewrap"><table>
      <thead><tr><th>التاريخ</th><th>الحاوية / الفاتورة</th><th class="num hide-sm">مبلغ الفاتورة</th><th class="num hide-sm">النسبة</th><th class="num">نسبتي</th><th></th></tr></thead>
      <tbody>${list.map((i) => `<tr>
        <td>${dt(i.invoice_date)}</td>
        <td>${dup.has(i.id) ? '<span class="warn" title="مكرّرة">⚠ </span>' : ''}<b>${esc(i.container_no) || '—'}</b>
          ${i.invoice_no ? `<div class="muted small">فاتورة ${esc(i.invoice_no)}</div>` : ''}${i.note ? `<div class="muted small">${esc(i.note)}</div>` : ''}</td>
        <td class="num hide-sm">${num(i.invoice_amount) ? money(i.invoice_amount) : '—'}</td>
        <td class="num hide-sm">${pct(i.rate)}</td>
        <td class="num in"><b>${money(i.commission)}</b></td>
        <td class="num"><button class="btn ghost small" data-act="editInv" data-id="${i.id}" aria-label="تعديل">✎</button></td>
      </tr>`).join('') || '<tr><td colspan="6" class="empty">ما فيه فواتير في هذه الفترة.</td></tr>'}</tbody>
      ${list.length ? `<tfoot><tr><td></td><td><b>المجموع (${list.length})</b></td><td class="num hide-sm"><b>${money(s.invTotal)}</b></td><td class="hide-sm"></td><td class="num in"><b>${money(s.due)}</b></td><td></td></tr></tfoot>` : ''}
    </table></div>`
  } else if (tab === 'receipts') {
    const list = state.receipts.filter((r) => dateIn(r.receipt_date))
      .sort((a, b) => b.receipt_date.localeCompare(a.receipt_date) || b.created_at.localeCompare(a.created_at))
    body = `<div class="card tablewrap"><table>
      <thead><tr><th>التاريخ</th><th>البيان</th><th class="num">المبلغ</th><th></th></tr></thead>
      <tbody>${list.map((r) => `<tr>
        <td>${dt(r.receipt_date)}</td>
        <td>${esc([r.method, r.note].filter(Boolean).join(' — ')) || '<span class="muted">—</span>'}</td>
        <td class="num out"><b>${money(r.amount)}</b></td>
        <td class="num"><button class="btn ghost small" data-act="editRec" data-id="${r.id}" aria-label="تعديل">✎</button></td>
      </tr>`).join('') || '<tr><td colspan="4" class="empty">ما فيه استلامات في هذه الفترة.</td></tr>'}</tbody>
      ${list.length ? `<tfoot><tr><td></td><td><b>المجموع (${list.length})</b></td><td class="num out"><b>${money(s.paid)}</b></td><td></td></tr></tfoot>` : ''}
    </table></div>`
  } else {
    body = `<div class="card tablewrap"><table>
      <thead><tr><th>التاريخ</th><th>البيان</th><th class="num">لي (نسبة)</th><th class="num">استلمت</th><th class="num">الباقي</th></tr></thead>
      <tbody>
        ${state.from ? `<tr><td></td><td class="muted">رصيد سابق</td><td></td><td></td><td class="num">${money(s.opening)}</td></tr>` : ''}
        ${s.lines.map((m) => `<tr>
          <td>${dt(m.date)}</td>
          <td>${dup.has(m.id) ? '<span class="warn">⚠ </span>' : ''}${esc(describe(m))}</td>
          <td class="num in">${m.due ? money(m.due) : ''}</td>
          <td class="num out">${m.paid ? money(m.paid) : ''}</td>
          <td class="num"><b>${money(m.run)}</b></td>
        </tr>`).join('') || '<tr><td colspan="5" class="empty">ما فيه حركات بعد. ابدأ بإدخال الفواتير والاستلامات القديمة.</td></tr>'}
      </tbody>
    </table></div>`
  }

  return `
    <div class="stats">
      <div class="stat"><span class="muted small">نسبتي المستحقة</span><b class="in">${money(s.due)}</b><span class="muted small">${s.count} فاتورة</span></div>
      <div class="stat"><span class="muted small">استلمت</span><b class="out">${money(s.paid)}</b></div>
      <div class="stat"><span class="muted small">الباقي لي</span><b class="${s.closing < 0 ? 'out' : ''}">${money(s.closing)}</b>${s.closing < 0 ? '<span class="small out">استلمت أكثر من المستحق</span>' : ''}</div>
    </div>
    ${dup.size ? `<div class="card warn small">⚠ فيه ${dup.size} فاتورة برقم حاوية أو فاتورة مكرّر — راجعها في تبويب الفواتير، غالباً مدخلة مرتين.</div>` : ''}
    ${periodBar()}
    <div class="row between" style="margin:4px 0 10px">
      <button class="btn" data-act="bulk">إدخال جماعي</button>
      <div class="row">
        <button class="btn" data-act="newRec">+ استلام</button>
        <button class="btn primary" data-act="newInv">+ فاتورة حاوية</button>
      </div>
    </div>
    ${sub}${body}`
}

// ---------- النوافذ ----------
const saveBtns = (existing) => `<div class="row between">
  ${existing ? '<button class="btn danger" value="delete" formnovalidate>حذف</button>' : '<span></span>'}
  <div class="row"><button class="btn" value="cancel" formnovalidate>إلغاء</button><button class="btn primary" value="save">حفظ</button></div>
</div>`

function invoiceDialog(i) {
  openDialog(`<h2>${i ? 'تعديل فاتورة حاوية' : 'فاتورة حاوية'}</h2>
    <div class="grid2">
      <div class="field"><label>رقم الحاوية</label><input name="container_no" value="${esc(i?.container_no)}" placeholder="MSCU1234567" dir="ltr" autocapitalize="characters"></div>
      <div class="field"><label>رقم الفاتورة</label><input name="invoice_no" value="${esc(i?.invoice_no)}" dir="ltr"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>مبلغ الفاتورة</label><input name="invoice_amount" type="number" min="0" step="0.01" inputmode="decimal" value="${i ? num(i.invoice_amount) || '' : ''}" data-calc></div>
      <div class="field"><label>النسبة %</label><input name="rate" type="number" min="0" max="100" step="0.001" inputmode="decimal" value="${i ? num(i.rate) : DEFAULT_RATE}" data-calc></div>
    </div>
    <div class="grid2">
      <div class="field"><label>نسبتي (تنحسب تلقائياً)</label><input name="commission" type="number" min="0" step="0.01" inputmode="decimal" required value="${i ? num(i.commission) : ''}"></div>
      <div class="field"><label>التاريخ</label><input name="invoice_date" type="date" required value="${i?.invoice_date || today()}"></div>
    </div>
    <div class="field"><label>ملاحظة</label><input name="note" value="${esc(i?.note)}"></div>
    <p class="muted small" style="margin:0 0 12px">إذا ما تعرف مبلغ الفاتورة القديمة، اكتب نسبتك مباشرة في «نسبتي».</p>
    ${saveBtns(i)}`, async (f, action) => {
    if (action === 'delete') {
      if (!confirm('حذف هذه الفاتورة؟')) return false
      return run(db.from('pa_container_invoices').delete().eq('id', i.id))
    }
    const row = {
      container_no: f.get('container_no').trim().toUpperCase(),
      invoice_no: f.get('invoice_no').trim(),
      invoice_amount: num(f.get('invoice_amount')),
      rate: num(f.get('rate')),
      commission: num(f.get('commission')),
      invoice_date: f.get('invoice_date'),
      note: f.get('note').trim(),
    }
    if (!row.commission) { alert('اكتب مبلغ الفاتورة أو نسبتك.'); return false }
    const clash = row.container_no && state.invoices.find((x) => x.id !== i?.id && normCont(x.container_no) === normCont(row.container_no))
    if (clash && !confirm(`الحاوية ${row.container_no} مسجّلة من قبل بتاريخ ${clash.invoice_date}. تحفظها مرة ثانية؟`)) return false
    return i ? run(db.from('pa_container_invoices').update(row).eq('id', i.id))
             : run(db.from('pa_container_invoices').insert(row))
  })
}

function receiptDialog(r) {
  openDialog(`<h2>${r ? 'تعديل استلام' : 'استلام من النسبة'}</h2>
    <div class="grid2">
      <div class="field"><label>المبلغ</label><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required value="${r ? num(r.amount) : ''}"></div>
      <div class="field"><label>التاريخ</label><input name="receipt_date" type="date" required value="${r?.receipt_date || today()}"></div>
    </div>
    <div class="field"><label>طريقة الاستلام</label>
      <select name="method">${['', 'تحويل', 'كاش', 'شيك'].map((m) => `<option ${r?.method === m ? 'selected' : ''} value="${m}">${m || '—'}</option>`).join('')}</select></div>
    <div class="field"><label>ملاحظة</label><input name="note" value="${esc(r?.note)}"></div>
    ${saveBtns(r)}`, async (f, action) => {
    if (action === 'delete') {
      if (!confirm('حذف هذا الاستلام؟')) return false
      return run(db.from('pa_commission_receipts').delete().eq('id', r.id))
    }
    const row = { amount: num(f.get('amount')), receipt_date: f.get('receipt_date'), method: f.get('method'), note: f.get('note').trim() }
    return r ? run(db.from('pa_commission_receipts').update(row).eq('id', r.id))
             : run(db.from('pa_commission_receipts').insert(row))
  })
}

// النسبة تنحسب تلقائياً لما يتغيّر المبلغ أو النسبة
document.addEventListener('input', (ev) => {
  if (!ev.target.hasAttribute('data-calc')) return
  const f = ev.target.form
  const amount = num(f.invoice_amount.value)
  if (amount) f.commission.value = commissionOf(amount, f.rate.value).toFixed(2)
})

// ---------- الإدخال الجماعي (للحسابات القديمة المبعثرة) ----------

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩', FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const latinDigits = (v) => String(v ?? '').replace(/[٠-٩۰-۹]/g, (d) => String(AR_DIGITS.indexOf(d) >= 0 ? AR_DIGITS.indexOf(d) : FA_DIGITS.indexOf(d)))
  .replace(/٫/g, '.').replace(/٬/g, ',')

/** تاريخ من خلية: 2025-01-15 أو 15/1/2025 أو 15-1-25 (اليوم أولاً) أو كائن Date من Excel */
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

/** سطر → خلايا: بالتاب (لصق من Excel) وإلا بـ| أو ; أو فاصلة متبوعة بمسافة */
function splitLine(line) {
  if (line.includes('\t')) return line.split('\t')
  if (/[|;]/.test(line)) return line.split(/[|;]/)
  return line.split(/\s{2,}|,\s+|\s+-\s+/)
}

/**
 * يحوّل الخلايا إلى قيد. في الفواتير: التاريخ + رقم الحاوية + المبلغ،
 * ومبلغان إن وُجدا = (مبلغ الفاتورة، النسبة). في الاستلامات: التاريخ + المبلغ.
 */
function parseCells(cells, kind, rate) {
  cells = cells.map((c) => (c instanceof Date ? c : String(c ?? '').trim())).filter((c) => c !== '')
  let date = null, cont = '', amounts = [], rest = []
  for (const c of cells) {
    const d = !date && parseDate(c)
    if (d) { date = d; continue }
    const a = parseAmount(c)
    if (a !== null && a > 0) { amounts.push(a); continue }
    if (!cont && kind === 'inv' && CONT_RE.test(String(c))) { cont = String(c).replace(/\s/g, '').toUpperCase(); continue }
    rest.push(String(c))
  }
  if (!date || !amounts.length) return { error: !date ? 'ما لقيت تاريخ' : 'ما لقيت مبلغ' }
  if (kind === 'rec') {
    const mi = rest.findIndex((x) => /^(تحويل|كاش|نقد[اًا]?|شيك)$/.test(x.trim()))
    const method = mi < 0 ? '' : rest.splice(mi, 1)[0].trim().replace(/^نقد.*/, 'كاش')
    return { receipt_date: date, amount: amounts[0], method, note: rest.join(' — ') }
  }
  if (!cont && rest.length) cont = rest.shift()
  const [amount, explicit] = amounts.length > 1 ? [Math.max(...amounts), Math.min(...amounts)] : [amounts[0], null]
  return {
    invoice_date: date, container_no: cont.toUpperCase(), invoice_no: '',
    invoice_amount: amount, rate, commission: explicit ?? commissionOf(amount, rate), note: rest.join(' — '),
  }
}

function bulkDialog() {
  const preview = () => {
    const f = $('#dlgForm'), kind = f.kind.value, rate = num(f.rate.value) || DEFAULT_RATE
    const lines = (state.bulkRows || f.text.value.split(/\r?\n/).map(splitLine))
      .filter((c) => c.some((x) => String(x ?? '').trim()))
    const parsed = lines.map((c) => ({ cells: c, ...parseCells(c, kind, rate) }))
    state.bulkParsed = parsed
    const ok = parsed.filter((p) => !p.error)
    const total = ok.reduce((s, p) => s + num(kind === 'inv' ? p.commission : p.amount), 0)
    $('#bulkPreview').innerHTML = !parsed.length ? '' : `
      <p class="small"><b>${ok.length}</b> سطر جاهز${parsed.length - ok.length ? ` — <span class="out">${parsed.length - ok.length} ما انقرأ</span>` : ''} — المجموع <b>${money(total)}</b></p>
      <div class="tablewrap" style="max-height:220px;overflow:auto"><table class="small">
        ${parsed.map((p) => p.error
          ? `<tr><td colspan="3" class="out">${esc(p.cells.map((c) => (c instanceof Date ? parseDate(c) : c)).join(' | '))} ← ${p.error}</td></tr>`
          : kind === 'inv'
            ? `<tr><td>${dt(p.invoice_date)}</td><td>${esc(p.container_no) || '—'}</td><td class="num">${p.invoice_amount !== p.commission ? money(p.invoice_amount) + ' ← ' : ''}<b>${money(p.commission)}</b></td></tr>`
            : `<tr><td>${dt(p.receipt_date)}</td><td>${esc(p.note) || '—'}</td><td class="num"><b>${money(p.amount)}</b></td></tr>`).join('')}
      </table></div>`
  }
  state.bulkRows = null
  openDialog(`<h2>إدخال جماعي</h2>
    <div class="field seg">
      <label><input type="radio" name="kind" value="inv" checked><span>فواتير حاويات</span></label>
      <label><input type="radio" name="kind" value="rec"><span>استلامات</span></label>
    </div>
    <div class="field"><label>الصق الأسطر (من Excel أو الواتساب) — سطر لكل قيد</label>
      <textarea name="text" rows="6" dir="auto" placeholder="15/01/2025    MSCU1234567    48000&#10;20/01/2025    TGHU7654321    52,500&#10;&#10;أو للاستلامات:&#10;01/02/2025    2000    تحويل"></textarea></div>
    <div class="grid2">
      <div class="field"><label>أو ارفع ملف Excel</label><input type="file" name="file" accept=".xlsx,.xls,.csv"></div>
      <div class="field"><label>النسبة % (للفواتير)</label><input name="rate" type="number" step="0.001" value="${DEFAULT_RATE}"></div>
    </div>
    <p class="muted small" style="margin:0 0 8px">أفهم التاريخ والمبلغ ورقم الحاوية بأي ترتيب. إذا في السطر مبلغين (الفاتورة ونسبتك) آخذ الصغير كنسبة.</p>
    <div id="bulkPreview"></div>
    <div class="row between"><span></span>
      <div class="row"><button class="btn" value="cancel" formnovalidate>إلغاء</button><button class="btn primary" value="save">احفظ الكل</button></div>
    </div>`, async (f) => {
    preview()
    const kind = f.get('kind'), ok = state.bulkParsed.filter((p) => !p.error)
    if (!ok.length) { alert('ما فيه أسطر صالحة للحفظ.'); return false }
    const rows = ok.map(({ cells, error, ...r }) => r)
    if (kind === 'inv') {
      const known = new Set(state.invoices.map((x) => normCont(x.container_no)).filter(Boolean))
      const rep = rows.filter((r) => r.container_no && known.has(normCont(r.container_no))).length
      if (rep && !confirm(`${rep} حاوية منها مسجّلة من قبل. تحفظها كلها مع ذلك؟ (اختر «إلغاء» وأحذفها من النص لو تبي تتجاهلها)`)) return false
    }
    if (!confirm(`حفظ ${rows.length} ${kind === 'inv' ? 'فاتورة' : 'استلام'}؟`)) return false
    state.contTab = kind === 'inv' ? 'invoices' : 'receipts'
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
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' })
    state.bulkRows = rows
    f.text.value = ''
    preview()
  })
}

// ---------- التصدير ----------
function contRows(s) {
  return s.lines.map((m) => [m.date, describe(m), m.due || '', m.paid || '', m.run])
}

function contXlsx() {
  const s = contStatement()
  const wb = XLSX.utils.book_new()
  wb.Workbook = { Views: [{ RTL: true }, { RTL: true }, { RTL: true }] }

  const st = [['كشف حساب نسبة الحاويات'], [periodLabel()], [],
    ['نسبتي المستحقة', s.due], ['استلمت', s.paid], ['الباقي لي', s.closing], [],
    ['التاريخ', 'البيان', 'لي (نسبة)', 'استلمت', 'الباقي']]
  if (state.from) st.push(['', 'رصيد سابق', '', '', s.opening])
  st.push(...contRows(s), ['', 'المجموع', s.due, s.paid, s.closing])
  const ws1 = XLSX.utils.aoa_to_sheet(st)
  ws1['!cols'] = [{ wch: 12 }, { wch: 44 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'كشف الحساب')

  const inv = state.invoices.filter((i) => dateIn(i.invoice_date)).sort((a, b) => a.invoice_date.localeCompare(b.invoice_date))
  const ws2 = XLSX.utils.aoa_to_sheet([['التاريخ', 'رقم الحاوية', 'رقم الفاتورة', 'مبلغ الفاتورة', 'النسبة %', 'نسبتي', 'ملاحظة'],
    ...inv.map((i) => [i.invoice_date, i.container_no, i.invoice_no, num(i.invoice_amount) || '', num(i.rate), num(i.commission), i.note]),
    ['', 'المجموع', inv.length + ' فاتورة', s.invTotal, '', s.due, '']])
  ws2['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 9 }, { wch: 12 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'الفواتير')

  const rec = state.receipts.filter((r) => dateIn(r.receipt_date)).sort((a, b) => a.receipt_date.localeCompare(b.receipt_date))
  const ws3 = XLSX.utils.aoa_to_sheet([['التاريخ', 'المبلغ', 'الطريقة', 'ملاحظة'],
    ...rec.map((r) => [r.receipt_date, num(r.amount), r.method, r.note]), ['المجموع', s.paid, '', '']])
  ws3['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 36 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'الاستلامات')

  XLSX.writeFile(wb, `نسبة الحاويات ${today()}.xlsx`)
}

function contPdf() {
  const s = contStatement()
  const rows = s.lines.map((m) => `<tr><td>${dt(m.date)}</td><td>${esc(describe(m))}</td>
    <td class="in">${m.due ? money(m.due) : ''}</td><td class="out">${m.paid ? money(m.paid) : ''}</td><td>${money(m.run)}</td></tr>`).join('')
  $('#print').innerHTML = `<h1>كشف حساب نسبة الحاويات</h1>
    <div class="meta">${esc(periodLabel())} — طُبع ${dt(today())} — المبالغ بـ${CURRENCY}</div>
    <section><table><tbody>
      <tr><td>عدد الفواتير</td><td>${s.count}</td><td>إجمالي الفواتير</td><td>${money(s.invTotal)}</td></tr>
      <tr><td>نسبتي المستحقة</td><td class="in">${money(s.due)}</td><td>استلمت</td><td class="out">${money(s.paid)}</td></tr>
      <tr><td><b>الباقي لي</b></td><td colspan="3"><b>${money(s.closing)}</b></td></tr>
    </tbody></table></section>
    <section><table><thead><tr><th>التاريخ</th><th>البيان</th><th>لي (نسبة)</th><th>استلمت</th><th>الباقي</th></tr></thead><tbody>
      ${state.from ? `<tr><td></td><td>رصيد سابق</td><td></td><td></td><td>${money(s.opening)}</td></tr>` : ''}
      ${rows || '<tr><td colspan="5">لا حركات</td></tr>'}</tbody>
      <tfoot><tr><td></td><td>المجموع</td><td>${money(s.due)}</td><td>${money(s.paid)}</td><td>${money(s.closing)}</td></tr></tfoot></table></section>`
  const title = document.title
  document.title = 'نسبة الحاويات ' + today()
  window.print()
  document.title = title
}

// ---------- النقرات ----------
function contClick(t) {
  const act = t.dataset.act
  switch (act) {
    case 'cont': state.view = 'cont'; render(); return true
    case 'ctab': state.contTab = t.dataset.tab; render(); return true
    case 'newInv': invoiceDialog(null); return true
    case 'newRec': receiptDialog(null); return true
    case 'editInv': invoiceDialog(state.invoices.find((i) => i.id === t.dataset.id)); return true
    case 'editRec': receiptDialog(state.receipts.find((r) => r.id === t.dataset.id)); return true
    case 'bulk': bulkDialog(); return true
  }
  return false
}
