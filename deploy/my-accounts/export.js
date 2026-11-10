// ============================================================
// export.js — تنسيق التصدير المشترك لكل أقسام «حساباتي»
//
// • Excel منسّق: عنوان، رؤوس ملوّنة، حدود لكل خلية، أعمدة بعرض
//   مناسب، أرقام بفواصل، صفوف متناوبة، صفوف سنوات ومجاميع مميّزة.
//   يعتمد xlsx-js-style (نسخة من SheetJS تدعم التنسيق).
// • PDF بنفس شكل تقارير مستودع باروو: شريط أزرق تحت العنوان،
//   مربعات أرقام، رأس جدول أزرق، وصفوف متناوبة.
//
// الصف إما مصفوفة خلايا عادية، أو كائن { kind, cells }:
//   kind = 'group' سطر عنوان (سنة)، 'sub' مجموع جزئي، 'total' المجموع.
// ============================================================

const XL = {
  blue: '1E40AF', blueSoft: 'DBEAFE', zebra: 'F1F5F9', border: '94A3B8',
  green: '15803D', red: 'B91C1C', font: 'Arial',
}

const rowKind = (r) => (Array.isArray(r) ? 'data' : r.kind)
const rowCells = (r) => (Array.isArray(r) ? r : r.cells)

/**
 * ورقة Excel منسّقة.
 * @param {object} o
 * @param {string} o.title       عنوان كبير أعلى الورقة
 * @param {string} [o.subtitle]  سطر تحته (الفترة، تاريخ الطباعة)
 * @param {Array<[string, number|string]>} [o.stats] مربعات ملخص فوق الجدول
 * @param {string[]} o.headers
 * @param {Array} o.rows
 * @param {number[]} o.widths    عرض كل عمود بالأحرف
 * @param {number[]} [o.money]   أعمدة المبالغ (فواصل وخانتان عشريتان)
 * @param {Object<number,string>} [o.colors] لون نص عمود: 'green' | 'red'
 */
function xlSheet(o) {
  const n = o.headers.length
  const aoa = [], styles = [], merges = []
  const border = { style: 'thin', color: { rgb: XL.border } }
  const borders = { top: border, bottom: border, left: border, right: border }
  const base = (extra = {}) => ({
    font: { name: XL.font, sz: 12, ...(extra.font || {}) },
    alignment: { horizontal: 'right', vertical: 'center', wrapText: true, readingOrder: 2, ...(extra.alignment || {}) },
    border: borders, ...(extra.fill ? { fill: extra.fill } : {}), ...(extra.numFmt ? { numFmt: extra.numFmt } : {}),
  })
  const push = (cells, style, merge) => {
    const r = aoa.length
    aoa.push(cells)
    styles.push(style)
    if (merge) merges.push({ s: { r, c: 0 }, e: { r, c: n - 1 } })
    return r
  }

  push([o.title, ...Array(n - 1).fill('')], () => ({
    font: { name: XL.font, sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: XL.blue } },
    alignment: { horizontal: 'center', vertical: 'center', readingOrder: 2 },
  }), true)
  if (o.subtitle) push([o.subtitle, ...Array(n - 1).fill('')], () => ({
    font: { name: XL.font, sz: 11, color: { rgb: '475569' } },
    alignment: { horizontal: 'center', readingOrder: 2 },
  }), true)

  if (o.stats?.length) {
    push(Array(n).fill(''), () => ({}))
    for (const [label, value] of o.stats) {
      const row = Array(n).fill('')
      row[0] = label; row[1] = value
      push(row, (c) => c > 1 ? {} : base({
        font: { bold: c === 1, sz: 13 },
        fill: { fgColor: { rgb: c === 0 ? XL.blueSoft : 'FFFFFF' } },
        numFmt: typeof value === 'number' ? '#,##0.00' : undefined,
        alignment: { horizontal: c === 1 ? 'center' : 'right' },
      }))
    }
  }
  push(Array(n).fill(''), () => ({}))

  const headerRow = push(o.headers, () => base({
    font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: XL.blue } },
    alignment: { horizontal: 'center' },
  }))

  let zebra = false
  for (const r of o.rows) {
    const kind = rowKind(r), cells = rowCells(r)
    if (kind === 'group') {
      push([cells[0], ...Array(n - 1).fill('')], () => base({
        font: { bold: true, sz: 13, color: { rgb: XL.blue } },
        fill: { fgColor: { rgb: XL.blueSoft } },
      }), true)
      zebra = false
      continue
    }
    const fill = kind === 'total' ? XL.blue : kind === 'sub' ? XL.blueSoft : zebra ? XL.zebra : 'FFFFFF'
    if (kind === 'data') zebra = !zebra
    push(cells, (c) => {
      const isMoney = o.money?.includes(c) && typeof cells[c] === 'number'
      const color = kind === 'total' ? 'FFFFFF' : o.colors?.[c] === 'green' ? XL.green : o.colors?.[c] === 'red' ? XL.red : '1E293B'
      return base({
        font: { bold: kind !== 'data', color: { rgb: color }, sz: kind === 'total' ? 13 : 12 },
        fill: { fgColor: { rgb: fill } },
        numFmt: isMoney ? '#,##0.00' : undefined,
        alignment: { horizontal: isMoney || typeof cells[c] === 'number' ? 'center' : 'right' },
      })
    })
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  aoa.forEach((row, r) => row.forEach((_, c) => {
    const ref = XLSX.utils.encode_cell({ r, c })
    if (!ws[ref]) ws[ref] = { t: 's', v: '' }
    ws[ref].s = styles[r](c)
  }))
  ws['!merges'] = merges
  ws['!cols'] = o.widths.map((w) => ({ wch: w }))
  ws['!rows'] = aoa.map((_, r) => ({ hpt: r === 0 ? 30 : r === headerRow ? 24 : 20 }))
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow, c: n - 1 } }) }
  return ws
}

/** كتاب Excel من أوراق [اسم، ورقة] — من اليمين لليسار */
function xlBook(sheets, filename) {
  const wb = XLSX.utils.book_new()
  wb.Workbook = { Views: [{ RTL: true }] }
  const used = new Set()
  for (const [name, ws] of sheets) {
    // اسم الورقة: 31 حرفاً كحد أقصى، بلا رموز ممنوعة، ولا تكرار
    let clean = String(name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || 'ورقة', nm = clean, i = 2
    while (used.has(nm)) nm = `${clean} ${i++}`
    used.add(nm)
    XLSX.utils.book_append_sheet(wb, ws, nm)
  }
  XLSX.writeFile(wb, filename)
}

// ---------- PDF بشكل تقارير باروو ----------

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} o.meta
 * @param {Array<[string, string, string?]>} o.stats [العنوان، القيمة، لون g|r]
 * @param {Array<{title?: string, headers: string[], rows: Array, money?: number[], colors?: object}>} o.sections
 */
function printDoc(o) {
  const cellCls = (s, c, v) => [s.money?.includes(c) || typeof v === 'number' ? 'n' : '', s.colors?.[c] === 'green' ? 'g' : s.colors?.[c] === 'red' ? 'r' : ''].join(' ').trim()
  const fmt = (s, c, v) => (s.money?.includes(c) && typeof v === 'number' ? money(v) : v === '' || v == null ? '' : esc(v))
  const sections = o.sections.map((s) => {
    const n = s.headers.length
    const body = s.rows.map((r) => {
      const kind = rowKind(r), cells = rowCells(r)
      if (kind === 'group') return `<tr class="grp"><td colspan="${n}">${esc(cells[0])}</td></tr>`
      return `<tr class="${kind}">${cells.map((v, c) => `<td class="${cellCls(s, c, v)}">${s.dates?.includes(c) && v ? dt(v) : fmt(s, c, v)}</td>`).join('')}</tr>`
    }).join('')
    return `<section>${s.title ? `<h2>${esc(s.title)}</h2>` : ''}
      <table><thead><tr>${s.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td colspan="${n}">لا توجد حركات</td></tr>`}</tbody></table></section>`
  }).join('')
  $('#print').innerHTML = `
    <div class="p-head"><h1>${esc(o.title)}</h1><div class="meta">📅 ${dt(today())}${o.meta ? ` · ${esc(o.meta)}` : ''} · المبالغ بـ${CURRENCY}</div></div>
    ${o.stats?.length ? `<div class="p-stats">${o.stats.map(([l, v, cls]) => `<div class="p-stat"><div class="v ${cls || ''}">${esc(v)}</div><div class="l">${esc(l)}</div></div>`).join('')}</div>` : ''}
    ${sections}`
  const title = document.title
  document.title = o.title + ' ' + today()
  window.print()
  document.title = title
}
