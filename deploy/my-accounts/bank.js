// ============================================================
// bank.js — تحويلات كشف البنك: رفع الكشف، وتصنيف كل حوالة
//
// يُرفع ملف كشف الأهلي (xls) كما هو، فتُقرأ الحركات وتُحفظ مرة واحدة
// (رفع نفس الكشف مرتين لا يكرّر — dedup). ثم تُصنَّف كل حوالة:
//   كونتينر / مبيعات فروع  ← تُنشئ استلاماً في الدفتر المقابل، مربوطاً بها
//   استرداد مصاريف ← مصاريف دفعتها عن الشركة ورجعت لك (طيران، إعلان، فاتورة)
//   راتب / إيجار / أهل / أخرى ← للتنظيم فقط
// تغيير التصنيف ينقل الاستلام أو يحذفه، فالحوالة لا تُحسب مرتين أبداً.
//
// الجدول: pa_bank_txns، والربط: pa_commission_receipts.bank_txn_id
// (migration 0012).
// ============================================================

const CATS = {
  containers: { label: 'كونتينر', ledger: 'containers', color: '#556b2f' },
  branches: { label: 'مبيعات فروع', ledger: 'branches', color: '#7c3aed' },
  reimburse: { label: 'استرداد مصاريف', color: '#0891b2' },
  salary: { label: 'راتب', color: '#0f766e' },
  rent: { label: 'إيجار', color: '#b45309' },
  family: { label: 'أهل وأصدقاء', color: '#be185d' },
  other: { label: 'أخرى', color: '#475569' },
}
const catLabel = (c) => (c === 'split' ? 'مقسّمة' : CATS[c]?.label || 'بدون تصنيف')

// ---------- قراءة كشف البنك ----------

/** صاحب الحوالة من الوصف: رقم الحساب المحوِّل، أو الجهة، أو اسم المرسل */
function bankAccount(type, desc) {
  if (/CITIZEN/.test(desc)) return 'حساب المواطن'
  if (/WELFARE/.test(desc)) return 'الضمان الاجتماعي'
  const acc = desc.match(/(?:^|\s)(\d{14})(?=\s|$)/)
  if (acc) return acc[1]
  const name = desc.match(/PaymentRef \w+ \w+ (.+)$/)
  if (name) return name[1].trim()
  return type
}

/** الملاحظة المفهومة من الوصف: سبب التحويل ونصّه الحر */
function bankNote(desc) {
  const parts = []
  const reason = desc.match(/^\w\w:(\S[^0-9]*?)\s*\d{10,}/)
  if (reason) parts.push(reason[1].trim())
  const tail = desc.split('CHNL:')[1]
  if (tail) {
    const free = tail.split(' ').slice(1).join(' ').replace(/^(Payment )?Systems\s*/, '').trim()
    if (free) parts.push(free)
  }
  return parts.join(' — ')
}

/** يقرأ ملف الكشف: يبحث عن سطر الرؤوس (تاريخ، الوصف، المبلغ) ثم الحركات */
function parseBankFile(rows) {
  const norm = (v) => String(v ?? '').trim()
  const hi = rows.findIndex((r) => r.some((c) => norm(c) === 'تاريخ') && r.some((c) => /الوصف/.test(norm(c))))
  if (hi < 0) throw new Error('ما لقيت جدول الحركات في الملف. تأكد إنه كشف حساب من البنك.')
  const h = rows[hi].map(norm)
  const col = (re) => h.findIndex((x) => re.test(x))
  const cDate = col(/^تاريخ$/), cType = col(/نوع العملية/), cDesc = col(/الوصف/), cAmt = col(/amount|المبلغ|مدين|دائن/i)
  if (cAmt < 0) throw new Error('ما لقيت عمود المبلغ في الملف.')
  const out = []
  for (const r of rows.slice(hi + 1)) {
    const date = parseDate(r[cDate])
    const amount = parseAmount(r[cAmt])
    if (!date || amount === null || !amount) continue
    const type = norm(r[cType]), desc = norm(r[cDesc]).replace(/\s+/g, ' ')
    out.push({
      txn_date: date, txn_type: type, description: desc, amount,
      account: bankAccount(type, desc), note: bankNote(desc),
      dedup: [date, amount.toFixed(2), type, desc].join('|'),
    })
  }
  return out
}

async function importBankFile(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true })
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' })
  let txns
  try { txns = parseBankFile(rows) } catch (e) { return alert(e.message) }
  const known = new Set(state.bank.map((t) => t.dedup))
  const fresh = txns.filter((t) => !known.has(t.dedup))
  if (!fresh.length) return alert(`قرأت ${txns.length} حركة — كلها مرفوعة من قبل، ما فيه جديد.`)
  if (!confirm(`قرأت ${txns.length} حركة، منها ${fresh.length} جديدة. أرفعها؟`)) return
  for (let i = 0; i < fresh.length; i += 200) {
    const { error } = await db.from('pa_bank_txns').upsert(fresh.slice(i, i + 200), { onConflict: 'user_id,dedup', ignoreDuplicates: true })
    if (error) return alert(/pa_bank_txns/.test(error.message)
      ? 'قاعدة البيانات تحتاج تحديث (ملف 0012). شغّله في Supabase ثم جرّب مرة ثانية.' : 'تعذّر الرفع: ' + error.message)
  }
  await load()
}

// ---------- التصنيف ----------

/**
 * أجزاء الحوالة: حوالة غير مقسّمة = جزء واحد بكامل المبلغ وتصنيفها،
 * والمقسّمة = أجزاؤها [{cat, amount, note}].
 */
function partsOf(t) {
  if (t.category === 'split') return (t.splits || []).map((p) => ({ cat: p.cat || '', amount: num(p.amount), note: p.note || '' }))
  return [{ cat: t.category || '', amount: num(t.amount), note: '' }]
}

/**
 * يجعل استلامات الدفاتر مطابقة لأجزاء الحوالات: لكل دفتر (كونتينر/فروع)
 * استلام واحد بمجموع أجزائه — يُنشأ أو يُعدَّل أو يُحذف.
 */
async function syncReceipts(txns) {
  const ops = [], toCreate = []
  for (const t of txns) {
    const want = {}
    for (const p of partsOf(t)) {
      const ledger = CATS[p.cat]?.ledger
      if (ledger && p.amount > 0) want[ledger] = (want[ledger] || 0) + p.amount
    }
    const have = state.receipts.filter((r) => r.bank_txn_id === t.id)
    for (const r of have) {
      if (!want[r.ledger]) ops.push(db.from('pa_commission_receipts').delete().eq('id', r.id))
      else if (Math.abs(num(r.amount) - want[r.ledger]) > 0.001) ops.push(db.from('pa_commission_receipts').update({ amount: want[r.ledger] }).eq('id', r.id))
    }
    for (const [ledger, amount] of Object.entries(want)) {
      if (!have.some((r) => r.ledger === ledger)) toCreate.push({ ledger, bank_txn_id: t.id, receipt_date: t.txn_date, amount, method: 'تحويل', note: ['من البنك', t.note].filter(Boolean).join(' — ') })
    }
  }
  if (toCreate.length) ops.push(db.from('pa_commission_receipts').insert(toCreate))
  const bad = (await Promise.all(ops)).find((r) => r.error)
  if (bad) alert('تعذّر تحديث الاستلامات: ' + bad.error.message)
}

/** يغيّر تصنيف حوالات كاملة (يلغي أي تقسيم سابق) */
async function setCategory(ids, cat) {
  const { error } = await db.from('pa_bank_txns').update({ category: cat, splits: [] }).in('id', ids)
  if (error) return alert('تعذّر الحفظ: ' + error.message)
  await syncReceipts(state.bank.filter((t) => ids.includes(t.id)).map((t) => ({ ...t, category: cat, splits: [] })))
  await load()
}

/** تقسيم حوالة على أكثر من تصنيف: مثلاً إيجار 10,000 + استرداد مصاريف 2,500 */
function splitDialog(t) {
  const parts = t.category === 'split' ? partsOf(t) : [{ cat: t.category || '', amount: num(t.amount), note: '' }, { cat: '', amount: '', note: '' }]
  const opts = (sel) => `<option value="">— اختر —</option>${Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${c.label}</option>`).join('')}`
  const row = (p) => `<div class="split-row">
      <select name="cat">${opts(p.cat)}</select>
      <input name="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="المبلغ" value="${p.amount === '' ? '' : num(p.amount)}">
      <input name="note" placeholder="ملاحظة (مثلاً: تذكرة طيران)" value="${esc(p.note)}">
    </div>`
  openDialog(`<h2>✂ تقسيم الحوالة</h2>
    <p class="small" style="margin:0 0 10px"><b>${money(t.amount)}</b> · ${dt(t.txn_date)} · ${esc(t.note || t.txn_type)}</p>
    <div id="splitRows">${parts.map(row).join('')}</div>
    <button class="btn" type="button" data-split-add style="width:100%;margin-bottom:10px">＋ جزء آخر</button>
    <p class="small" id="splitLeft"></p>
    <div class="row" style="justify-content:space-between">
      ${t.category === 'split' ? '<button class="btn danger" value="delete" formnovalidate>إلغاء التقسيم</button>' : '<span></span>'}
      <div class="row"><button class="btn" value="cancel" formnovalidate>إلغاء</button><button class="btn primary" value="save">حفظ</button></div>
    </div>`, async (f, action) => {
    if (action === 'delete') return setCategory([t.id], '')
    const cats = f.getAll('cat'), amounts = f.getAll('amount'), notes = f.getAll('note')
    const splits = cats.map((c, n) => ({ cat: c, amount: num(amounts[n]), note: notes[n].trim() })).filter((p) => p.amount > 0)
    const sum = splits.reduce((x, p) => x + p.amount, 0)
    if (splits.some((p) => !p.cat)) { alert('اختر تصنيف لكل جزء.'); return false }
    if (Math.abs(sum - num(t.amount)) > 0.009) { alert(`مجموع الأجزاء ${money(sum)} لازم يساوي مبلغ الحوالة ${money(t.amount)}.`); return false }
    // جزء واحد فقط = تصنيف عادي
    if (splits.length === 1) return setCategory([t.id], splits[0].cat)
    const { error } = await db.from('pa_bank_txns').update({ category: 'split', splits }).eq('id', t.id)
    if (error) { alert('تعذّر الحفظ: ' + error.message); return false }
    await syncReceipts([{ ...t, category: 'split', splits }])
    await load()
  })
  const box = $('#splitRows'), left = () => {
    const sum = [...box.querySelectorAll('[name=amount]')].reduce((x, i) => x + num(i.value), 0)
    const rest = num(t.amount) - sum
    $('#splitLeft').innerHTML = Math.abs(rest) < 0.009 ? '<span class="in">✓ المجموع مطابق</span>'
      : `<span class="warn">المتبقي ${money(rest)}</span>`
  }
  box.addEventListener('input', left)
  $('[data-split-add]').onclick = () => { box.insertAdjacentHTML('beforeend', row({ cat: '', amount: '', note: '' })); left() }
  left()
}

// ---------- العرض ----------

function bankFiltered() {
  const q = (state.bankQ || '').trim()
  return state.bank.filter((t) => dateIn(t.txn_date)
    && (!state.bankAcc || t.account === state.bankAcc)
    && (state.bankCat === undefined || state.bankCat === 'all' || partsOf(t).some((p) => p.cat === state.bankCat))
    && (!q || `${t.note} ${t.description} ${t.txn_type} ${money(t.amount)}`.includes(q)))
    .sort((a, b) => b.txn_date.localeCompare(a.txn_date) || num(b.amount) - num(a.amount))
}

function bankTile() {
  const un = state.bank.filter((t) => !t.category).length
  return `<button class="tile ledger span2" data-act="openBank" style="min-height:120px">
    <span class="name">🏦 تحويلات البنك</span>
    <span class="big">${state.bank.length ? `${state.bank.length} حوالة` : 'ارفع كشف البنك'}</span>
    <span class="foot">${state.bank.length ? (un ? `<span class="warn">${un} بدون تصنيف</span>` : 'كلها مصنّفة ✓') : 'وصنّف كل حوالة: كونتينر، راتب، إيجار…'}</span>
  </button>`
}

function bankView() {
  const list = bankFiltered()
  const total = list.reduce((s, t) => s + num(t.amount), 0)
  const accounts = [...state.bank.reduce((m, t) => m.set(t.account, (m.get(t.account) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1])
  const cat = state.bankCat ?? 'all'
  // مجاميع كل تصنيف للمعروض حالياً (قبل فلتر التصنيف)
  const base = state.bank.filter((t) => dateIn(t.txn_date) && (!state.bankAcc || t.account === state.bankAcc))
  const sums = {}
  for (const t of base) for (const p of partsOf(t)) { const k = p.cat; sums[k] = sums[k] || { n: 0, v: 0 }; sums[k].n++; sums[k].v += p.amount }
  const catTiles = [...Object.keys(CATS), ''].filter((k) => sums[k]).map((k) => `
    <button class="tile" data-act="bankCat" data-cat="${k}" style="min-height:96px;${cat === k ? 'border-color:var(--brand);border-width:2px' : ''}">
      <span class="lbl" style="color:${CATS[k]?.color || 'var(--warn)'};font-weight:800">${catLabel(k)}</span>
      <span class="big" style="font-size:24px">${money(sums[k].v)}</span>
      <span class="foot">${sums[k].n} حوالة</span></button>`).join('')

  const rows = list.map((t) => `<div class="item" style="flex-direction:column;gap:8px">
      <div style="display:flex;justify-content:space-between;gap:12px">
        <div><div class="t">${esc(t.note) || esc(t.txn_type)}</div>
          <div class="s">${dt(t.txn_date)} · ${esc(t.txn_type)}${t.account !== t.txn_type ? ' · ' + esc(t.account) : ''}</div></div>
        <div class="v"><b class="${t.amount < 0 ? 'out' : 'in'}">${money(t.amount)}</b></div>
      </div>
      <div class="chips">${Object.entries(CATS).map(([k, c]) => `<button class="chip ${t.category === k ? 'on' : ''}" style="--c:${c.color}" data-act="setCat" data-id="${t.id}" data-cat="${t.category === k ? '' : k}">${c.label}</button>`).join('')}
        <button class="chip ${t.category === 'split' ? 'on' : ''}" style="--c:#57534e" data-act="split" data-id="${t.id}">✂ تقسيم</button></div>
      ${t.category === 'split' ? `<div class="split-sum">${partsOf(t).map((p) => `<span style="color:${CATS[p.cat]?.color || 'inherit'}"><b>${catLabel(p.cat)}</b> ${money(p.amount)}${p.note ? ` (${esc(p.note)})` : ''}</span>`).join(' + ')}</div>` : ''}
    </div>`).join('')

  return `
    <div class="tiles">
      <button class="tile act primary" data-act="bankUpload"><span class="ic">⬆️</span>رفع كشف البنك</button>
      <button class="tile act" data-act="bankXlsx"><span class="ic">📊</span>Excel المعروض</button>
    </div>
    <input type="file" id="bankFile" accept=".xls,.xlsx,.csv" hidden>
    ${state.bank.length ? `
    <div class="card">
      <div class="grid2">
        <div><label>الحساب / الجهة</label><select data-bank="acc">
          <option value="">كل الحسابات (${state.bank.length})</option>
          ${accounts.map(([a, n]) => `<option value="${esc(a)}" ${state.bankAcc === a ? 'selected' : ''}>${esc(a)} (${n})</option>`).join('')}
        </select></div>
        <div><label>بحث في الملاحظة</label><input data-bank="q" value="${esc(state.bankQ || '')}" placeholder="مثلاً: ايجار، نسبة، مكافآت"></div>
      </div>
    </div>
    ${periodBar()}
    <div class="tiles three">${catTiles}</div>
    <div class="row" style="justify-content:space-between;margin:0 4px 10px">
      <span class="small"><b>${list.length}</b> حوالة · <b>${money(total)}</b>${cat !== 'all' ? ` · <button class="btn ghost small" data-act="bankCat" data-cat="all">عرض الكل</button>` : ''}</span>
      ${list.length ? '<button class="btn small" data-act="bulkCat">صنّف المعروض كله…</button>' : ''}
    </div>
    <p class="note">اضغط التصنيف تحت كل حوالة، واضغطه مرة ثانية للإلغاء. إذا الحوالة فيها أكثر من شي (مثلاً إيجار + استرداد مصاريف) اضغط «✂ تقسيم». «كونتينر» و«مبيعات فروع» تنضاف تلقائياً كاستلام في دفترها.</p>
    <div class="list">${rows || '<div class="empty">ما فيه حوالات بهذا الفلتر.</div>'}</div>`
    : '<div class="card empty">ارفع ملف كشف الحساب من تطبيق البنك (xls) كما هو، وأنا أقرأ الحوالات.</div>'}`
}

function bulkCatDialog() {
  const list = bankFiltered()
  openDialog(`<h2>تصنيف ${list.length} حوالة</h2>
    <p class="muted small">كل الحوالات المعروضة الآن (حسب الفلتر) بتاخذ نفس التصنيف.</p>
    <div class="field"><select name="cat">${Object.entries(CATS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('')}<option value="">بدون تصنيف</option></select></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" value="cancel" formnovalidate>إلغاء</button><button class="btn primary" value="save">صنّف</button></div>`,
  async (f) => { await setCategory(list.map((t) => t.id), f.get('cat')) })
}

function bankXlsx() {
  const list = bankFiltered().slice().reverse()
  const label = (t) => (t.category === 'split' ? partsOf(t).map((p) => `${catLabel(p.cat)} ${money(p.amount)}`).join(' + ') : catLabel(t.category))
  const rows = list.map((t, n) => [n + 1, t.txn_date, num(t.amount), label(t), t.account, t.note || t.txn_type])
  rows.push({ kind: 'total', cells: ['', 'المجموع', list.reduce((s, t) => s + num(t.amount), 0), `${list.length} حوالة`, '', ''] })
  const parts = list.flatMap(partsOf)
  const byCat = [...Object.keys(CATS), ''].map((k) => { const l = parts.filter((p) => p.cat === k); return [catLabel(k), l.length, l.reduce((s, p) => s + p.amount, 0)] }).filter((r) => r[1])
  byCat.push({ kind: 'total', cells: ['المجموع', parts.length, parts.reduce((s, p) => s + p.amount, 0)] })
  const sub = `${state.bankAcc ? 'الحساب ' + state.bankAcc + ' — ' : ''}${periodLabel()} — طُبع ${today()}`
  xlBook([
    ['الحوالات', xlSheet({ title: 'تحويلات البنك', subtitle: sub, headers: ['#', 'التاريخ', 'المبلغ', 'التصنيف', 'الحساب / الجهة', 'الملاحظة'],
      rows, widths: [6, 13, 15, 30, 22, 46], money: [2], colors: { 2: 'green' } })],
    ['حسب التصنيف', xlSheet({ title: 'التحويلات حسب التصنيف', subtitle: sub, headers: ['التصنيف', 'العدد', 'المجموع'],
      rows: byCat, widths: [20, 10, 18], money: [2] })],
  ], `تحويلات البنك ${today()}.xlsx`)
}

// ---------- النقرات والمدخلات ----------
function bankClick(t) {
  switch (t.dataset.act) {
    case 'openBank': state.ledger = 'bank'; window.scrollTo(0, 0); render(); return true
    case 'bankUpload': $('#bankFile').click(); return true
    case 'bankXlsx': bankXlsx(); return true
    case 'bankCat': state.bankCat = state.bankCat === t.dataset.cat ? 'all' : t.dataset.cat; render(); return true
    case 'setCat': t.disabled = true; setCategory([t.dataset.id], t.dataset.cat); return true
    case 'bulkCat': bulkCatDialog(); return true
    case 'split': splitDialog(state.bank.find((x) => x.id === t.dataset.id)); return true
  }
  return false
}

document.addEventListener('change', (ev) => {
  if (ev.target.id === 'bankFile' && ev.target.files[0]) importBankFile(ev.target.files[0])
  if (ev.target.dataset.bank === 'acc') { state.bankAcc = ev.target.value; render() }
})
document.addEventListener('input', (ev) => {
  if (ev.target.dataset.bank !== 'q') return
  state.bankQ = ev.target.value
  const pos = ev.target.selectionStart
  render()
  const n = $('[data-bank=q]'); n.focus(); try { n.setSelectionRange(pos, pos) } catch {}
})
