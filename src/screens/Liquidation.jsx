// ============================================================
// Liquidation.jsx — قائمة التصفية بالصور
// أصناف لا تخدم الموسم القادم: تُصفّى لتحرير رأس المال
// ============================================================

import { useState, useMemo, useEffect } from "react";
import DATA from "../data/liquidation.json";

const PRICES_KEY = "baro_liq_prices_v1";
const DONE_KEY   = "baro_liq_done_v1";

const fmtN = n => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtM = n => fmtN(Math.round(n)) + " ر";

function loadLS(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? "{}"); } catch { return {}; }
}
function saveLS(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ممتلئ أو محظور */ }
}

// ─── بطاقة صنف ───────────────────────────────────────────────

function Card({ it, img, price, done, onPrice, onDone, onOpen }) {
  const cost  = it.cost * it.qty;
  const value = price * it.qty;
  const gain  = value - cost;
  const never = it.sold === 0;

  return (
    <div className={`rounded-2xl border p-3 ${done ? "bg-slate-900/40 border-slate-800 opacity-50"
                                                   : "bg-slate-800 border-slate-700"}`}>
      <div className="flex gap-3">
        {img
          ? <img src={img} alt="" onClick={() => onOpen(img)}
                 className="w-24 h-24 rounded-xl object-cover shrink-0 cursor-zoom-in" />
          : <div className="w-24 h-24 rounded-xl bg-slate-700 flex items-center justify-center text-3xl shrink-0">📦</div>}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold text-slate-100 truncate">{it.name || "—"}</div>
              <div className="text-xs text-slate-500 font-mono" dir="ltr">{it.bc}</div>
            </div>
            <button onClick={() => onDone(it.bc)}
              className={`shrink-0 text-xs px-2.5 py-1 rounded-lg border ${
                done ? "bg-emerald-900/40 border-emerald-700 text-emerald-300"
                     : "bg-slate-700 border-slate-600 text-slate-300"}`}>
              {done ? "✓ تم" : "تم"}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-700/60 text-slate-300">
              مصنع {it.fac}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-700/60 text-slate-400">
              {it.ct}
            </span>
            <span className={`text-[11px] px-2 py-0.5 rounded-md ${
              never ? "bg-rose-900/40 text-rose-300" : "bg-amber-900/30 text-amber-300"}`}>
              {it.reason}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 mt-3">
        <Box label="متبقي"      value={fmtN(it.qty)}   tone="text-slate-100" />
        <Box label="التكلفة"    value={fmtN(it.cost)}  tone="text-slate-400" />
        <Box label="سعر البيع"  value={fmtN(it.sell)}  tone="text-slate-400" />
        <Box label="نبيع"      value={fmtN(price)}    tone="text-blue-400" />
      </div>

      <div className="flex items-center gap-2 mt-2.5">
        <input
          type="number" min="0" step="1" value={price}
          onChange={e => onPrice(it.bc, Math.max(0, Number(e.target.value) || 0))}
          className="w-24 bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5
                     text-center text-blue-300 font-bold"
          dir="ltr" />
        <div className="text-xs text-slate-500">× {fmtN(it.qty)} =</div>
        <div className="font-black text-slate-100">{fmtM(value)}</div>
        <div className={`mr-auto text-xs font-bold ${gain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          <span dir="ltr">{gain >= 0 ? "+" : "−"}{fmtN(Math.abs(gain))}</span> عن التكلفة
        </div>
      </div>
    </div>
  );
}

const Box = ({ label, value, tone }) => (
  <div className="bg-slate-900/60 rounded-xl py-1.5 text-center">
    <div className={`text-base font-black ${tone}`}>{value}</div>
    <div className="text-[10px] text-slate-500">{label}</div>
  </div>
);

// ─── الطباعة ─────────────────────────────────────────────────

function printList(items, prices, images, meta) {
  const rows = items.map(it => {
    const p   = prices[it.bc] ?? it.sug;
    const img = images[it.bc];
    return `<tr>
      <td class="im">${img ? `<img src="${img}">` : '<div class="ph">📦</div>'}</td>
      <td class="nm"><b>${(it.name || "—").replace(/</g, "&lt;")}</b>
          <div class="bc" dir="ltr">${it.bc}</div>
          <div class="sm">مصنع ${it.fac} · ${it.ct}</div></td>
      <td class="rs">${it.reason}</td>
      <td class="n">${fmtN(it.qty)}</td>
      <td class="n">${fmtN(it.sell)}</td>
      <td class="n big">${fmtN(p)}</td>
      <td class="n">${fmtN(p * it.qty)}</td>
      <td class="chk"></td>
    </tr>`;
  }).join("");

  const total = items.reduce((s, it) => s + (prices[it.bc] ?? it.sug) * it.qty, 0);
  const qty   = items.reduce((s, it) => s + it.qty, 0);

  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>قائمة التصفية</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Cairo',sans-serif;color:#111;padding:14px}
h1{font-size:19px;margin-bottom:2px}
.sub{font-size:12px;color:#555;margin-bottom:10px}
.kpis{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.k{border:1px solid #ccc;border-radius:8px;padding:6px 12px;min-width:110px}
.k b{display:block;font-size:17px}
.k span{font-size:11px;color:#666}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#1f4e79;color:#fff;padding:6px 4px;font-size:11px}
td{border:1px solid #ddd;padding:4px;vertical-align:middle}
tr:nth-child(even) td{background:#f6f9fc}
.im{width:62px;text-align:center}
.im img{width:54px;height:54px;object-fit:cover;border-radius:6px;display:block}
.ph{width:54px;height:54px;border:1px dashed #bbb;border-radius:6px;display:flex;
    align-items:center;justify-content:center;font-size:20px}
.nm{max-width:210px}
.bc{font-family:monospace;font-size:10px;color:#777;direction:ltr}
.sm{font-size:10px;color:#888}
.rs{font-size:10px;color:#a33;width:92px;text-align:center}
.n{text-align:center;white-space:nowrap}
.big{font-size:15px;font-weight:900;color:#1f4e79}
.chk{width:30px}
.chk:after{content:"";display:block;width:16px;height:16px;border:1.5px solid #666;
           border-radius:3px;margin:auto}
tfoot td{background:#fff2cc;font-weight:900;font-size:13px}
@media print{body{padding:0}tr{page-break-inside:avoid}thead{display:table-header-group}}
</style></head><body>
<h1>🏷️ قائمة التصفية</h1>
<div class="sub">أصناف لا تخدم الموسم القادم — تُصفّى لتحرير رأس المال · ${new Date().toLocaleDateString("ar-SA")}</div>
<div class="kpis">
  <div class="k"><b>${fmtN(items.length)}</b><span>صنف</span></div>
  <div class="k"><b>${fmtN(qty)}</b><span>قطعة</span></div>
  <div class="k"><b>${fmtM(meta.cost)}</b><span>التكلفة</span></div>
  <div class="k"><b>${fmtM(total)}</b><span>المتوقع تحصيله</span></div>
</div>
<table><thead><tr>
  <th>الصورة</th><th>الصنف</th><th>السبب</th><th>الكمية</th>
  <th>السعر الأصلي</th><th>سعر التصفية</th><th>الإجمالي</th><th>✓</th>
</tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td colspan="3">الإجمالي</td><td class="n">${fmtN(qty)}</td>
<td></td><td></td><td class="n">${fmtM(total)}</td><td></td></tr></tfoot></table>
<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("المتصفح منع النافذة — اسمح بالنوافذ المنبثقة"); return; }
  w.document.write(html);
  w.document.close();
}

// ─── الشاشة ──────────────────────────────────────────────────

export default function LiquidationScreen({ images = {} }) {
  const [q,      setQ]      = useState("");
  const [filter, setFilter] = useState("all");   // all | never | stopped | todo
  const [sort,   setSort]   = useState("value"); // value | qty | price
  const [prices, setPrices] = useState(() => loadLS(PRICES_KEY));
  const [done,   setDone]   = useState(() => loadLS(DONE_KEY));
  const [zoom,   setZoom]   = useState(null);
  const [limit,  setLimit]  = useState(40);

  useEffect(() => saveLS(PRICES_KEY, prices), [prices]);
  useEffect(() => saveLS(DONE_KEY,   done),   [done]);
  useEffect(() => setLimit(40), [q, filter, sort]);

  const items = DATA.items;
  const priceOf = bc => prices[bc] ?? items.find(i => i.bc === bc)?.sug ?? 0;

  const setPrice = (bc, v) => setPrices(p => ({ ...p, [bc]: v }));
  const toggle   = bc => setDone(d => { const n = { ...d }; n[bc] ? delete n[bc] : n[bc] = 1; return n; });

  const view = useMemo(() => {
    const s = q.trim().toLowerCase();
    let L = items.filter(it => {
      if (filter === "never"   && it.sold !== 0) return false;
      if (filter === "stopped" && it.sold === 0) return false;
      if (filter === "todo"    && done[it.bc])   return false;
      if (!s) return true;
      return it.bc.toLowerCase().includes(s)
          || (it.name || "").toLowerCase().includes(s)
          || it.fac.includes(s);
    });
    const p = it => prices[it.bc] ?? it.sug;
    L = [...L];
    if (sort === "value")      L.sort((a, b) => p(b) * b.qty - p(a) * a.qty);
    else if (sort === "qty")   L.sort((a, b) => b.qty - a.qty);
    else                       L.sort((a, b) => p(a) - p(b));
    return L;
  }, [items, q, filter, sort, prices, done]);

  const totals = useMemo(() => {
    const t = { n: view.length, qty: 0, cost: 0, exp: 0, doneN: 0 };
    for (const it of view) {
      t.qty  += it.qty;
      t.cost += it.cost * it.qty;
      t.exp  += (prices[it.bc] ?? it.sug) * it.qty;
      if (done[it.bc]) t.doneN++;
    }
    return t;
  }, [view, prices, done]);

  return (
    <div className="pb-28 pt-2 px-3 max-w-[440px] mx-auto">

      <div className="mb-3">
        <h1 className="text-xl font-black text-slate-100">🏷️ قائمة التصفية</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          أصناف لا تخدم الموسم القادم — بيعها يحرّر رأس المال
        </p>
      </div>

      <div className="grid grid-cols-4 gap-1.5 mb-3">
        <Kpi v={fmtN(totals.n)}            l="صنف"     c="text-slate-100" />
        <Kpi v={fmtN(totals.qty)}          l="قطعة"    c="text-amber-400" />
        <Kpi v={fmtN(totals.cost / 1000)}  l="ألف تكلفة" c="text-slate-400" />
        <Kpi v={fmtN(totals.exp / 1000)}   l="ألف متوقع" c="text-emerald-400" />
      </div>

      {totals.cost > 0 && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-2.5 mb-3 text-center">
          <span className="text-xs text-slate-400">الاسترداد من التكلفة </span>
          <span className={`font-black ${totals.exp >= totals.cost ? "text-emerald-400" : "text-amber-400"}`}>
            {Math.round(totals.exp / totals.cost * 100)}%
          </span>
          <span className="text-xs text-slate-500"> · منفَّذ {totals.doneN} من {totals.n}</span>
        </div>
      )}

      <input value={q} onChange={e => setQ(e.target.value)}
        placeholder="بحث بالباركود أو الاسم أو المصنع…"
        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5
                   text-slate-100 placeholder-slate-500 mb-2" />

      <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
        {[["all","الكل"],["never","لم يبع"],["stopped","متوقف"],["todo","غير منفَّذ"]].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border ${
              filter === k ? "bg-blue-600 border-blue-500 text-white"
                           : "bg-slate-800 border-slate-700 text-slate-400"}`}>{l}</button>
        ))}
        <div className="shrink-0 w-px bg-slate-700 mx-1" />
        {[["value","الأعلى قيمة"],["qty","الأكثر كمية"],["price","الأرخص"]].map(([k,l]) => (
          <button key={k} onClick={() => setSort(k)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border ${
              sort === k ? "bg-slate-600 border-slate-500 text-white"
                         : "bg-slate-800 border-slate-700 text-slate-400"}`}>{l}</button>
        ))}
      </div>

      <button onClick={() => printList(view, prices, images, DATA.meta)}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold
                   rounded-xl py-2.5 mb-3">
        🖨️ طباعة القائمة بالصور ({fmtN(view.length)})
      </button>

      <div className="space-y-2.5">
        {view.slice(0, limit).map(it => (
          <Card key={it.bc} it={it} img={images[it.bc]} price={priceOf(it.bc)}
                done={!!done[it.bc]} onPrice={setPrice} onDone={toggle} onOpen={setZoom} />
        ))}
      </div>

      {view.length > limit && (
        <button onClick={() => setLimit(l => l + 40)}
          className="w-full mt-3 bg-slate-800 border border-slate-700 text-slate-300
                     rounded-xl py-2.5">
          عرض المزيد ({fmtN(view.length - limit)} متبقٍ)
        </button>
      )}

      {view.length === 0 && (
        <div className="text-center text-slate-500 py-10">لا نتائج</div>
      )}

      {zoom && (
        <div onClick={() => setZoom(null)}
          className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4">
          <img src={zoom} alt="" className="max-w-full max-h-full rounded-xl" />
        </div>
      )}
    </div>
  );
}

const Kpi = ({ v, l, c }) => (
  <div className="bg-slate-800 border border-slate-700 rounded-xl py-2 text-center">
    <div className={`text-lg font-black ${c}`}>{v}</div>
    <div className="text-[10px] text-slate-500">{l}</div>
  </div>
);
