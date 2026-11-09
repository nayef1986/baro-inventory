// ============================================================
// seasonPrint.js — طباعة تقرير الموسم مقسّمًا على الفئات
//
// ليش الفئة وحدة التقسيم: قياس بيانات موسم كامل (2,900 منتج)
// أظهر إن المبيعات مو مركّزة — 80% من الكمية تحتاج 1,584 منتج،
// فاختصار القائمة بالعدد يرمي معظم التجارة. بالمقابل 44 فئة فقط
// وأعلى 10 منها = ثلثا الموسم. فالفئة هي اللي تختصر بلا خسارة.
// ============================================================

import { fmtN, fmtM, fmtPct } from "./calc.js";

const esc = s => String(s ?? "").replace(/[&<>"]/g, c =>
  ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));

// مبلغ قد يكون سالبًا: RTL يقلب الإشارة لآخر الرقم، فنعزله باتجاه LTR
const money = v => {
  const n = Number(v) || 0;
  return n < 0 ? `<em class="neg">${fmtM(n)}</em>` : fmtM(n);
};

const todayStr = () => {
  try { return new Date().toLocaleDateString("ar-SA", { calendar:"gregory" }); }
  catch { return new Date().toISOString().slice(0,10); }
};

/** يختصر اسم الفترة: "14 مارس 2026" → "14 مارس" */
const shortLabel = s => String(s ?? "").replace(/\s*20\d{2}\s*$/, "").trim();

// ─── رسم الخط الزمني بالـ HTML ──────────────────────────────
function sparkline(tl, { height = 34, highlight = true } = {}) {
  if (!tl?.length) return "";
  const max = Math.max(...tl.map(p => p.qty), 1);
  const best = tl.reduce((m,p)=> p.qty > m.qty ? p : m, tl[0]);
  const bars = tl.map(p => {
    const h  = Math.max(2, (p.qty / max) * height);
    const on = highlight && p === best;
    return `<i style="height:${h.toFixed(1)}px;background:${on ? "#b8860b" : "#9aa7b8"}"></i>`;
  }).join("");
  return `<div class="spark" style="height:${height}px">${bars}</div>`;
}

// ─── صفحة الخلاصة ───────────────────────────────────────────
function summaryPage(A, settings, seasonName) {
  const brand = settings?.brandName ?? "";
  const totalSuggest = A.recs.reduce((s,r)=>s+r.totalSuggest, 0);
  const totalBring   = A.recs.reduce((s,r)=>s+r.bring.length, 0);
  const totalStop    = A.recs.reduce((s,r)=>s+r.stop.length, 0);

  const kpi = [
    ["مباع",   fmtN(A.grandQty)],
    ["إيراد",  fmtM(A.grandRev)],
    ["ربح",    money(A.grandProfit)],
    ["منتجات", fmtN(A.rows.length)],
    ["فئات",   fmtN(A.catReport.length)],
    ["فترات",  fmtN(A.periodCount)],
  ].map(([l,v])=>`<div class="k"><b>${v}</b><span>${l}</span></div>`).join("");

  const catRows = A.catReport.map((c,i)=>`<tr>
    <td class="n">${i+1}</td>
    <td class="hd">${esc(c.catName || c.cat)}</td>
    <td>${fmtN(c.items.length)}</td>
    <td class="big">${fmtN(c.qty)}</td>
    <td>${fmtPct(c.sharePct)}</td>
    <td>${money(c.profit)}</td>
    <td>${esc(shortLabel(c.peakLabel))}</td>
    <td class="buy">${fmtN(c.suggest)}</td>
  </tr>`).join("");

  return `<section class="page">
  <h1>${esc(seasonName || "تقرير الموسم")}</h1>
  <div class="sub">${brand ? esc(brand) + " · " : ""}${esc(A.firstLabel)} ← ${esc(A.lastLabel)}
    · ${A.years ? `وارد كونتينرات ${esc(A.years.join(" و"))}` : "وارد كل المشتريات"}
    · طُبع ${esc(todayStr())}</div>

  <div class="kpis">${kpi}</div>

  <h2>مسار الموسم</h2>
  ${sparkline(A.timeline, { height: 52 })}
  <div class="axis"><span>${esc(shortLabel(A.firstLabel))}</span><span>${esc(shortLabel(A.lastLabel))}</span></div>
  <p class="note">
    أقوى فترة <b>${esc(shortLabel(A.best?.label))}</b> بـ ${fmtN(A.best?.qty)} قطعة ·
    أضعف <b>${esc(shortLabel(A.worst?.label))}</b> بـ ${fmtN(A.worst?.qty)} ·
    المتوسط ${fmtN(Math.round(A.avg))} لكل فترة
  </p>

  <h2>القرار</h2>
  <p class="note">
    المقترح شراؤه للموسم الجاي <b class="buy">${fmtN(totalSuggest)}</b> قطعة
    عبر <b>${fmtN(totalBring)}</b> منتج${totalStop ? ` · ونقلل أو نوقف <b>${fmtN(totalStop)}</b>` : ""}
    ${A.totalLost > 0 ? ` · ضاع بالنفاد ~<b>${fmtN(A.totalLost)}</b> قطعة` : ""}
    ${A.deadCount > 0 ? ` · <b>${fmtN(A.deadCount)}</b> منتج ما تحرك` : ""}
  </p>

  <h2>الفئات — مرتبة بالأقوى</h2>
  <table>
    <thead><tr><th>#</th><th>الفئة</th><th>منتجات</th><th>مباع</th>
      <th>% الموسم</th><th>ربح</th><th>ذروتها</th><th>نجيب</th></tr></thead>
    <tbody>${catRows}</tbody>
  </table>
</section>`;
}

// ─── قسم فئة واحدة ──────────────────────────────────────────
function categorySection(c, A, images, opts) {
  const withImages = opts.images !== false;
  const maxRows    = opts.maxPerCat ?? 0;    // 0 = الكل

  const live = c.items.filter(x => x.qty > 0);
  const dead = c.items.filter(x => x.qty <= 0);
  const shown = maxRows > 0 ? live.slice(0, maxRows) : live;

  const imgCell = bc => withImages
    ? (images?.[bc]
        ? `<td class="im"><img src="${esc(images[bc])}"></td>`
        : `<td class="im"><div class="noim"></div></td>`)
    : "";

  const rows = shown.map((x,i)=>`<tr>
    <td class="n">${i+1}</td>
    ${imgCell(x.barcode)}
    <td class="bc">${esc(x.barcode)}</td>
    <td class="hd">${esc(x.name)}</td>
    <td>${esc(x.fac)}${x.facName ? `<br><s>${esc(x.facName)}</s>` : ""}</td>
    <td>${esc(x.cont || "—")}</td>
    <td class="big">${fmtN(x.qty)}</td>
    <td>${fmtPct(x.turnPct)}</td>
    <td>${esc(shortLabel(x.peakLabel))}<br><s>${fmtN(x.peakQty)} قطعة</s></td>
    <td>${fmtN(x.activeCount)}</td>
    <td class="tier">${esc(x.tier ?? "")}</td>
    <td class="buy">${fmtN(x.suggest ?? 0)}</td>
    <td>${fmtN(Math.round((x.suggest ?? 0)/12))}</td>
  </tr>`).join("");

  const deadBlock = dead.length ? `
    <h3>ما تحرك في هذي الفئة (${fmtN(dead.length)})</h3>
    <table class="tight">
      <thead><tr><th>#</th><th>الباركود</th><th>المنتج</th><th>المصنع</th><th>الكونتينر</th></tr></thead>
      <tbody>${dead.slice(0,60).map((x,i)=>`<tr>
        <td class="n">${i+1}</td><td class="bc">${esc(x.barcode)}</td>
        <td class="hd">${esc(x.name)}</td><td>${esc(x.fac)}</td>
        <td>${esc(x.cont || "—")}</td></tr>`).join("")}</tbody>
    </table>
    ${dead.length > 60 ? `<p class="note">و${fmtN(dead.length-60)} منتج آخر ما تحرك.</p>` : ""}` : "";

  const cut = maxRows > 0 && live.length > maxRows
    ? `<p class="note">معروض أعلى ${fmtN(maxRows)} من ${fmtN(live.length)} منتج متحرّك في هذي الفئة.</p>`
    : "";

  return `<section class="page">
  <div class="cathead">
    <div>
      <h2 class="catname">${esc(c.catName || c.cat)}</h2>
      <div class="sub">${fmtN(c.items.length)} منتج · ${fmtPct(c.sharePct)} من الموسم</div>
    </div>
    <div class="catnums">
      <div class="k"><b>${fmtN(c.qty)}</b><span>مباع</span></div>
      <div class="k"><b>${money(c.profit)}</b><span>ربح</span></div>
      <div class="k buy"><b>${fmtN(c.suggest)}</b><span>نجيب</span></div>
    </div>
  </div>

  ${sparkline(c.timeline)}
  <div class="axis">
    <span>${esc(shortLabel(A.firstLabel))}</span>
    <span>ذروتها ${esc(shortLabel(c.peakLabel))} · ${fmtN(c.peakQty)}</span>
    <span>${esc(shortLabel(A.lastLabel))}</span>
  </div>

  <table>
    <thead><tr>
      <th>#</th>${withImages ? "<th>صورة</th>" : ""}<th>الباركود</th><th>المنتج</th>
      <th>المصنع</th><th>الكونتينر</th><th>مباع</th><th>دوران</th>
      <th>ذروته</th><th>أيام</th><th>الحالة</th><th>نجيب</th><th>دزينة</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${cut}
  ${deadBlock}
</section>`;
}

// ─── الصفحة كاملة ───────────────────────────────────────────
export function buildCategoryReport(A, settings, images = {}, opts = {}) {
  const seasonName = opts.seasonName ?? "";
  const picked = opts.cats && opts.cats.length
    ? A.catReport.filter(c => opts.cats.includes(c.cat))
    : A.catReport;

  const body = (opts.summary === false ? "" : summaryPage(A, settings, seasonName))
             + picked.map(c => categorySection(c, A, images, opts)).join("");

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>${esc(seasonName || "تقرير الموسم")}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;font-family:'Cairo',sans-serif}
body{background:#fff;color:#16202b;padding:12px;direction:rtl;font-size:11px}

.bar{position:fixed;top:0;right:0;left:0;background:#121a24;padding:9px;
  display:flex;gap:9px;justify-content:center;z-index:99}
.bar button{padding:8px 22px;border:none;border-radius:8px;font-family:'Cairo';
  font-weight:800;font-size:13px;cursor:pointer}
.b1{background:#b8860b;color:#fff}.b2{background:#334155;color:#fff}
.wrap{margin-top:50px}

.page{page-break-after:always;margin-bottom:26px}
.page:last-child{page-break-after:auto}

h1{font-size:24px;font-weight:900;letter-spacing:-.5px}
.sub{font-size:11px;color:#6b7a8d;margin-top:3px}
h2{font-size:15px;font-weight:900;margin:20px 0 9px;
  padding-bottom:5px;border-bottom:2px solid #e3e8ee}
h3{font-size:12px;font-weight:900;color:#5a6878;margin:16px 0 7px}
.note{font-size:11px;color:#51606f;line-height:1.9;margin:8px 0}
.note b{color:#16202b}
.buy,b.buy{color:#0a6b47}
.neg{color:#b02a28;font-style:normal;direction:ltr;display:inline-block;unicode-bidi:isolate}

.kpis{display:flex;gap:9px;margin-top:16px;flex-wrap:wrap}
.k{flex:1;min-width:84px;border:1px solid #e3e8ee;border-radius:9px;padding:9px 11px}
.k b{display:block;font-size:17px;font-weight:900;letter-spacing:-.4px}
.k span{font-size:10px;color:#7b8798}
.k.buy b{color:#0a6b47}

.spark{display:flex;align-items:flex-end;gap:1.5px;margin-top:12px}
.spark i{flex:1;border-radius:2px 2px 0 0;display:block}
.axis{display:flex;justify-content:space-between;font-size:10px;
  color:#8c98a8;margin-top:5px}

.cathead{display:flex;justify-content:space-between;align-items:flex-start;
  gap:14px;border-bottom:2px solid #16202b;padding-bottom:10px}
.catname{font-size:19px;margin:0;border:none;padding:0}
.catnums{display:flex;gap:8px;flex-shrink:0}
.catnums .k{min-width:72px}

table{width:100%;border-collapse:collapse;margin-top:12px}
th{background:#1f2b3a;color:#fff;padding:7px 5px;font-weight:700;
  font-size:10px;text-align:center;white-space:nowrap}
td{padding:5px;border-bottom:1px solid #eef1f5;text-align:center;
  vertical-align:middle;font-size:10.5px}
tbody tr{page-break-inside:avoid}
tbody tr:nth-child(even){background:#fafbfc}
td.n{color:#9aa7b8;width:26px}
td.hd{text-align:right;font-weight:700;max-width:170px}
td.big{font-size:13px;font-weight:900}
td.buy{font-size:14px;font-weight:900;color:#0a6b47}
td.tier{font-size:9.5px;color:#5a6878;max-width:90px}
td.bc{font-family:'Courier New',monospace;font-size:10px;font-weight:700;
  direction:ltr;letter-spacing:-.2px}
td s{font-size:9px;color:#8c98a8;text-decoration:none}
.tight td,.tight th{padding:4px}
td.im{width:46px}
td.im img{width:40px;height:40px;object-fit:cover;border-radius:5px;
  border:1px solid #e3e8ee;display:block;margin:0 auto}
.noim{width:40px;height:40px;border:1px dashed #d4dae2;border-radius:5px;margin:0 auto}

@media print{
  .bar{display:none}.wrap{margin-top:0}body{padding:0;font-size:10px}
  @page{size:A4 landscape;margin:8mm}
  th{background:#1f2b3a !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .spark i{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style></head><body>
<div class="bar">
  <button class="b1" onclick="window.print()">طباعة</button>
  <button class="b2" onclick="window.close()">إغلاق</button>
</div>
<div class="wrap">${body}</div>
</body></html>`;
}

/** يفتح التقرير في نافذة جديدة */
export function printCategoryReport(A, settings, images = {}, opts = {}) {
  try {
    const html = buildCategoryReport(A, settings, images, opts);
    const w = window.open("", "_blank", "width=1200,height=800");
    if (!w) return { ok:false, error:"فعّل النوافذ المنبثقة في المتصفح" };
    w.document.write(html);
    w.document.close();
    return { ok:true };
  } catch (e) {
    return { ok:false, error:String(e?.message ?? e) };
  }
}
