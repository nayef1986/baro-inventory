// ProductNeeds.jsx — احتياج المنتجات: كونتينر → مصنع → منتجات → فروع
import { useState, useMemo, useRef, useEffect, memo } from "react";
import {
  totalPurchases, soldAllPeriods, getFactoryCode,
  arabicIncludes, num, allContainers, fmtN, fmtM, fmtPct,
} from "../lib/calc.js";

const MIN = 12;
const toDozen = n => Math.ceil(n / MIN) * MIN;

// تواريخ بأرقام إنجليزية (لاتينية) — للتقارير والبوليصات
function dateEN(opts = { year:"numeric", month:"long", day:"numeric" }) {
  const now = new Date();
  const greg = now.toLocaleDateString("en-GB", opts);
  // الهجري بأرقام لاتينية
  const hijri = now.toLocaleDateString("en-GB-u-ca-islamic", opts);
  return { greg, hijri };
}

// استخراج المدينة من اسم الفرع (البارو-مول-مدينة-رقم)
function cityOf(branch, overrides = {}) {
  if (overrides[branch]) return overrides[branch];
  const parts = String(branch).split("-").map(p=>p.trim());
  // الصيغة: البارو - مول - مدينة - رقم → المدينة الجزء قبل الأخير
  if (parts.length >= 3) return parts[parts.length - 2];
  return "";
}

// حساب اقتراحات النقل لمنتج (من فروعه)
function buildTransfers(branches, bought, cityOverrides = {}) {
  const NEED_MAX = 7;   // متبقي أقل = محتاج
  const SURPLUS_MIN = 12; // متبقي أكثر = فائض
  const SURPLUS_PCT = 40; // باع أقل = فائض

  const totalGiven = branches.reduce((s,b)=>s+b.given, 0);
  const warehouse = Math.max(0, bought - totalGiven); // المستودع = المشترى - الموزّع

  const needy = branches.filter(b => b.remaining < NEED_MAX && b.sold > 0)
    .sort((a,b)=>a.remaining-b.remaining);
  const surplus = branches.filter(b => {
    const pct = b.given>0 ? (b.sold/b.given)*100 : 0;
    return b.remaining >= SURPLUS_MIN && pct < SURPLUS_PCT;
  }).sort((a,b)=>b.remaining-a.remaining);

  const transfers = [];
  const usedSurplus = {};

  needy.forEach(n => {
    const needQty = toDozen(Math.max(NEED_MAX - n.remaining, n.sold)); // كم يحتاج
    // 1) المستودع أول
    if (warehouse >= MIN) {
      transfers.push({
        kind: "warehouse", to: n.branch, qty: Math.min(warehouse, needQty),
        toCity: cityOf(n.branch, cityOverrides),
      });
      return;
    }
    // 2) نقل من فرع — نفس المدينة أولوية
    const nCity = cityOf(n.branch, cityOverrides);
    const pool = surplus.filter(s => (usedSurplus[s.branch]??0) < s.remaining && s.branch !== n.branch);
    let from = pool.find(s => cityOf(s.branch, cityOverrides) === nCity); // نفس المدينة
    const sameCity = !!from;
    if (!from) from = pool[0]; // أي فائض
    if (from) {
      const moveQty = Math.min(from.remaining - (usedSurplus[from.branch]??0), needQty);
      if (moveQty >= MIN/2) {
        usedSurplus[from.branch] = (usedSurplus[from.branch]??0) + moveQty;
        transfers.push({
          kind: "transfer", from: from.branch, to: n.branch, qty: moveQty,
          sameCity, fromCity: cityOf(from.branch, cityOverrides), toCity: nCity,
        });
      }
    }
  });

  return { transfers, warehouse };
}


// الاحتياج = المباع (مقرّب للدزينة)، بحد أقصى المشتريات
const reorderQty = (sold, bought) => Math.min(toDozen(sold), bought);

// بناء صفوف التقرير المختصر (للطلب)
function buildRows(items) {
  return items.map(x => {
    const cost = num(x.p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
    return {
      barcode: x.p.barcode,
      name: x.p.name ?? "",
      qtyIn: Math.round(x.bought),
      sold: Math.round(x.sold),
      balance: Math.round(x.closing),
      reorder: Math.round(reorderQty(x.sold, x.bought)),
      cost: cost,
      price: num(x.p.sellPrice),
    };
  });
}

// بناء صفوف التقرير الكامل (تفاصيل دقيقة)
function buildFullRows(items) {
  return items.map(x => {
    const cost = num(x.p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
    const price = num(x.p.sellPrice);
    const frozenQty = Math.round(x.closing);
    const frozenVal = Math.round(frozenQty * cost);
    const revenue = Math.round(x.sold * price);
    const profit = Math.round(x.sold * (price - cost));
    return {
      barcode: x.p.barcode, name: x.p.name ?? "",
      qtyIn: Math.round(x.bought), sold: Math.round(x.sold), balance: Math.round(x.closing),
      reorder: Math.round(reorderQty(x.sold, x.bought)),
      cost, price,
      soldPct: x.bought>0 ? Math.round((x.sold/x.bought)*100) : 0,
      frozenQty, frozenVal, revenue, profit,
    };
  });
}

// تصدير Excel — مختصر
function exportExcel(items, title) {
  const rows = buildRows(items);
  const header = ["Barcode / الباركود","Description / الصنف","Qty In / جاء","Sold / اتباع","Balance / باقي","Reorder / الاحتياج","Cost / التكلفة","Price ﷼ / السعر"];
  const csv = [header.join(",")].concat(
    rows.map(r => [r.barcode, `"${String(r.name).replace(/"/g,'""')}"`, r.qtyIn, r.sold, r.balance, r.reorder, r.cost, r.price].join(","))
  ).join("\n");
  downloadCsv(csv, title);
}

// تصدير Excel — كامل
function exportExcelFull(items, title) {
  const rows = buildFullRows(items);
  const header = ["Barcode / الباركود","Description / الصنف","Qty In / جاء","Sold / اتباع","Balance / باقي","Reorder / الاحتياج","Cost / التكلفة","Price ﷼ / السعر","Sold% / نسبة البيع","Frozen Qty / المجمّد","Frozen ﷼ / قيمة المجمّد","Revenue ﷼ / الإيراد","Profit ﷼ / الربح"];
  const csv = [header.join(",")].concat(
    rows.map(r => [r.barcode, `"${String(r.name).replace(/"/g,'""')}"`, r.qtyIn, r.sold, r.balance, r.reorder, r.cost, r.price, r.soldPct, r.frozenQty, r.frozenVal, r.revenue, r.profit].join(","))
  ).join("\n");
  downloadCsv(csv, title+"_full");
}

function downloadCsv(csv, title) {
  const blob = new Blob(["\uFEFF"+csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${title}.csv`; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

// طباعة تقرير
// ─── بوليصات التوزيع (كاشير 80mm) ────────────────────────────
function printPolicies(items, periods, images, brandName, closedBranches = [], paperSize = "80mm") {
  // لكل منتج: نحسب فروعه، ونطلّع بوليصة فقط لو عنده مخزون + فرع ناقص
  const slips = [];
  items.forEach(x => {
    const p = x.p;
    if (x.closing <= 0) return; // نافذ — ما عنده شي يوزّع
    const branchSales = {};
    periods.forEach(per => {
      Object.entries(per.sales ?? {}).forEach(([branch, d]) => {
        if (closedBranches.includes(branch)) return; // استبعاد المغلقة
        const q = num(d[p.barcode]?.qty ?? 0);
        if (q > 0) branchSales[branch] = (branchSales[branch] ?? 0) + q;
      });
    });
    const branches = Object.entries(branchSales).map(([branch, sold]) => {
      const given = toDozen(sold);
      return { branch, sold, given, remaining: given - sold };
    }).sort((a,b)=>a.remaining-b.remaining);
    const hasNeed = branches.some(b => b.remaining < 7);
    if (!hasNeed) return; // ما فيه فرع ناقص — لا حاجة لبوليصة
    slips.push({ p, closing: x.closing, branches });
  });

  if (slips.length === 0) { alert("لا توجد منتجات تحتاج توزيع"); return; }

  const { greg, hijri } = dateEN({ month:"short", day:"numeric" });

  const slipHtml = slips.map(s => {
    const img = images?.[s.p.barcode];
    const rows = s.branches.map(b => `
      <tr class="${b.remaining < 7 ? 'need' : ''}">
        <td class="brc">${b.branch}</td><td class="qn">${b.sold}</td><td class="qn">${b.given}</td>
        <td class="qn">${b.remaining}${b.remaining < 7 ? ' ✅' : ''}</td></tr>`).join("");
    return `<div class="slip">
      <div class="hd">${brandName ?? "ALBAROO"}</div>
      <div class="dt">📅 ${greg} · ${hijri}H</div>
      ${img ? `<img src="${img}" class="pimg"/>` : ''}
      <div class="pname">${s.p.name}</div>
      <svg class="bc" data-code="${s.p.barcode}"></svg>
      <div class="bcn">${s.p.barcode}</div>
      <div class="meta">🏭 ${getFactoryCode(s.p.barcode)} · 📦 ${s.p.container ?? ""}</div>
      <div class="stock">المتبقي بالمخزون / In Stock: <b>${fmtN(s.closing)}</b></div>
      <table><tr><th>الفرع<br>Branch</th><th>باع<br>Sold</th><th>أخذ<br>Sent</th><th>باقي<br>Left</th></tr>${rows}</table>
      <div class="note">✅ = يحتاج توزيع / Needs restock (< 7)</div>
    </div>`;
  }).join("");

  const isA5 = paperSize === "A5";
  const slipW = isA5 ? "148mm" : "80mm";
  const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>بوليصات التوزيع / Distribution Slips</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js"><\/script>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
      *{font-family:'Cairo',sans-serif;box-sizing:border-box;margin:0;padding:0}
      body{background:#ddd}
      .tb{position:fixed;top:0;left:0;right:0;background:#0f172a;padding:10px;display:flex;gap:10px;justify-content:center;z-index:99}
      .tb button{font-family:'Cairo';font-size:14px;font-weight:700;border:none;border-radius:10px;padding:10px 20px;cursor:pointer}
      .bk{background:#334155;color:#fff}.pr{background:#2563eb;color:#fff}
      .wrap{padding:60px 10px 20px}
      .slip{width:${slipW};background:#fff;margin:0 auto 8px;padding:${isA5?"16px 14px":"10px 8px"};page-break-after:always;text-align:center;border:1px dashed #999}
      .hd{font-size:${isA5?"22px":"16px"};font-weight:900;color:#0f172a;letter-spacing:1px}
      .dt{font-size:${isA5?"12px":"10px"};color:#888;margin-bottom:6px}
      .pimg{width:${isA5?"180px":"130px"};height:auto;max-height:${isA5?"180px":"130px"};object-fit:contain;border-radius:8px;margin:4px auto;display:block;border:1px solid #ddd;background:#fafafa}
      .pname{font-size:${isA5?"19px":"15px"};font-weight:900;color:#0f172a;margin:4px 0}
      .bc{width:90%;height:${isA5?"70px":"55px"};margin:4px auto;display:block}
      .bcn{font-size:${isA5?"22px":"18px"};font-family:monospace;font-weight:900;letter-spacing:2px;color:#0f172a}
      .meta{font-size:${isA5?"13px":"11px"};color:#666;margin:4px 0}
      .stock{font-size:${isA5?"15px":"13px"};color:#0f172a;background:#f1f5f9;border-radius:6px;padding:6px;margin:6px 0}
      .stock b{font-size:${isA5?"22px":"18px"};color:#2563eb}
      table{width:100%;border-collapse:collapse;margin-top:4px}
      th{background:#0f172a;color:#fff;padding:6px;font-size:${isA5?"12px":"10px"};line-height:1.3}
      td{border:1px solid #ddd;padding:6px;font-size:${isA5?"15px":"13px"};text-align:center}
      td.brc{font-weight:700}
      td.qn{font-size:${isA5?"18px":"15px"};font-weight:900}
      tr.need{background:#dcfce7}
      tr.need td{color:#166534;font-weight:900}
      .note{font-size:${isA5?"11px":"9px"};color:#888;margin-top:6px}
      @media print{.tb{display:none}body{background:#fff}.wrap{padding:0}.slip{border:none;margin:0 auto}}
    </style></head><body>
    <div class="tb"><button class="bk" onclick="window.close();history.back()">← رجوع</button><button class="pr" onclick="window.print()">🖨️ طباعة (${slips.length})</button></div>
    <div class="wrap">${slipHtml}</div>
    <script>
      document.querySelectorAll('svg.bc').forEach(function(el){
        try{ JsBarcode(el, el.getAttribute('data-code'), {format:"CODE128",width:${isA5?"2.4":"1.8"},height:${isA5?"60":"48"},displayValue:false,margin:2}); }catch(e){}
      });
    <\/script>
    </body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── خطة النقل المجمّعة (كل المنتجات) ────────────────────────
// ─── خطة النقل/التموين الاحترافية (كل المنتجات) ──────────────
function printTransferPlan(items, periods, title, brandName, images = {}, cityOverrides = {}, closedBranches = []) {
  const bySource = {};
  const fromWarehouse = [];

  items.forEach(x => {
    const p = x.p;
    const branchSales = {};
    periods.forEach(per => {
      Object.entries(per.sales ?? {}).forEach(([branch, d]) => {
        if (closedBranches.includes(branch)) return; // استبعاد المغلقة
        const q = num(d[p.barcode]?.qty ?? 0);
        if (q > 0) branchSales[branch] = (branchSales[branch] ?? 0) + q;
      });
    });
    const branches = Object.entries(branchSales).map(([branch, sold]) => {
      const given = toDozen(sold);
      return { branch, sold, given, remaining: given - sold };
    });
    const { transfers } = buildTransfers(branches, x.bought, cityOverrides);
    transfers.forEach(t => {
      if (t.kind === "warehouse") {
        fromWarehouse.push({ name: p.name, barcode: p.barcode, to: t.to, qty: t.qty });
      } else {
        if (!bySource[t.from]) bySource[t.from] = [];
        bySource[t.from].push({ name: p.name, barcode: p.barcode, to: t.to, qty: t.qty, sameCity: t.sameCity, toCity: t.toCity });
      }
    });
  });

  const totalMoves = Object.values(bySource).reduce((s,a)=>s+a.length,0) + fromWarehouse.length;
  if (totalMoves === 0) { alert("لا توجد عمليات نقل/تموين مقترحة"); return; }

  const now = new Date();
  const { greg, hijri } = dateEN();
  const refNo = "TR-" + now.getFullYear() + (now.getMonth()+1+"").padStart(2,"0") + (now.getDate()+"").padStart(2,"0") + "-" + (now.getHours()+"").padStart(2,"0")+(now.getMinutes()+"").padStart(2,"0");

  const whQty = fromWarehouse.reduce((s,m)=>s+m.qty,0);
  const trQty = Object.values(bySource).flat().reduce((s,m)=>s+m.qty,0);

  const imgCell = (bc) => {
    const im = images?.[bc];
    return im ? `<img src="${im}" class="th"/>` : `<div class="noimg">📦</div>`;
  };

  let whHtml = "";
  if (fromWarehouse.length) {
    whHtml = `<div class="sec">
      <div class="sech wh">🏬 التموين من المستودع الرئيسي <span class="cnt">${fromWarehouse.length} صنف</span></div>
      <table><thead><tr><th>✓</th><th>صورة</th><th>الصنف</th><th>الباركود</th><th>إلى فرع</th><th>الكمية</th></tr></thead><tbody>
      ${fromWarehouse.map(m=>`<tr><td class="chk">☐</td><td class="imgc">${imgCell(m.barcode)}</td><td class="nm">${m.name}</td><td class="bc">${m.barcode}</td><td class="to">${m.to}</td><td class="q">${fmtN(m.qty)}</td></tr>`).join("")}
      </tbody></table></div>`;
  }

  const srcHtml = Object.entries(bySource).map(([src, moves]) => `
    <div class="sec">
      <div class="sech tr">🔀 نقل من فرع: ${src} <span class="cnt">${moves.length} صنف</span></div>
      <table><thead><tr><th>✓</th><th>صورة</th><th>الصنف</th><th>الباركود</th><th>إلى فرع</th><th>الكمية</th><th>المنطقة</th></tr></thead><tbody>
      ${moves.map(m=>`<tr><td class="chk">☐</td><td class="imgc">${imgCell(m.barcode)}</td><td class="nm">${m.name}</td><td class="bc">${m.barcode}</td><td class="to">${m.to}</td><td class="q">${fmtN(m.qty)}</td><td class="${m.sameCity?'same':'diff'}">${m.sameCity?'نفس المدينة ✓':m.toCity}</td></tr>`).join("")}
      </tbody></table></div>`).join("");

  const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>خطة التموين والنقل</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
      *{font-family:'Cairo',sans-serif;box-sizing:border-box;margin:0;padding:0}
      body{background:#f1f5f9;color:#1a1a1a}
      .tb{position:fixed;top:0;left:0;right:0;background:#0f172a;padding:10px;display:flex;gap:10px;justify-content:center;z-index:99}
      .tb button{font-family:'Cairo';font-size:14px;font-weight:700;border:none;border-radius:10px;padding:10px 20px;cursor:pointer}
      .bk{background:#334155;color:#fff}.pr{background:#2563eb;color:#fff}
      .page{max-width:820px;margin:70px auto 30px;background:#fff;padding:24px;border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
      .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0f172a;padding-bottom:14px;margin-bottom:18px}
      .brand{font-size:26px;font-weight:900;color:#0f172a;letter-spacing:2px}
      .ttl{font-size:15px;color:#475569;margin-top:2px}
      .ref{text-align:left;font-size:12px;color:#64748b;line-height:1.7}
      .ref b{color:#0f172a;font-size:14px}
      .sum{display:flex;gap:10px;margin-bottom:20px}
      .sum div{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-align:center}
      .sum .v{font-size:22px;font-weight:900;color:#0f172a}.sum .l{font-size:11px;color:#64748b;margin-top:2px}
      .sec{margin-bottom:22px;page-break-inside:avoid}
      .sech{padding:11px 16px;border-radius:10px 10px 0 0;font-weight:900;font-size:15px;color:#fff;display:flex;justify-content:space-between;align-items:center}
      .sech.wh{background:linear-gradient(135deg,#2563eb,#1d4ed8)}
      .sech.tr{background:linear-gradient(135deg,#ea580c,#c2410c)}
      .cnt{font-size:12px;font-weight:700;background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:100px}
      table{width:100%;border-collapse:collapse}
      th{background:#e2e8f0;padding:8px 6px;font-size:11px;color:#334155}
      td{border:1px solid #e2e8f0;padding:7px 6px;text-align:center;font-size:12px;vertical-align:middle}
      td.chk{font-size:18px;color:#94a3b8;width:30px}
      td.imgc{width:50px;padding:3px}
      .th{width:44px;height:44px;object-fit:cover;border-radius:7px;border:1px solid #e2e8f0}
      .noimg{width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:20px;background:#f1f5f9;border-radius:7px;margin:0 auto}
      td.nm{text-align:right;font-weight:700;color:#0f172a}
      td.bc{font-family:monospace;font-size:10px;color:#64748b}
      td.to{font-weight:700;color:#0f172a}
      td.q{font-size:18px;font-weight:900;color:#2563eb}
      td.same{color:#16a34a;font-weight:700;font-size:11px}td.diff{color:#d97706;font-size:11px}
      tr:nth-child(even) td{background:#fafbfc}
      .ftr{margin-top:24px;border-top:2px solid #e2e8f0;padding-top:16px;display:flex;justify-content:space-between}
      .sign{text-align:center;font-size:12px;color:#64748b}
      .sign .line{border-top:1px solid #94a3b8;width:160px;margin:30px auto 6px}
      .warn{text-align:center;color:#d97706;font-size:12px;margin-top:14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px}
      @media print{body{background:#fff}.tb{display:none}.page{margin:0;box-shadow:none;border-radius:0;max-width:100%}}
    </style></head><body>
    <div class="tb"><button class="bk" onclick="window.close();history.back()">← رجوع</button><button class="pr" onclick="window.print()">🖨️ طباعة</button></div>
    <div class="page">
      <div class="hd">
        <div><div class="brand">${brandName ?? "ALBAROO"}</div><div class="ttl">📋 خطة التموين والنقل بين الفروع</div></div>
        <div class="ref"><b>${refNo}</b><br>📅 ${greg}<br>📅 ${hijri}هـ<br>${title}</div>
      </div>
      <div class="sum">
        <div><div class="v">${totalMoves}</div><div class="l">إجمالي العمليات</div></div>
        <div><div class="v">${fmtN(whQty)}</div><div class="l">قطعة من المستودع</div></div>
        <div><div class="v">${fmtN(trQty)}</div><div class="l">قطعة نقل بين الفروع</div></div>
      </div>
      ${whHtml}${srcHtml}
      <div class="warn">⚠️ الكميات تقديرية من المبيعات — يُرجى التأكد من الرف الفعلي قبل التنفيذ</div>
      <div class="ftr">
        <div class="sign"><div class="line"></div>أمين المستودع</div>
        <div class="sign"><div class="line"></div>المستلم</div>
      </div>
    </div></body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

function printReport(items, title, brandName, images = {}) {
  const rows = buildRows(items);
  const { greg, hijri } = dateEN();
  const totReorder = rows.reduce((s,r)=>s+r.reorder,0);
  const totCost = rows.reduce((s,r)=>s+r.reorder*r.cost,0);
  const body = rows.map((r,i)=>{
    const img = images?.[r.barcode];
    const imgCell = img ? `<img src="${img}" class="thumb"/>` : `<div class="noimg">📦</div>`;
    return `
    <tr><td class="num">${i+1}</td><td class="imgc">${imgCell}</td><td>${r.barcode}</td><td class="desc">${r.name}</td>
    <td>${fmtN(r.qtyIn)}</td><td>${fmtN(r.sold)}</td><td>${fmtN(r.balance)}</td><td class="ro">${fmtN(r.reorder)}</td>
    <td>${fmtN(r.cost)}</td><td>${fmtN(r.price)} ﷼</td></tr>`;
  }).join("");
  const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>${title}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
      *{font-family:'Cairo',sans-serif;box-sizing:border-box}
      body{margin:0;background:#fff;color:#1a1a1a}
      .tb{position:fixed;top:0;left:0;right:0;background:#0f172a;padding:10px;display:flex;gap:10px;justify-content:center;z-index:99}
      .tb button{font-family:'Cairo';font-size:14px;font-weight:700;border:none;border-radius:10px;padding:10px 20px;cursor:pointer}
      .bk{background:#334155;color:#fff}.pr{background:#2563eb;color:#fff}
      .w{max-width:900px;margin:0 auto;padding:70px 16px 40px}
      h1{text-align:center;color:#0f172a;margin-bottom:4px;font-size:22px}
      .date{text-align:center;color:#888;font-size:13px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#0f172a;color:#fff;padding:9px 6px;font-size:12px;line-height:1.4}
      td{border:1px solid #e2e8f0;padding:8px 6px;text-align:center}
      td.num{background:#f1f5f9;font-weight:900;color:#888}
      td.imgc{padding:3px;width:46px}
      .thumb{width:42px;height:42px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0}
      .noimg{width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-size:20px;background:#f1f5f9;border-radius:6px;margin:0 auto}
      td.desc{text-align:right;font-weight:700}
      td.ro{color:#2563eb;font-weight:900;font-size:15px}
      tr:nth-child(even){background:#f8fafc}
      .tot{margin-top:14px;display:flex;gap:12px;justify-content:center}
      .tot div{background:#f1f5f9;border-radius:10px;padding:12px 20px;text-align:center}
      .tot .v{font-size:20px;font-weight:900;color:#0f172a}.tot .l{font-size:12px;color:#888}
      @media print{.tb{display:none}.w{padding:16px}}
    </style></head><body>
    <div class="tb"><button class="bk" onclick="window.close();history.back()">← رجوع</button><button class="pr" onclick="window.print()">🖨️ طباعة</button></div>
    <div class="w">
      <h1>${title}</h1>
      <div class="date">📅 ${greg} — ${hijri} هـ · ${brandName ?? "ALBAROO"} · ${rows.length} صنف</div>
      <table><thead><tr>
        <th>#</th><th>صورة<br>Image</th><th>Barcode<br>الباركود</th><th>Description<br>الصنف</th>
        <th>Qty In<br>جاء</th><th>Sold<br>اتباع</th><th>Balance<br>باقي</th><th>Reorder<br>الاحتياج</th>
        <th>Cost<br>التكلفة</th><th>Price ﷼<br>السعر</th>
      </tr></thead><tbody>${body}</tbody></table>
      <div class="tot">
        <div><div class="v">${fmtN(totReorder)}</div><div class="l">إجمالي الاحتياج / Total Reorder</div></div>
        <div><div class="v">${fmtM(totCost)}</div><div class="l">تكلفة الطلب / Order Cost</div></div>
      </div>
    </div></body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── عارض الصور الموحّد (فتح + تكبير + حفظ) ──────────────────
const ImageViewer = memo(({ src, name, onClose }) => {
  const save = async () => {
    try {
      // نجيب الصورة كـ blob ونحفظها (متوافق آيفون عبر المشاركة)
      const res = await fetch(src);
      const blob = await res.blob();
      const fileName = (name || "image").replace(/[^\w\u0600-\u06FF]/g,"_") + ".jpg";
      if (navigator.canShare) {
        const file = new File([blob], fileName, { type: blob.type });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName; a.click();
      setTimeout(()=>URL.revokeObjectURL(url), 1000);
    } catch { alert("تعذّر الحفظ — اضغط مطوّل على الصورة لحفظها"); }
  };
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <img src={src} alt={name} onClick={e=>e.stopPropagation()} style={{maxWidth:"100%",maxHeight:"70vh",borderRadius:"14px",objectFit:"contain"}} />
      {name && <div style={{color:"#fff",fontWeight:"700",marginTop:"12px",textAlign:"center"}}>{name}</div>}
      <div style={{display:"flex",gap:"10px",marginTop:"16px"}} onClick={e=>e.stopPropagation()}>
        <button onClick={save} style={{padding:"12px 24px",borderRadius:"100px",border:"none",background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff",fontSize:"14px",fontWeight:"900",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>💾 حفظ الصورة</button>
        <button onClick={onClose} style={{padding:"12px 24px",borderRadius:"100px",border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.1)",color:"#fff",fontSize:"14px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>إغلاق</button>
      </div>
      <div style={{color:"rgba(255,255,255,0.4)",fontSize:"11px",marginTop:"10px"}}>اضغط خارج الصورة للإغلاق</div>
    </div>
  );
});

// ─── زر نسخ الباركود ─────────────────────────────────────────
const CopyBarcode = memo(({ barcode }) => {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(barcode).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1200);
    }).catch(()=>{});
  };
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:"5px"}}>
      <span style={{fontFamily:"monospace",fontSize:"12px",color:"#94a3b8"}}>{barcode}</span>
      <button onClick={copy} style={{fontSize:"11px",padding:"2px 7px",borderRadius:"6px",cursor:"pointer",border:"1px solid rgba(148,163,184,0.3)",background:copied?"rgba(34,197,94,0.2)":"rgba(148,163,184,0.1)",color:copied?"#22c55e":"#94a3b8",fontFamily:"Cairo,sans-serif"}}>{copied ? "✓" : "📋"}</button>
    </span>
  );
});

// ─── ماسح الباركود بالكاميرا ─────────────────────────────────
const BarcodeScanner = memo(({ onDetect, onClose }) => {
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const scannerRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    let scanner;
    const containerId = "bc-reader-" + Math.random().toString(36).slice(2,8);
    const el = document.getElementById("bc-scanner-mount");
    if (el) el.id = containerId;

    // نحمّل مكتبة html5-qrcode من CDN (تقرأ Code128/EAN زي السكانر، تشتغل بآيفون)
    const startScanner = async () => {
      try {
        if (!window.Html5Qrcode) {
          await new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js";
            s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
          });
        }
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = window;
        scanner = new Html5Qrcode(containerId, {
          formats: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
        });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 160 }, aspectRatio: 1.4 },
          (decodedText) => {
            if (doneRef.current) return;
            doneRef.current = true;
            navigator.vibrate?.(200);
            scanner.stop().then(()=>scanner.clear()).catch(()=>{});
            onDetect(decodedText);
          },
          () => {} // تجاهل أخطاء كل فريم
        );
        setLoading(false);
      } catch (e) {
        setErr("تعذّر فتح الكاميرا — تأكد من الإذن، أو اكتب الباركود يدوياً");
        setLoading(false);
      }
    };
    startScanner();

    return () => {
      doneRef.current = true;
      const sc = scannerRef.current;
      if (sc) { try { sc.stop().then(()=>sc.clear()).catch(()=>{}); } catch {} }
    };
  }, [onDetect]);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:100,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div style={{color:"#fff",fontWeight:"900",fontSize:"16px",marginBottom:"14px"}}>📷 وجّه الكاميرا للباركود</div>
      {err ? (
        <div style={{color:"#e8855a",textAlign:"center",fontSize:"14px",marginBottom:"16px",maxWidth:"300px"}}>{err}</div>
      ) : (
        <div style={{position:"relative",width:"100%",maxWidth:"340px",borderRadius:"16px",overflow:"hidden",border:"2px solid #d4a853",background:"#000"}}>
          {loading && <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:"#d4a853",fontSize:"14px",zIndex:2}}>جاري فتح الكاميرا…</div>}
          <div id="bc-scanner-mount" style={{width:"100%"}} />
        </div>
      )}
      <button onClick={onClose} style={{marginTop:"18px",padding:"12px 28px",borderRadius:"100px",border:"none",background:"#334155",color:"#fff",fontSize:"14px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>إغلاق</button>
    </div>
  );
});

// ─── تفاصيل المنتج عبر الفروع ────────────────────────────────
const ProductDetail = memo(({ product, periods, images, settings, onBack }) => {
  const [sortMode, setSortMode] = useState("need");
  const data = useMemo(() => {
    const branchSales = {};
    periods.forEach(per => {
      Object.entries(per.sales ?? {}).forEach(([branch, d]) => {
        const q = num(d[product.barcode]?.qty ?? 0);
        if (q > 0) branchSales[branch] = (branchSales[branch] ?? 0) + q;
      });
    });
    const branches = Object.entries(branchSales).map(([branch, sold]) => {
      const given = toDozen(sold);
      return { branch, sold, given, remaining: given - sold };
    });
    const bought  = totalPurchases(product);
    const sold    = soldAllPeriods(product.barcode, periods);
    const closing = Math.max(0, bought - sold);
    // تفصيل الكونتينرات (كل عملية شراء: كمية + كونتينر)
    const conts = (product.purchases ?? []).map(pu => ({
      container: pu.container ?? product.container ?? "—",
      qty: num(pu.qty),
    })).filter(c => c.qty > 0);
    return { branches, bought, sold, closing, conts };
  }, [product, periods]);

  const img = images?.[product.barcode];
  const factory = getFactoryCode(product.barcode);
  const facName = settings?.factories?.[factory] ?? "";

  // اقتراحات النقل
  const { transfers, warehouse } = useMemo(
    () => buildTransfers(data.branches, data.bought, settings?.cityOverrides ?? {}),
    [data.branches, data.bought, settings]
  );

  const sortedBranches = useMemo(() =>
    [...data.branches].sort((a,b) => sortMode === "sold" ? b.sold - a.sold : a.remaining - b.remaining),
    [data.branches, sortMode]
  );

  const print = () => {
    const closed = settings?.closedBranches ?? [];
    const printBranches = sortedBranches.filter(b => !closed.includes(b.branch));
    const rows = printBranches.map((b, i) => `
      <tr><td class="num">${i+1}</td><td>${b.branch} ${b.remaining < 7 ? '<span class="chk">✅</span>' : ''}</td><td class="big">${b.sold}</td><td class="big">${b.given}</td><td class="big rem">${b.remaining}</td></tr>`).join("");
    const sortLabel = sortMode === "sold" ? "الأكثر مبيعاً" : "الأكثر احتياجاً";
    const { greg, hijri } = dateEN();
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>${product.name}</title>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js"><\/script>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        *{font-family:'Cairo',sans-serif;box-sizing:border-box}
        body{margin:0;background:#fff;color:#1a1a1a}
        .tb{position:fixed;top:0;left:0;right:0;background:#0f172a;padding:10px;display:flex;gap:10px;justify-content:center;z-index:99}
        .tb button{font-family:'Cairo';font-size:14px;font-weight:700;border:none;border-radius:10px;padding:10px 20px;cursor:pointer}
        .bk{background:#334155;color:#fff}.pr{background:#2563eb;color:#fff}
        .w{max-width:700px;margin:0 auto;padding:70px 20px 40px}
        .nm{font-size:26px;font-weight:900;color:#0f172a;text-align:center;margin-bottom:6px}
        .date{text-align:center;color:#888;font-size:13px;margin-bottom:16px}
        .hd{display:flex;gap:16px;align-items:center;border-bottom:2px solid #e2e8f0;padding-bottom:16px;margin-bottom:16px}
        .hd img{width:110px;height:110px;border-radius:12px;object-fit:cover;border:1px solid #e2e8f0}
        .bc{text-align:center;flex:1}.bc svg{max-width:100%}
        .bcnum{font-size:30px;font-weight:900;color:#0f172a;font-family:monospace;letter-spacing:3px;margin-top:6px}
        .meta{font-size:14px;color:#555;margin-top:6px}
        .tot{display:flex;gap:10px;margin:16px 0}
        .tot div{flex:1;background:#f1f5f9;border-radius:12px;padding:16px}
        .tot .v{font-size:38px;font-weight:900;color:#0f172a;text-align:center}
        .tot .l{font-size:14px;color:#888;margin-top:4px;text-align:center}
        .sortlbl{text-align:center;font-size:13px;color:#2563eb;font-weight:700;margin:10px 0}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        th{background:#0f172a;color:#fff;padding:12px;font-size:16px}
        td{border:1px solid #e2e8f0;padding:12px;text-align:center;font-size:18px}
        td.big{font-size:24px;font-weight:900}td.rem{color:#dc2626}
        td.num{font-weight:900;color:#888;background:#f1f5f9}
        .chk{font-size:16px}
        tr:nth-child(even){background:#f8fafc}
        @media print{.tb{display:none}.w{padding:20px}}
      </style></head><body>
      <div class="tb"><button class="bk" onclick="window.close();history.back()">← رجوع</button><button class="pr" onclick="window.print()">🖨️ طباعة</button></div>
      <div class="w">
        <div class="nm">${product.name}</div>
        <div class="date">📅 ${greg} — ${hijri} هـ · ${settings?.brandName ?? "ALBAROO"}</div>
        <div class="hd">
          ${img ? `<img src="${img}"/>` : `<div style="width:110px;height:110px;border-radius:12px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:40px">📦</div>`}
          <div class="bc"><svg id="bcsvg"></svg><div class="bcnum">${product.barcode}</div>
          <div class="meta">🏭 ${factory}${facName?` · ${facName}`:""} · 📦 ${product.container ?? ""}</div></div>
        </div>
        <div class="tot">
          <div><div class="v">${fmtN(data.bought)}</div><div class="l">جاء</div></div>
          <div><div class="v">${fmtN(data.sold)}</div><div class="l">باع</div></div>
          <div><div class="v">${fmtN(data.closing)}</div><div class="l">باقي</div></div>
        </div>
        <div class="sortlbl">🔀 الفروع مرتّبة: ${sortLabel}</div>
        <table><thead><tr><th>#</th><th>الفرع</th><th>باع</th><th>أخذ</th><th>باقي</th></tr></thead><tbody>${rows}</tbody></table>
        <div style="text-align:center;color:#666;font-size:14px;margin-top:10px">إجمالي الفروع: ${printBranches.length} · ✅ يحتاج تموين (باقي أقل من 7): ${printBranches.filter(b=>b.remaining<7).length}</div>
      </div>
      <script>try{JsBarcode("#bcsvg","${product.barcode}",{format:"CODE128",width:2,height:60,displayValue:false,margin:4});}catch(e){}<\/script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-blue-400 font-bold text-sm">← رجوع</button>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
        <div className="flex gap-3 items-start">
          {img ? <img src={img} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />
               : <div className="w-20 h-20 rounded-xl bg-slate-700 flex items-center justify-center text-3xl shrink-0">📦</div>}
          <div className="flex-1 min-w-0">
            <div className="font-black text-slate-100">{product.name}</div>
            <div className="mt-1"><CopyBarcode barcode={product.barcode} /></div>
            <div className="text-xs text-blue-400 mt-1">🏭 {factory}{facName?` · ${facName}`:""}</div>
            <div className="text-xs text-slate-400">📦 {product.container}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-blue-900/20 rounded-xl p-2.5 text-center"><div className="text-xl font-black text-blue-400">{fmtN(data.bought)}</div><div className="text-xs text-slate-500">جاء</div></div>
          <div className="bg-amber-900/20 rounded-xl p-2.5 text-center"><div className="text-xl font-black text-amber-400">{fmtN(data.sold)}</div><div className="text-xs text-slate-500">باع</div></div>
          <div className="bg-slate-700/50 rounded-xl p-2.5 text-center"><div className="text-xl font-black text-slate-300">{fmtN(data.closing)}</div><div className="text-xs text-slate-500">باقي</div></div>
        </div>

        {/* تفصيل الكونتينرات */}
        <div className="mt-3 bg-slate-900/50 rounded-xl p-3">
          <div className="text-xs text-slate-400 font-bold mb-2">
            {data.conts.length > 1 ? `📦📦 جاء في ${data.conts.length} كونتينرات:` : "📦 جاء في كونتينر واحد:"}
          </div>
          <div className="space-y-1">
            {data.conts.map((c, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-slate-300 font-mono">{c.container}</span>
                <span className="text-blue-400 font-bold">{fmtN(c.qty)} قطعة</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 bg-slate-800 border border-slate-700 rounded-xl p-1">
        {[["need","الأكثر احتياجاً"],["sold","الأكثر مبيعاً"]].map(([k,l])=>(
          <button key={k} onClick={()=>setSortMode(k)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${sortMode===k?"bg-blue-600 text-white":"text-slate-400"}`}>{l}</button>
        ))}
      </div>
      <button onClick={print} className="w-full bg-slate-700 border border-slate-600 text-slate-200 py-3 rounded-xl font-bold text-sm">🖨️ طباعة التقرير بالصورة</button>

      <div className="space-y-2">
        <div className="text-sm font-bold text-slate-300">الفروع ({sortedBranches.length})</div>
        {sortedBranches.map(b => (
          <div key={b.branch} className="bg-slate-800 border border-slate-700 rounded-xl p-3">
            <div className="font-bold text-slate-100 text-sm mb-2">🏪 {b.branch}</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center"><div className="text-lg font-black text-amber-400">{fmtN(b.sold)}</div><div className="text-xs text-slate-500">باع</div></div>
              <div className="text-center"><div className="text-lg font-black text-blue-400">{fmtN(b.given)}</div><div className="text-xs text-slate-500">أخذ</div></div>
              <div className="text-center"><div className="text-lg font-black text-emerald-400">{fmtN(b.remaining)}</div><div className="text-xs text-slate-500">باقي</div></div>
            </div>
          </div>
        ))}
      </div>

      {/* اقتراحات النقل */}
      {transfers.length > 0 && (
        <div className="space-y-2 mt-3">
          <div className="text-sm font-bold text-slate-300">🔀 اقتراحات التموين ({transfers.length})</div>
          {warehouse > 0 && (
            <div className="text-xs text-blue-300 bg-blue-900/20 rounded-lg px-3 py-2">🏬 المستودع فيه {fmtN(warehouse)} قطعة متاحة</div>
          )}
          {transfers.map((t,i) => (
            <div key={i} style={{borderRadius:"14px",padding:"12px",border:`1.5px solid ${t.kind==="warehouse"?"#60a5fa":t.sameCity?"#22c55e":"#f59e0b"}40`,background:`${t.kind==="warehouse"?"#60a5fa":t.sameCity?"#22c55e":"#f59e0b"}10`}}>
              {t.kind === "warehouse" ? (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🏬</span>
                    <span className="text-sm font-black text-blue-300">من المستودع</span>
                  </div>
                  <div className="text-sm text-slate-100">أرسل <b>{fmtN(t.qty)}</b> قطعة إلى <b>{t.to}</b></div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🔀</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{background:t.sameCity?"rgba(34,197,94,0.2)":"rgba(245,158,11,0.2)",color:t.sameCity?"#22c55e":"#f59e0b"}}>
                      {t.sameCity ? `نفس المدينة (${t.toCity})` : `${t.fromCity} ← ${t.toCity}`}
                    </span>
                  </div>
                  <div className="text-sm text-slate-100">انقل <b>{fmtN(t.qty)}</b> قطعة من <b>{t.from}</b> إلى <b>{t.to}</b></div>
                </>
              )}
              <div className="text-xs text-amber-400 mt-1.5">⚠️ تقدير من المبيعات — تأكد من رف الفرع</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ─── منتجات المصنع ───────────────────────────────────────────
const ProductList = memo(({ items, images, periods, settings, redMax, greenMin, onSelect, onBack, title }) => {
  const [search, setSearch] = useState("");
  const [scan, setScan] = useState(false);
  const [viewImg, setViewImg] = useState(null);
  const [visible, setVisible] = useState(30);

  const filtered = useMemo(() => {
    if (!search) return items;
    return items.filter(x => arabicIncludes(x.p.name, search) || x.p.barcode.includes(search));
  }, [items, search]);

  const colorOf = (soldPct) => {
    if (soldPct < redMax)   return { border:"#ef4444", txt:"#ef4444", bg:"rgba(239,68,68,0.08)" };
    if (soldPct < greenMin) return { border:"#f59e0b", txt:"#f59e0b", bg:"rgba(245,158,11,0.08)" };
    return { border:"#22c55e", txt:"#22c55e", bg:"rgba(34,197,94,0.08)" };
  };

  return (
    <div className="space-y-3">
      {scan && <BarcodeScanner onDetect={(code)=>{ setSearch(code); setScan(false); }} onClose={()=>setScan(false)} />}
      {viewImg && <ImageViewer src={viewImg.src} name={viewImg.name} onClose={()=>setViewImg(null)} />}
      <button onClick={onBack} className="text-blue-400 font-bold text-sm">← رجوع</button>
      <div className="font-black text-slate-100">{title}</div>

      {/* بحث + كاميرا */}
      <div className="flex gap-2">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 بحث بالاسم أو الباركود…"
          className="flex-1 bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
        <button onClick={()=>setScan(true)} className="bg-blue-600 text-white px-4 rounded-xl font-bold">📷</button>
      </div>

      {/* تصدير وطباعة */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={()=>exportExcel(filtered, title.replace(/[^\w\u0600-\u06FF]/g,"_"))} className="bg-emerald-600 text-white py-2.5 rounded-xl text-xs font-bold">📊 طلب</button>
        <button onClick={()=>exportExcelFull(filtered, title.replace(/[^\w\u0600-\u06FF]/g,"_"))} className="bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-bold">📊 كامل</button>
        <button onClick={()=>printReport(filtered, title, "ALBAROO", images)} className="bg-slate-700 border border-slate-600 text-slate-200 py-2.5 rounded-xl text-xs font-bold">🖨️ تقرير</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={()=>printPolicies(filtered, periods, images, "ALBAROO", settings?.closedBranches ?? [], "80mm")} className="bg-purple-600 text-white py-2.5 rounded-xl text-sm font-bold">🏷️ بوليصات 80mm</button>
        <button onClick={()=>printPolicies(filtered, periods, images, "ALBAROO", settings?.closedBranches ?? [], "A5")} className="bg-purple-700 text-white py-2.5 rounded-xl text-sm font-bold">🏷️ بوليصات A5</button>
      </div>
      <button onClick={()=>printTransferPlan(filtered, periods, title, "ALBAROO", images, settings?.cityOverrides ?? {}, settings?.closedBranches ?? [])} className="w-full bg-orange-600 text-white py-2.5 rounded-xl text-sm font-bold mt-2">🔀 خطة النقل بين الفروع</button>
      <div className="text-xs text-slate-500">{filtered.length} منتج</div>

      <div className="space-y-2">
        {filtered.slice(0, visible).map(x => {
          const soldOut = x.closing <= 0;
          const c = soldOut
            ? { border:"#64748b", txt:"#94a3b8", bg:"rgba(100,116,139,0.12)" }
            : colorOf(x.soldPct);
          const conts = [...new Set((x.p.purchases ?? []).map(pu => pu.container ?? x.p.container).filter(Boolean))];
          const isDup = conts.length > 1;
          return (
            <div key={x.p.barcode} onClick={()=>onSelect(x.p)} style={{
              background:c.bg,
              border: soldOut ? "1.5px solid #64748b" : isDup ? "2px solid #a855f7" : `1.5px solid ${c.border}`,
              borderRadius:"14px",padding:"12px",cursor:"pointer",position:"relative",
              opacity: soldOut ? 0.7 : 1
            }}>
              {soldOut && (
                <div style={{position:"absolute",top:"-9px",left:"10px",background:"#64748b",color:"#fff",fontSize:"10px",fontWeight:"900",padding:"2px 8px",borderRadius:"100px"}}>
                  SOLD OUT
                </div>
              )}
              {!soldOut && isDup && (
                <div style={{position:"absolute",top:"-9px",left:"10px",background:"#a855f7",color:"#fff",fontSize:"10px",fontWeight:"900",padding:"2px 8px",borderRadius:"100px"}}>
                  🔁 مكرر · {conts.length} كونتينر
                </div>
              )}
              <div className="flex items-start gap-3">
                {images?.[x.p.barcode]
                  ? <img src={images[x.p.barcode]} alt="" onClick={(e)=>{e.stopPropagation(); setViewImg({src:images[x.p.barcode], name:x.p.name});}} className="w-14 h-14 rounded-lg object-cover shrink-0" style={{filter:soldOut?"grayscale(1)":"none"}} />
                  : <div className="w-14 h-14 rounded-lg bg-slate-700 flex items-center justify-center text-xl shrink-0">📦</div>}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-100 text-sm leading-tight">{x.p.name}</div>
                  <div className="mt-1" onClick={e=>e.stopPropagation()}><CopyBarcode barcode={x.p.barcode} /></div>
                </div>
                <div style={{fontSize:"20px",fontWeight:"900",color:c.txt}} className="shrink-0">{fmtPct(x.soldPct)}</div>
              </div>
              {/* شارات منظّمة زي المصنع */}
              <div className="flex gap-1.5 flex-wrap mt-2">
                <span className="text-xs px-2 py-0.5 rounded-lg bg-blue-900/30 text-blue-300">جاء {fmtN(x.bought)}</span>
                <span className="text-xs px-2 py-0.5 rounded-lg bg-amber-900/30 text-amber-300">باع {fmtN(x.sold)}</span>
                <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-700 text-slate-300">باقي {fmtN(x.closing)}</span>
                <span className="text-xs px-2 py-0.5 rounded-lg bg-red-900/20 text-red-300">شراء {fmtN(num(x.p.purchases?.slice(-1)[0]?.buyPrice??0))}﷼</span>
                <span className="text-xs px-2 py-0.5 rounded-lg bg-emerald-900/20 text-emerald-300">بيع {fmtN(num(x.p.sellPrice))}﷼</span>
              </div>
            </div>
          );
        })}
      </div>
      {visible < filtered.length && (
        <button onClick={()=>setVisible(v=>v+30)} className="w-full bg-slate-700 text-slate-300 py-3 rounded-xl text-sm font-bold">عرض المزيد ({filtered.length - visible})</button>
      )}
    </div>
  );
});

// ─── عرض مصانع الكونتينر مع بحث ──────────────────────────────
const FactoriesView = memo(({ container, factories, allItems, images, periods, settings, redMax, greenMin, setRedMax, setGreenMin, onSelectFactory, onBack }) => {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search) return factories;
    const s = search.toLowerCase();
    return factories.filter(f => f.code.includes(s) || (f.name ?? "").toLowerCase().includes(s) || arabicIncludes(f.name, search));
  }, [factories, search]);

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-blue-400 font-bold text-sm">← رجوع للكونتينرات</button>
      <div className="font-black text-slate-100 text-lg">📦 {container}</div>
      <div className="text-xs text-slate-500">{factories.length} مصنع · الأضعف أولاً</div>

      {/* بحث بالمصنع */}
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 بحث برقم المصنع أو اسمه…"
        className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />

      {/* تصدير كل الكونتينر */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={()=>exportExcel(allItems, container)} className="bg-emerald-600 text-white py-2.5 rounded-xl text-xs font-bold">📊 طلب</button>
        <button onClick={()=>exportExcelFull(allItems, container)} className="bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-bold">📊 كامل</button>
        <button onClick={()=>printReport(allItems, `كونتينر ${container}`, "ALBAROO", images)} className="bg-slate-700 border border-slate-600 text-slate-200 py-2.5 rounded-xl text-xs font-bold">🖨️ تقرير</button>
      </div>
      <button onClick={()=>printTransferPlan(allItems, periods, `كونتينر ${container}`, "ALBAROO", images, settings?.cityOverrides ?? {}, settings?.closedBranches ?? [])} className="w-full bg-orange-600 text-white py-2.5 rounded-xl text-sm font-bold">🔀 خطة النقل بين الفروع</button>

      {/* حدود التلوين */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400 font-bold">تلوين:</span>
        <span className="text-xs text-red-400">🔴 أقل</span>
        <input type="number" value={redMax} onChange={e=>setRedMax(Math.max(0,Math.min(100,Number(e.target.value)||0)))} className="w-12 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-1 py-1 text-sm font-black text-center" />
        <span className="text-xs text-emerald-400">🟢 فوق</span>
        <input type="number" value={greenMin} onChange={e=>setGreenMin(Math.max(0,Math.min(100,Number(e.target.value)||0)))} className="w-12 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-1 py-1 text-sm font-black text-center" />
        <span className="text-xs text-slate-400">%</span>
      </div>

      <div className="space-y-2">
        {filtered.map(f => {
          const c = f.soldPct < redMax ? "#ef4444" : f.soldPct < greenMin ? "#f59e0b" : "#22c55e";
          return (
            <div key={f.code} onClick={()=>onSelectFactory(f.code)} style={{background:`${c}10`,border:`1.5px solid ${c}40`,borderRadius:"14px",padding:"13px",cursor:"pointer"}}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-black text-slate-100 font-mono text-sm">{f.code}{f.name && <span className="text-slate-400 font-sans"> · {f.name}</span>}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{f.items.length} منتج</div>
                </div>
                <div style={{fontSize:"20px",fontWeight:"900",color:c}}>{fmtPct(f.soldPct)}</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {f.stagnant > 0 && <span className="text-xs px-2 py-0.5 rounded-lg bg-red-900/30 text-red-300">🔴 {f.stagnant} راكد</span>}
                {f.frozen > 0 && <span className="text-xs px-2 py-0.5 rounded-lg bg-amber-900/30 text-amber-300">💰 {fmtM(f.frozen)} مجمّد</span>}
                <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-700 text-slate-300">باع {fmtN(f.sold)}</span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="text-center text-slate-500 py-8">لا مصانع بهذا البحث</div>}
      </div>
    </div>
  );
});

// ─── الشاشة الرئيسية: كونتينر → مصنع → منتجات ────────────────
export default function ProductNeedsScreen({ products = [], periods = [], images = {}, settings = {}, onSaveSettings }) {
  const [container, setContainer] = useState(null);
  const [factory,   setFactory]   = useState(null);
  const [selected,  setSelected]  = useState(null);
  const [redMax,    setRedMax]    = useState(30);
  const [greenMin,  setGreenMin]  = useState(60);
  const [showHeroes, setShowHeroes] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScan, setSearchScan] = useState(false);
  const [starred, setStarred] = useState(settings?.starred ?? []);

  // نجمة يدوية (toggle) — تُحفظ في الإعدادات (خفيف)
  const toggleStar = async (barcode) => {
    const next = starred.includes(barcode) ? starred.filter(b=>b!==barcode) : [...starred, barcode];
    setStarred(next);
    if (onSaveSettings) await onSaveSettings({ ...settings, starred: next });
  };
  // رابح تلقائي
  const isWinner = (soldPct, margin) => soldPct > 70 && margin > 20;

  // حساب منتج (نسبة + متبقي)
  const calcItem = (p) => {
    const bought  = totalPurchases(p);
    const sold    = soldAllPeriods(p.barcode, periods);
    const closing = Math.max(0, bought - sold);
    const soldPct = bought > 0 ? (sold/bought)*100 : 0;
    return { p, bought, sold, closing, soldPct };
  };

  // الكونتينرات
  const containers = useMemo(() => allContainers(products), [products]);

  // مصانع الكونتينر المختار + تنبيهاتها
  const factories = useMemo(() => {
    if (!container) return [];
    const prods = products.filter(p => p.container === container);
    const map = {};
    prods.forEach(p => {
      const f = getFactoryCode(p.barcode);
      if (!map[f]) map[f] = { code:f, name: settings?.factories?.[f] ?? "", items:[] };
      map[f].items.push(calcItem(p));
    });
    return Object.values(map).map(f => {
      const bought = f.items.reduce((s,x)=>s+x.bought,0);
      const sold   = f.items.reduce((s,x)=>s+x.sold,0);
      const soldPct = bought>0 ? (sold/bought)*100 : 0;
      const stagnant = f.items.filter(x=>x.soldPct < redMax).length;
      const frozen = f.items.reduce((s,x)=>s+x.closing*num(x.p.purchases?.slice(-1)[0]?.buyPrice??0),0);
      return { ...f, bought, sold, soldPct, stagnant, frozen };
    }).sort((a,b)=>a.soldPct-b.soldPct);
  }, [container, products, periods, settings, redMax]);

  // منتجات المصنع المختار (مرتّبة بالمتبقي)
  const factoryItems = useMemo(() => {
    if (!factory) return [];
    const f = factories.find(x=>x.code===factory);
    return f ? [...f.items].sort((a,b)=>b.closing-a.closing) : [];
  }, [factory, factories]);

  // عرض: تفاصيل منتج
  if (selected) {
    return <ProductDetail product={selected} periods={periods} images={images} settings={settings} onBack={()=>setSelected(null)} />;
  }

  // عرض: منتجات المصنع
  if (factory) {
    const f = factories.find(x=>x.code===factory);
    return <ProductList items={factoryItems} images={images} periods={periods} settings={settings} redMax={redMax} greenMin={greenMin}
      onSelect={setSelected} onBack={()=>setFactory(null)}
      title={`🏭 ${f?.code}${f?.name?` · ${f.name}`:""}`} />;
  }

  // عرض: مصانع الكونتينر
  if (container) {
    return <FactoriesView container={container} factories={factories} allItems={factories.flatMap(f=>f.items)} images={images} periods={periods} settings={settings} redMax={redMax} greenMin={greenMin}
      setRedMax={setRedMax} setGreenMin={setGreenMin} onSelectFactory={setFactory} onBack={()=>setContainer(null)} />;
  }

  // عرض: البحث بالباركود (في كل المنتجات)
  if (showSearch) {
    const q = searchQuery.trim().toLowerCase();
    const results = q
      ? products.filter(p => p.barcode.toLowerCase().includes(q) || arabicIncludes(p.name, searchQuery)).slice(0, 50)
      : [];
    return (
      <div className="space-y-3">
        {searchScan && <BarcodeScanner onDetect={(code)=>{ setSearchQuery(code); setSearchScan(false); }} onClose={()=>setSearchScan(false)} />}
        <button onClick={()=>{ setShowSearch(false); setSearchQuery(""); }} className="text-blue-400 font-bold text-sm">← رجوع</button>
        <div className="font-black text-slate-100 text-lg">🔍 بحث بالباركود</div>
        <div className="flex gap-2">
          <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} autoFocus placeholder="باركود أو اسم المنتج…"
            className="flex-1 bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
          <button onClick={()=>setSearchScan(true)} className="bg-blue-600 text-white px-4 rounded-xl font-bold">📷</button>
        </div>
        {q && <div className="text-xs text-slate-500">{results.length} نتيجة</div>}
        <div className="space-y-2">
          {results.map(p => {
            const x = calcItem(p);
            return (
              <div key={p.barcode} onClick={()=>{ setSelected(p); setShowSearch(false); }} className="bg-slate-800 border border-slate-700 rounded-xl p-3 cursor-pointer flex items-center gap-3">
                {images?.[p.barcode]
                  ? <img src={images[p.barcode]} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  : <div className="w-12 h-12 rounded-lg bg-slate-700 flex items-center justify-center text-lg shrink-0">📦</div>}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-100 text-sm truncate">{p.name}</div>
                  <div className="text-xs text-slate-400 font-mono">{p.barcode}</div>
                  <div className="flex gap-1.5 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-lg bg-amber-900/30 text-amber-300">باع {fmtN(x.sold)}</span>
                    <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-700 text-slate-300">باقي {fmtN(x.closing)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {q && results.length === 0 && <div className="text-center text-slate-500 py-12">لا نتائج لـ "{searchQuery}"</div>}
          {!q && <div className="text-center text-slate-500 py-12">اكتب باركود أو اسم، أو امسح 📷</div>}
        </div>
      </div>
    );
  }

  // عرض: الأبطال (الرابحون + المنجّمون)
  if (showHeroes) {
    const heroes = products.map(p => {
      const x = calcItem(p);
      const margin = x.p.buyPrice > 0 ? ((num(x.p.sellPrice) - num(x.p.purchases?.slice(-1)[0]?.buyPrice??0)) / num(x.p.purchases?.slice(-1)[0]?.buyPrice??1)) * 100 : 0;
      const buyPrice = num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
      const m = buyPrice > 0 ? ((num(p.sellPrice)-buyPrice)/buyPrice)*100 : 0;
      const winner = isWinner(x.soldPct, m);
      const star = starred.includes(p.barcode);
      return { ...x, margin:m, winner, star };
    }).filter(h => h.winner || h.star)
      .sort((a,b)=> (b.winner?1:0)-(a.winner?1:0) || b.soldPct-a.soldPct);

    return (
      <div className="space-y-3">
        <button onClick={()=>setShowHeroes(false)} className="text-blue-400 font-bold text-sm">← رجوع</button>
        <div className="font-black text-slate-100 text-lg">⭐ الأبطال ({heroes.length})</div>
        <div className="text-xs text-slate-500">المنتجات الرابحة 🎉 والمفضّلة ⭐</div>
        <div className="space-y-2">
          {heroes.map(h => (
            <div key={h.p.barcode} style={{background:"rgba(212,168,83,0.08)",border:"1.5px solid rgba(212,168,83,0.3)",borderRadius:"14px",padding:"12px",position:"relative"}}>
              {h.winner && <div style={{position:"absolute",top:"-9px",left:"10px",background:"linear-gradient(135deg,#d4a853,#b8935a)",color:"#0a0804",fontSize:"10px",fontWeight:"900",padding:"2px 8px",borderRadius:"100px"}}>🎉 مبروك رابح</div>}
              <div className="flex items-start gap-3">
                {images?.[h.p.barcode]
                  ? <img src={images[h.p.barcode]} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                  : <div className="w-14 h-14 rounded-lg bg-slate-700 flex items-center justify-center text-xl shrink-0">📦</div>}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-100 text-sm leading-tight">{h.p.name}</div>
                  <div className="mt-1" onClick={e=>e.stopPropagation()}><CopyBarcode barcode={h.p.barcode} /></div>
                  <div className="flex gap-1.5 flex-wrap mt-1.5">
                    <span className="text-xs px-2 py-0.5 rounded-lg bg-emerald-900/30 text-emerald-300">باع {fmtPct(h.soldPct)}</span>
                    <span className="text-xs px-2 py-0.5 rounded-lg bg-purple-900/30 text-purple-300">هامش {Math.round(h.margin)}%</span>
                  </div>
                </div>
                <button onClick={()=>toggleStar(h.p.barcode)} style={{fontSize:"24px",background:"none",border:"none",cursor:"pointer"}}>
                  {h.star ? "⭐" : "☆"}
                </button>
              </div>
            </div>
          ))}
          {heroes.length === 0 && <div className="text-center text-slate-500 py-12">لا أبطال بعد — نجّم منتجاتك المفضّلة ⭐</div>}
        </div>
      </div>
    );
  }

  // عرض: الكونتينرات
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-black text-slate-100 text-lg">🔍 احتياج المنتجات</div>
          <div className="text-xs text-slate-500">اختر كونتينر → مصنع → منتج</div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={()=>setShowSearch(true)} className="bg-blue-600 text-white px-3 py-2 rounded-xl text-sm font-bold">🔍 بحث</button>
          <button onClick={()=>setShowHeroes(true)} className="bg-amber-600 text-white px-3 py-2 rounded-xl text-sm font-bold">⭐ الأبطال</button>
        </div>
      </div>
      <div className="space-y-2">
        {containers.map(c => {
          const count = products.filter(p=>p.container===c).length;
          return (
            <div key={c} onClick={()=>setContainer(c)} className="bg-slate-800 border border-slate-700 rounded-xl p-4 cursor-pointer flex items-center justify-between">
              <div className="font-black text-slate-100">📦 {c}</div>
              <div className="text-xs text-slate-500">{count} منتج ←</div>
            </div>
          );
        })}
        {containers.length === 0 && <div className="text-center text-slate-500 py-12">لا توجد كونتينرات</div>}
      </div>
    </div>
  );
}
