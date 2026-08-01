// ProductNeeds.jsx — احتياج المنتجات: كونتينر → مصنع → منتجات → فروع
import { useState, useMemo, useRef, useEffect, memo } from "react";
import {
  totalPurchases, soldAllPeriods, getFactoryCode,
  arabicIncludes, num, allContainers, fmtN, fmtM, fmtPct,
  getBranchRemaining, getCategoryCode, getCategoryName,
} from "../lib/calc.js";
import { loadBranchCounts, loadTransfers } from "../lib/storage.js";
import OfferBuilder from "./OfferBuilder.jsx";

const MIN = 12;
const toDozen = n => Math.ceil(n / MIN) * MIN;

// تواريخ بأرقام إنجليزية (لاتينية) — للتقارير والبوليصات
function dateEN(opts = { year:"numeric", month:"long", day:"numeric" }) {
  const now = new Date();
  const greg = now.toLocaleDateString("en-GB", opts);
  const hijri = now.toLocaleDateString("en-GB-u-ca-islamic", opts);
  return { greg, hijri };
}

function dateNum() {
  const now = new Date();
  const d = (now.getDate()+"").padStart(2,"0");
  const m = (now.getMonth()+1+"").padStart(2,"0");
  const y = now.getFullYear();
  return `${d}/${m}/${y}`;
}

function cityOf(branch, overrides = {}) {
  if (overrides[branch]) return overrides[branch];
  const parts = String(branch).split("-").map(p=>p.trim());
  if (parts.length >= 3) return parts[parts.length - 2];
  return "";
}

function buildTransfers(branches, bought, cityOverrides = {}, newBranches = []) {
  const NEED_MAX = 7;
  const SURPLUS_MIN = 12;
  const SURPLUS_PCT = 40;

  const totalGiven = branches.reduce((s,b)=>s+b.given, 0);
  const warehouse = Math.max(0, bought - totalGiven);

  const needy = branches.filter(b => b.remaining < NEED_MAX && b.sold > 0)
    .sort((a,b)=>a.remaining-b.remaining);
  const surplus = branches.filter(b => {
    if (newBranches.includes(b.branch)) return false;  // الفرع الجديد ما يُسحب منه
    const pct = b.given>0 ? (b.sold/b.given)*100 : 0;
    return b.remaining >= SURPLUS_MIN && pct < SURPLUS_PCT;
  }).sort((a,b)=>b.remaining-a.remaining);

  const transfers = [];
  const usedSurplus = {};

  needy.forEach(n => {
    const needQty = toDozen(Math.max(NEED_MAX - n.remaining, n.sold));
    if (warehouse >= MIN) {
      transfers.push({
        kind: "warehouse", to: n.branch, qty: Math.min(warehouse, needQty),
        toCity: cityOf(n.branch, cityOverrides),
      });
      return;
    }
    const nCity = cityOf(n.branch, cityOverrides);
    const pool = surplus.filter(s => (usedSurplus[s.branch]??0) < s.remaining && s.branch !== n.branch);
    let from = pool.find(s => cityOf(s.branch, cityOverrides) === nCity);
    const sameCity = !!from;
    if (!from) from = pool[0];
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

const reorderQty = (sold, bought) => Math.min(toDozen(sold), bought);

function buildRows(items) {
  return items.map(x => {
    const cost = num(x.p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
    const price = num(x.p.sellPrice);
    const bought = Math.round(x.bought);
    const sold = Math.round(x.sold);
    return {
      barcode: x.p.barcode, name: x.p.name ?? "",
      qtyIn: bought, sold: sold,
      balance: Math.round(x.closing), reorder: Math.round(reorderQty(x.sold, x.bought)),
      cost: cost, price: price,
      // 💰 المالية لكل منتج
      totalCost: cost * bought,          // تكلفة الوارد
      revenue: price * sold,             // إجمالي مبيعاته
      profit: (price - cost) * sold,     // ربحه الفعلي
      soldPct: bought > 0 ? (sold / bought) * 100 : null,  // نسبة البيع (للترتيب)
    };
  });
}

// شريط الإجماليات — يوضع أول الصفحة في كل التقارير
function summaryBarHtml(rows) {
  const t = rows.reduce((a,r)=>({
    qtyIn: a.qtyIn + r.qtyIn, sold: a.sold + r.sold, balance: a.balance + r.balance,
    cost: a.cost + r.totalCost, revenue: a.revenue + r.revenue, profit: a.profit + r.profit,
  }), { qtyIn:0, sold:0, balance:0, cost:0, revenue:0, profit:0 });
  return `<div class="sumbar">
    <div class="sc"><div class="sv bl">${fmtN(t.qtyIn)}</div><div class="sl">إجمالي الوارد</div></div>
    <div class="sc"><div class="sv or">${fmtN(t.sold)}</div><div class="sl">إجمالي المباع</div></div>
    <div class="sc"><div class="sv gr">${fmtN(t.balance)}</div><div class="sl">إجمالي الباقي</div></div>
    <div class="sc"><div class="sv rd">${fmtN(t.cost)}</div><div class="sl">إجمالي التكلفة ﷼</div></div>
    <div class="sc"><div class="sv bl">${fmtN(t.revenue)}</div><div class="sl">إجمالي المبيعات ﷼</div></div>
    <div class="sc hi"><div class="sv ${t.profit>=0?'gr':'rd'}">${fmtN(t.profit)}</div><div class="sl">صافي الربح ﷼</div></div>
  </div>`;
}

// تنسيق موحّد: صفوف متبادلة + شريط الإجماليات + ألوان المالية
const REPORT_CSS = `
  tbody tr:nth-child(even){background:#f4f6f9}
  tbody tr:nth-child(odd){background:#fff}
  td.ct{color:#7c3aed;font-weight:900}
  td.tt{color:#0891b2;font-weight:900}
  td.pf{color:#059669;font-weight:900}
  td.ls{color:#dc2626;font-weight:900}
  .sumbar{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px}
  .sc{flex:1 1 15%;background:#f4f6f9;border:1px solid #dde3ea;border-radius:9px;padding:9px 6px;text-align:center;min-width:95px}
  .sc.hi{background:#eefaf3;border-color:#a7e0c3;border-width:2px}
  .sv{font-size:19px;font-weight:900;line-height:1.1}
  .sl{font-size:10px;color:#666;margin-top:3px;font-weight:700}
  .sv.bl{color:#2563eb}.sv.or{color:#d97706}.sv.gr{color:#059669}.sv.rd{color:#dc2626}
`;

// خلايا المالية الثلاث لكل صف
function finCells(r) {
  const pCls = r.profit > 0 ? "pf" : r.profit < 0 ? "ls" : "";
  return `<td class="ct" data-l="تكلفة">${fmtN(r.totalCost)}</td>
          <td class="tt" data-l="إجمالي">${fmtN(r.revenue)}</td>
          <td class="${pCls}" data-l="ربح">${fmtN(r.profit)}</td>`;
}
const FIN_HEADERS = `<th>Cost Total<br>التكلفة ﷼</th><th>Revenue<br>الإجمالي ﷼</th><th>Profit<br>الربح ﷼</th>`;

// نفس الشي لكن لبنية تقارير الأبطال/الضعيف/الفئة (h)
function finOf(h) {
  const buy = num(h.buyPrice);
  const sell = num(h.sell ?? h.p?.sellPrice);   // بعض التقارير تستخدم h.sell
  const bought = Math.round(num(h.bought));
  const sold = Math.round(num(h.sold));
  return { cost: buy * bought, revenue: sell * sold, profit: (sell - buy) * sold };
}
function finCellsH(h) {
  const f = finOf(h);
  const pCls = f.profit > 0 ? "pf" : f.profit < 0 ? "ls" : "";
  return `<td class="ct" data-l="تكلفة">${fmtN(f.cost)}</td>
          <td class="tt" data-l="إجمالي">${fmtN(f.revenue)}</td>
          <td class="${pCls}" data-l="ربح">${fmtN(f.profit)}</td>`;
}
function summaryBarH(list) {
  const t = list.reduce((a,h)=>{ const f = finOf(h);
    return { qtyIn: a.qtyIn + Math.round(num(h.bought)), sold: a.sold + Math.round(num(h.sold)),
             balance: a.balance + Math.round(num(h.closing)),
             cost: a.cost + f.cost, revenue: a.revenue + f.revenue, profit: a.profit + f.profit }; },
    { qtyIn:0, sold:0, balance:0, cost:0, revenue:0, profit:0 });
  return `<div class="sumbar">
    <div class="sc"><div class="sv bl">${fmtN(t.qtyIn)}</div><div class="sl">إجمالي الوارد</div></div>
    <div class="sc"><div class="sv or">${fmtN(t.sold)}</div><div class="sl">إجمالي المباع</div></div>
    <div class="sc"><div class="sv gr">${fmtN(t.balance)}</div><div class="sl">إجمالي الباقي</div></div>
    <div class="sc"><div class="sv rd">${fmtN(t.cost)}</div><div class="sl">إجمالي التكلفة ﷼</div></div>
    <div class="sc"><div class="sv bl">${fmtN(t.revenue)}</div><div class="sl">إجمالي المبيعات ﷼</div></div>
    <div class="sc hi"><div class="sv ${t.profit>=0?'gr':'rd'}">${fmtN(t.profit)}</div><div class="sl">صافي الربح ﷼</div></div>
  </div>`;
}

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
      reorder: Math.round(reorderQty(x.sold, x.bought)), cost, price,
      soldPct: x.bought>0 ? Math.round((x.sold/x.bought)*100) : 0,
      frozenQty, frozenVal, revenue, profit,
    };
  });
}

function exportExcel(items, title) {
  const rows = buildRows(items);
  const header = ["Barcode / الباركود","Description / الصنف","Qty In / جاء","Sold / اتباع","Balance / باقي","Reorder / الاحتياج","Cost / التكلفة","Price ﷼ / السعر"];
  const csv = [header.join(",")].concat(
    rows.map(r => [r.barcode, `"${String(r.name).replace(/"/g,'""')}"`, r.qtyIn, r.sold, r.balance, r.reorder, r.cost, r.price].join(","))
  ).join("\n");
  downloadCsv(csv, title);
}

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

// ─── بوليصات التوزيع (كاشير 80mm) ────────────────────────────
function printPolicies(items, periods, images, brandName, closedBranches = [], paperSize = "80mm") {
  const slips = [];
  items.forEach(x => {
    const p = x.p;
    if (x.closing <= 0) return;
    const branchSales = {};
    periods.forEach(per => {
      Object.entries(per.sales ?? {}).forEach(([branch, d]) => {
        if (closedBranches.includes(branch)) return;
        const q = num(d[p.barcode]?.qty ?? 0);
        if (q > 0) branchSales[branch] = (branchSales[branch] ?? 0) + q;
      });
    });
    const branches = Object.entries(branchSales).map(([branch, sold]) => {
      const given = toDozen(sold);
      return { branch, sold, given, remaining: given - sold };
    }).sort((a,b)=>a.remaining-b.remaining);
    const hasNeed = branches.some(b => b.remaining < 7);
    if (!hasNeed) return;
    slips.push({ p, closing: x.closing, branches });
  });

  if (slips.length === 0) { alert("لا توجد منتجات تحتاج توزيع"); return; }
  const dnum = dateNum();
  const slipHtml = slips.map(s => {
    const img = images?.[s.p.barcode];
    const needyCount = s.branches.filter(b => b.remaining < 7).length;
    const rows = s.branches.map((b, i) => `
      <tr class="${b.remaining < 7 ? 'need' : ''}">
        <td class="rn">${i+1}</td>
        <td class="brc">${b.branch}</td><td class="qn">${b.sold}</td><td class="qn">${b.given}</td>
        <td class="qn">${b.remaining}${b.remaining < 7 ? ' ✅' : ''}</td></tr>`).join("");
    return `<div class="slip">
      <div class="hd">${brandName ?? "ALBAROO"}</div>
      <div class="dt">📅 ${dnum}</div>
      ${img ? `<img src="${img}" class="pimg"/>` : ''}
      <div class="pname">${s.p.name}</div>
      <svg class="bc" data-code="${s.p.barcode}"></svg>
      <div class="bcn">${s.p.barcode}</div>
      <div class="meta">🏭 ${getFactoryCode(s.p.barcode)} · 📦 ${s.p.container ?? ""}</div>
      <div class="stock">المتبقي بالمخزون / In Stock: <b>${fmtN(s.closing)}</b></div>
      <div class="needbar">🔴 فروع تحتاج توزيع / Branches need restock: <b>${needyCount}</b> من ${s.branches.length}</div>
      <table><tr><th>#</th><th>الفرع<br>Branch</th><th>باع<br>Sold</th><th>أخذ<br>Sent</th><th>باقي<br>Left</th></tr>${rows}</table>
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
      .slip{width:${slipW};background:#fff;margin:0 auto 8px;padding:${isA5?"16px 14px":"10px 8px"};page-break-after:always;page-break-inside:avoid;break-inside:avoid;text-align:center;border:1px dashed #999}
      .needbar{font-size:${isA5?"13px":"11px"};color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:5px;margin:6px 0;font-weight:700}
      .needbar b{font-size:${isA5?"18px":"15px"}}
      td.rn{font-weight:900;color:#888;background:#f8fafc;width:28px}
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
    <div class="tb"><button class="bk" onclick="window.close()">✕ إغلاق</button><button class="pr" onclick="window.print()">🖨️ طباعة (${slips.length})</button></div>
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

// ─── خطة النقل/التموين الاحترافية (كل المنتجات) ──────────────
function printTransferPlan(items, periods, title, brandName, images = {}, cityOverrides = {}, closedBranches = [], newBranches = []) {
  const bySource = {};
  const fromWarehouse = [];
  items.forEach(x => {
    const p = x.p;
    const branchSales = {};
    periods.forEach(per => {
      Object.entries(per.sales ?? {}).forEach(([branch, d]) => {
        if (closedBranches.includes(branch)) return;
        const q = num(d[p.barcode]?.qty ?? 0);
        if (q > 0) branchSales[branch] = (branchSales[branch] ?? 0) + q;
      });
    });
    const branches = Object.entries(branchSales).map(([branch, sold]) => {
      const given = toDozen(sold);
      return { branch, sold, given, remaining: given - sold };
    });
    const { transfers } = buildTransfers(branches, x.bought, cityOverrides, newBranches);
    transfers.forEach(t => {
      const dest = branches.find(b => b.branch === t.to) ?? { sold:0, given:0, remaining:0 };
      const detail = { toSold: dest.sold, toGiven: dest.given, toRemaining: dest.remaining };
      if (t.kind === "warehouse") {
        fromWarehouse.push({ name: p.name, barcode: p.barcode, to: t.to, qty: t.qty, ...detail });
      } else {
        if (!bySource[t.from]) bySource[t.from] = [];
        bySource[t.from].push({ name: p.name, barcode: p.barcode, to: t.to, qty: t.qty, sameCity: t.sameCity, toCity: t.toCity, ...detail });
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
      <table><thead><tr><th>✓</th><th>صورة</th><th>الصنف</th><th>الباركود</th><th>إلى فرع</th><th>باع</th><th>أخذ</th><th>باقي</th><th>الكمية</th></tr></thead><tbody>
      ${fromWarehouse.map(m=>`<tr><td class="chk">☐</td><td class="imgc">${imgCell(m.barcode)}</td><td class="nm">${m.name}</td><td class="bc">${m.barcode}</td><td class="to">${m.to}</td><td>${fmtN(m.toSold)}</td><td>${fmtN(m.toGiven)}</td><td>${fmtN(m.toRemaining)}</td><td class="q">${fmtN(m.qty)}</td></tr>`).join("")}
      </tbody></table></div>`;
  }

  const srcHtml = Object.entries(bySource).map(([src, moves]) => `
    <div class="sec">
      <div class="sech tr">🔀 نقل من فرع: ${src} <span class="cnt">${moves.length} صنف</span></div>
      <table><thead><tr><th>✓</th><th>صورة</th><th>الصنف</th><th>الباركود</th><th>إلى فرع</th><th>باع</th><th>أخذ</th><th>باقي</th><th>الكمية</th><th>المنطقة</th></tr></thead><tbody>
      ${moves.map(m=>`<tr><td class="chk">☐</td><td class="imgc">${imgCell(m.barcode)}</td><td class="nm">${m.name}</td><td class="bc">${m.barcode}</td><td class="to">${m.to}</td><td>${fmtN(m.toSold)}</td><td>${fmtN(m.toGiven)}</td><td>${fmtN(m.toRemaining)}</td><td class="q">${fmtN(m.qty)}</td><td class="${m.sameCity?'same':'diff'}">${m.sameCity?'نفس المدينة ✓':m.toCity}</td></tr>`).join("")}
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
      ${TABLE_HELP_CSS}
      .ftr{margin-top:24px;border-top:2px solid #e2e8f0;padding-top:16px;display:flex;justify-content:space-between}
      .sign{text-align:center;font-size:12px;color:#64748b}
      .sign .line{border-top:1px solid #94a3b8;width:160px;margin:30px auto 6px}
      .warn{text-align:center;color:#d97706;font-size:12px;margin-top:14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px}
      @media print{body{background:#fff}.tb{display:none}.page{margin:0;box-shadow:none;border-radius:0;max-width:100%}}
    </style></head><body>
    <div class="tb"><button class="bk" onclick="window.close()">✕ إغلاق</button><button class="pr" onclick="window.print()">🖨️ طباعة</button></div>
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
  const dnum = dateNum();
  const totReorder = rows.reduce((s,r)=>s+r.reorder,0);
  const totCost = rows.reduce((s,r)=>s+r.reorder*r.cost,0);
  const body = rows.map((r,i)=>{
    const img = images?.[r.barcode];
    const imgCell = img ? `<img src="${img}" class="thumb"/>` : `<div class="noimg">📦</div>`;
    return `
    <tr><td class="num">${i+1}</td><td class="imgc">${imgCell}</td><td>${r.barcode}</td><td class="desc">${r.name}</td>
    <td data-l="جاء">${fmtN(r.qtyIn)}</td><td data-l="باع">${fmtN(r.sold)}</td><td data-l="باقي">${fmtN(r.balance)}</td><td class="ro" data-l="احتياج">${fmtN(r.reorder)}</td>
    <td data-l="جملة">${fmtN(r.cost)}</td><td data-l="بيع">${fmtN(r.price)} ﷼</td>${finCells(r)}</tr>`;
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
      ${TABLE_HELP_CSS}
      ${REPORT_CSS}
    </style></head><body>
    <div class="tb"><button class="bk" onclick="window.close()">✕ إغلاق</button><button class="pr" onclick="window.print()">🖨️ طباعة</button></div>
    <div class="w">
      <h1>${title}</h1>
      <div class="date">📅 ${dnum} · ${brandName ?? "ALBAROO"} · ${rows.length} صنف</div>
      ${summaryBarHtml(rows)}
      <div class="tot" style="margin-top:0;margin-bottom:14px">
        <div><div class="v">${fmtN(totReorder)}</div><div class="l">إجمالي الاحتياج / Total Reorder</div></div>
        <div><div class="v">${fmtM(totCost)}</div><div class="l">تكلفة الطلب / Order Cost</div></div>
      </div>
      <table><thead><tr>
        <th>#</th><th>صورة<br>Image</th><th>Barcode<br>الباركود</th><th>Description<br>الصنف</th>
        <th>Qty In<br>جاء</th><th>Sold<br>اتباع</th><th>Balance<br>باقي</th><th>Reorder<br>الاحتياج</th>
        <th>Cost<br>التكلفة</th><th>Price ﷼<br>السعر</th>${FIN_HEADERS}
      </tr></thead><tbody>${body}</tbody></table>
      ${financeSummaryRows(rows)}
    </div></body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── عارض الصور الموحّد (فتح + تكبير + حفظ) ──────────────────
const ImageViewer = memo(({ src, name, onClose }) => {
  const save = async () => {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const fileName = (name || "image").replace(/[^\w\u0600-\u06FF]/g,"_") + ".jpg";
      if (navigator.canShare) {
        const file = new File([blob], fileName, { type: blob.type });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
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

// ─── كميات الكونتينرات ───────────────────────────────────────
const ContainerQtys = memo(({ product }) => {
  const conts = (product.purchases ?? [])
    .map(pu => ({ container: pu.container ?? product.container ?? "—", qty: num(pu.qty) }))
    .filter(c => c.qty > 0);
  if (conts.length === 0) return null;
  const map = {};
  conts.forEach(c => { map[c.container] = (map[c.container] ?? 0) + c.qty; });
  const list = Object.entries(map);
  return (
    <div className="flex gap-1 flex-wrap mt-1">
      {list.map(([cont, qty]) => (
        <span key={cont} className="text-xs px-2 py-0.5 rounded-lg bg-indigo-900/30 text-indigo-300">
          📦 {cont}: {fmtN(qty)}
        </span>
      ))}
    </div>
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
            Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
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
          () => {}
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
// بطاقة منتج مع الأعداد: جاء · باع · باقي
const StatCard = memo(({ h, images, onImg, bad }) => {
  const img = images?.[h.p.barcode];
  return (
    <div className={`bg-slate-950/60 rounded-xl p-2.5 border ${bad?"border-rose-900/30":"border-slate-800"}`}>
      <div className="flex items-center gap-3">
        {img
          ? <img src={img} alt="" onClick={()=>onImg({src:img,name:h.p.name})} className="w-14 h-14 rounded-lg object-cover bg-white cursor-pointer shrink-0" />
          : <div className="w-14 h-14 rounded-lg bg-slate-800 grid place-items-center text-2xl shrink-0">📦</div>}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-100 text-sm truncate">{h.p.name}{h.winner?" 🎉":""}{h.star?" ⭐":""}</div>
          <div className="font-mono text-sm font-black text-slate-300 tracking-wide">{h.p.barcode}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">🏭 {getFactoryCode(h.p.barcode)} · 🏷️ {getCategoryName(h.p.barcode, settings)}</div>
        </div>
        <div className="text-center shrink-0">
          <div className={`text-lg font-black ${h.soldPct<30?"text-rose-400":h.soldPct>70?"text-emerald-400":"text-slate-300"}`}>{fmtPct(h.soldPct)}</div>
          <div className="text-[9px] text-slate-500">بيع</div>
        </div>
      </div>
      {/* الأعداد: جاء · باع · باقي */}
      <div className="grid grid-cols-3 gap-1.5 mt-2.5">
        <div className="bg-blue-950/40 rounded-lg py-1.5 text-center">
          <div className="text-base font-black text-blue-300">{fmtN(h.bought)}</div>
          <div className="text-[9px] text-slate-500">جاء</div>
        </div>
        <div className="bg-amber-950/40 rounded-lg py-1.5 text-center">
          <div className="text-base font-black text-amber-300">{fmtN(h.sold)}</div>
          <div className="text-[9px] text-slate-500">باع</div>
        </div>
        <div className="bg-emerald-950/40 rounded-lg py-1.5 text-center">
          <div className="text-base font-black text-emerald-300">{fmtN(h.closing)}</div>
          <div className="text-[9px] text-slate-500">باقي</div>
        </div>
      </div>
      {h.margin !== undefined && (
        <div className="text-[11px] text-slate-500 mt-1.5 text-center">
          هامش الربح: <span className={h.margin<5?"text-rose-400 font-black":"text-slate-300 font-black"}>{fmtPct(h.margin)}</span>
        </div>
      )}
    </div>
  );
});

// ─── طباعة نتائج البحث ───────────────────────────────────────
// نسخة تعمل على rows (qtyIn/sold/cost/price) بستايل مدمج — لتقارير التوزيع/النقل/العام
function financeSummaryRows(rows) {
  let revenue = 0, costSold = 0, costAll = 0;
  (rows||[]).forEach(r => {
    const sold = num(r.sold ?? 0), qtyIn = num(r.qtyIn ?? 0);
    const price = num(r.price ?? 0), cost = num(r.cost ?? 0);
    revenue  += sold * price;
    costSold += sold * cost;
    costAll  += qtyIn * cost;
  });
  const profit = revenue - costSold;
  const box = (bg,bd,cl,val,lbl) => `<div style="flex:1;min-width:120px;background:${bg};border:1px solid ${bd};border-radius:11px;padding:12px;text-align:center"><b style="display:block;font-size:21px;font-weight:900;color:${cl}">${fmtN(val)}</b><span style="font-size:11px;color:#475569;font-weight:700">${lbl}</span></div>`;
  return `<div style="display:flex;gap:8px;margin:16px 0;flex-wrap:wrap">
    ${box("#ecfdf5","#a7f3d0","#059669",revenue,"💰 إجمالي المبيعات")}
    ${box("#fef2f2","#fecaca","#dc2626",costSold,"📤 تكلفة المُباع")}
    ${box("#eff6ff","#bfdbfe","#2563eb",costAll,"📦 تكلفة الكل")}
    ${box("#f5f3ff","#ddd6fe","#7c3aed",profit,"📈 الربح")}
  </div>`;
}

// CSS مشترك: رأس ثابت + يتكرر بالطباعة + تسمية صغيرة فوق كل رقم في الخلية
const TABLE_HELP_CSS = `
  thead{display:table-header-group}
  thead th{position:sticky;top:0;z-index:5}
  @media screen{thead th{position:sticky;top:56px}}
  tbody td[data-l]{position:relative;padding-top:16px !important}
  tbody td[data-l]::before{content:attr(data-l);position:absolute;top:2px;right:0;left:0;text-align:center;font-size:8px;font-weight:700;color:#94a3b8;line-height:1}
  @media print{tbody tr{page-break-inside:avoid}}
`;

// ─── ملخص مالي مشترك لتقارير الطباعة ─────────────────────────
// items: مصفوفة فيها {bought, sold, sell/buyPrice} — نحسب الأرقام الأربعة
function financeSummaryHtml(items) {
  let revenue = 0, costSold = 0, costAll = 0;
  items.forEach(it => {
    const sold = num(it.sold ?? 0);
    const bought = num(it.bought ?? 0);
    const sell = num(it.sell ?? it.p?.sellPrice ?? 0);
    const buy = num(it.buyPrice ?? it.p?.purchases?.slice(-1)[0]?.buyPrice ?? 0);
    revenue  += sold * sell;
    costSold += sold * buy;
    costAll  += bought * buy;
  });
  const profit = revenue - costSold;
  return `<div class="finsum">
    <div class="fs fs-rev"><b>${fmtN(revenue)}</b><span>💰 إجمالي المبيعات</span></div>
    <div class="fs fs-cs"><b>${fmtN(costSold)}</b><span>📤 تكلفة المُباع</span></div>
    <div class="fs fs-ca"><b>${fmtN(costAll)}</b><span>📦 تكلفة الكل</span></div>
    <div class="fs fs-pr"><b>${fmtN(profit)}</b><span>📈 الربح</span></div>
  </div>`;
}
const FINSUM_CSS = `
  .finsum{display:flex;gap:8px;margin:14px 0;flex-wrap:wrap}
  .fs{flex:1;min-width:120px;border-radius:11px;padding:12px;text-align:center;border:1px solid #e2e8f0}
  .fs b{display:block;font-size:21px;font-weight:900;margin-bottom:2px}
  .fs span{font-size:11px;color:#475569;font-weight:700}
  .fs-rev{background:#ecfdf5}.fs-rev b{color:#059669}
  .fs-cs{background:#fef2f2}.fs-cs b{color:#dc2626}
  .fs-ca{background:#eff6ff}.fs-ca b{color:#2563eb}
  .fs-pr{background:#f5f3ff}.fs-pr b{color:#7c3aed}
`;

function printSearchResults(results, calcItem, images, settings, query) {
  if (!results || results.length === 0) { alert("لا نتائج للطباعة"); return; }
  const { greg, hijri } = dateEN();
  const brandName = settings?.brandName ?? "ALBAROO";
  const finItems = results.map(p => { const x = calcItem(p); return { bought:x.bought, sold:x.sold, sell:num(p.sellPrice), buyPrice:num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0) }; });
  const rows = results.map((p, i) => {
    const x = calcItem(p);
    const sell = num(p.sellPrice);
    const whole = num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
    const fac = getFactoryCode(p.barcode);
    const facName = settings?.factories?.[fac] ?? "";
    const img = images?.[p.barcode];
    // 💰 التكلفة والإجمالي والربح لكل منتج
    const cost    = whole * x.bought;      // تكلفة الكمية اللي جت
    const revenue = sell * x.sold;         // إجمالي مبيعاته
    const profit  = (sell - whole) * x.sold; // ربحه الفعلي
    const pCls = profit > 0 ? "pf" : profit < 0 ? "ls" : "";
    return `<tr>
      <td class="c">${i+1}</td>
      <td class="im">${img?`<img src="${img}" />`:`<div class="ph">📦</div>`}</td>
      <td class="nm">${p.name ?? "—"}</td>
      <td class="bc">${p.barcode}</td>
      <td class="c fc">${fac}${facName?`<br><span class="fn">${facName}</span>`:""}</td>
      <td class="c b" data-l="جاء">${fmtN(x.bought)}</td>
      <td class="c s" data-l="باع">${fmtN(x.sold)}</td>
      <td class="c r" data-l="باقي">${fmtN(x.closing)}</td>
      <td class="c p" data-l="بيع">${fmtN(sell)}</td>
      <td class="c w" data-l="جملة">${fmtN(whole)}</td>
      <td class="c ct" data-l="تكلفة">${fmtN(cost)}</td>
      <td class="c tt" data-l="إجمالي">${fmtN(revenue)}</td>
      <td class="c ${pCls}" data-l="ربح">${fmtN(profit)}</td>
    </tr>`;
  }).join("");

  const totalBought = results.reduce((s,p)=>s+calcItem(p).bought,0);
  const totalSold   = results.reduce((s,p)=>s+calcItem(p).sold,0);
  const totalRem    = results.reduce((s,p)=>s+calcItem(p).closing,0);
  // 💰 إجماليات المال
  const totalCost = results.reduce((s,p)=>{
    const x = calcItem(p); return s + num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0) * x.bought; },0);
  const totalRevenue = results.reduce((s,p)=>{
    const x = calcItem(p); return s + num(p.sellPrice) * x.sold; },0);
  const totalProfit = results.reduce((s,p)=>{
    const x = calcItem(p);
    const w = num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
    return s + (num(p.sellPrice) - w) * x.sold; },0);

  // شريط الإجماليات — يطلع أول الصفحة
  const summaryBar = `<div class="sumbar">
    <div class="sc"><div class="sv bl">${fmtN(totalBought)}</div><div class="sl">إجمالي الوارد</div></div>
    <div class="sc"><div class="sv or">${fmtN(totalSold)}</div><div class="sl">إجمالي المباع</div></div>
    <div class="sc"><div class="sv gr">${fmtN(totalRem)}</div><div class="sl">إجمالي الباقي</div></div>
    <div class="sc"><div class="sv rd">${fmtN(totalCost)}</div><div class="sl">إجمالي التكلفة ﷼</div></div>
    <div class="sc"><div class="sv bl">${fmtN(totalRevenue)}</div><div class="sl">إجمالي المبيعات ﷼</div></div>
    <div class="sc hi"><div class="sv ${totalProfit>=0?'gr':'rd'}">${fmtN(totalProfit)}</div><div class="sl">صافي الربح ﷼</div></div>
  </div>`;

  const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>نتائج البحث</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
    *{font-family:'Cairo',sans-serif;box-sizing:border-box;margin:0;padding:0}
    body{background:#fff;color:#111;padding:14px}
    .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}
    .brand{font-size:20px;font-weight:900}
    .ttl{font-size:13px;color:#555;margin-top:2px}
    .dt{font-size:11px;color:#666;text-align:left;line-height:1.6}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#111;color:#fff;padding:7px 4px;font-size:11px;font-weight:900}
    td{border-bottom:1px solid #e5e5e5;padding:6px 4px;vertical-align:middle}
    tbody tr:nth-child(even){background:#f4f6f9}
    tbody tr:nth-child(odd){background:#fff}
    .ct{color:#7c3aed;font-weight:900}
    .tt{color:#0891b2;font-weight:900}
    .pf{color:#059669;font-weight:900}
    .ls{color:#dc2626;font-weight:900}
    .sumbar{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}
    .sc{flex:1 1 15%;background:#f4f6f9;border:1px solid #dde3ea;border-radius:9px;padding:9px 6px;text-align:center;min-width:95px}
    .sc.hi{background:#eefaf3;border-color:#a7e0c3;border-width:2px}
    .sv{font-size:19px;font-weight:900;line-height:1.1}
    .sl{font-size:10px;color:#666;margin-top:3px;font-weight:700}
    .sv.bl{color:#2563eb}.sv.or{color:#d97706}.sv.gr{color:#059669}.sv.rd{color:#dc2626}
    .c{text-align:center}
    .im{width:44px}.im img{width:38px;height:38px;object-fit:cover;border-radius:5px;display:block}
    .ph{width:38px;height:38px;background:#f0f0f0;border-radius:5px;display:flex;align-items:center;justify-content:center}
    .nm{font-weight:700;max-width:150px}
    .bc{font-family:monospace;font-size:13px;font-weight:900;letter-spacing:0.5px}
    .fc{font-size:11px;color:#2563eb;font-weight:700}.fn{font-size:9px;color:#666;font-weight:400}
    .b{color:#2563eb;font-weight:900}
    .s{color:#d97706;font-weight:900}
    .r{color:#059669;font-weight:900}
    .p{color:#059669;font-weight:900}
    .w{color:#dc2626;font-weight:900}
    tfoot td{background:#f5f5f5;font-weight:900;border-top:2px solid #111}
    ${FINSUM_CSS}
    .tb{position:fixed;top:0;left:0;right:0;background:#0f172a;padding:10px;display:flex;gap:10px;justify-content:center;z-index:99}
    .tb button{font-family:'Cairo';font-size:14px;font-weight:700;border:none;border-radius:10px;padding:10px 20px;cursor:pointer}
    .bk{background:#334155;color:#fff}.pr{background:#059669;color:#fff}
    .wrap{margin-top:62px}
    @media print{body{padding:0}.tb{display:none}.wrap{margin-top:0}@page{margin:8mm}}
  </style></head><body>
    <div class="tb"><button class="bk" onclick="window.close()">✕ إغلاق</button><button class="pr" onclick="window.print()">🖨️ طباعة</button></div>
    <div class="wrap">
    <div class="hd">
      <div><div class="brand">${brandName}</div><div class="ttl">🔍 نتائج البحث${query?` — "${query}"`:""} (${results.length} منتج)</div></div>
      <div class="dt">${greg}<br>${hijri}</div>
    </div>
    ${summaryBar}
    <table>
      <thead><tr>
        <th>#</th><th>صورة</th><th>المنتج</th><th>الباركود</th><th>المصنع</th>
        <th>جاء</th><th>باع</th><th>باقي</th><th>بيع ﷼</th><th>جملة ﷼</th>
        <th>التكلفة ﷼</th><th>الإجمالي ﷼</th><th>الربح ﷼</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${financeSummaryHtml(finItems)}
    </div>
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("اسمح بالنوافذ المنبثقة للطباعة"); return; }
  w.document.write(html);
  w.document.close();
}

const ProductDetail = memo(({ product, periods, images, settings, onBack }) => {
  const [sortMode, setSortMode] = useState("need");
  const [counts, setCounts] = useState(null);
  const [txData, setTxData] = useState(null);
  useEffect(() => {
    loadBranchCounts().then(setCounts).catch(()=>setCounts(null));
    loadTransfers().then(setTxData).catch(()=>setTxData(null));
  }, []);
  const data = useMemo(() => {
    const overrides = settings?.stockOverrides ?? {};
    const minStock = settings?.minStock ?? MIN;
    const branchSales = {};
    periods.forEach(per => {
      Object.entries(per.sales ?? {}).forEach(([branch, d]) => {
        const q = num(d[product.barcode]?.qty ?? 0);
        if (q > 0) branchSales[branch] = (branchSales[branch] ?? 0) + q;
      });
    });
    const branches = Object.entries(branchSales).map(([branch, sold]) => {
      const given = toDozen(sold);
      // 🎯 موحّد مع المستودع والسمارت: الجرد + الترحيل
      const remaining = getBranchRemaining(branch, product.barcode, periods, overrides, minStock, counts, txData);
      return { branch, sold, given, remaining };
    });
    const bought  = totalPurchases(product);
    const sold    = soldAllPeriods(product.barcode, periods);
    const closing = Math.max(0, bought - sold);
    const conts = (product.purchases ?? []).map(pu => ({
      container: pu.container ?? product.container ?? "—", qty: num(pu.qty),
    })).filter(c => c.qty > 0);
    return { branches, bought, sold, closing, conts };
  }, [product, periods, counts, txData, settings]);

  const img = images?.[product.barcode];
  const factory = getFactoryCode(product.barcode);
  const facName = settings?.factories?.[factory] ?? "";

  const { transfers, warehouse } = useMemo(
    () => buildTransfers(data.branches, data.bought, settings?.cityOverrides ?? {}, settings?.newBranches ?? []),
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
    const dnum = dateNum();
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
      <div class="tb"><button class="bk" onclick="window.close()">✕ إغلاق</button><button class="pr" onclick="window.print()">🖨️ طباعة</button></div>
      <div class="w">
        <div class="nm">${product.name}</div>
        <div class="date">📅 ${dnum} · ${settings?.brandName ?? "ALBAROO"}</div>
        <div class="hd">
          ${img ? `<img src="${img}"/>` : `<div style="width:110px;height:110px;border-radius:12px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:40px">📦</div>`}
          <div class="bc"><svg id="bcsvg"></svg><div class="bcnum">${product.barcode}</div>
          <div class="meta">🏭 ${factory}${facName?` · ${facName}`:""} · 🏷️ ${getCategoryName(product.barcode, settings)} · 📦 ${product.container ?? ""}</div></div>
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

// ─── منتجات المصنع (مع اختيار للعرض) ─────────────────────────
const ProductList = memo(({ items, images, periods, settings, redMax, greenMin, onSelect, onBack, title, factoryCode, factoryName, onSaveFactoryName }) => {
  const [search, setSearch] = useState("");
  const [scan, setScan] = useState(false);
  const [viewImg, setViewImg] = useState(null);
  const [visible, setVisible] = useState(30);
  const [editName, setEditName] = useState(false);
  const [nameInput, setNameInput] = useState(factoryName ?? "");
  const [picked, setPicked] = useState([]);          // باركودات مختارة للعرض
  const [showOffer, setShowOffer] = useState(false);  // شاشة منشئ العرض
  const [prodSort, setProdSort] = useState("none");   // none | best | worst
  const togglePick = (bc) => setPicked(s => s.includes(bc) ? s.filter(x=>x!==bc) : [...s, bc]);

  const filtered = useMemo(() => {
    let list = items;
    if (search) {
      const q = search.trim();
      list = items.filter(x => {
        const fac = getFactoryCode(x.p.barcode);
        const facName = settings?.factories?.[fac] ?? "";
        return arabicIncludes(x.p.name, q)
            || x.p.barcode.includes(q)
            || fac.includes(q)                       // رقم المصنع
            || arabicIncludes(facName, q);           // اسم المصنع
      });
    }
    // ترتيب بالأفضل أو الأضعف مبيعاً (نسبة البيع)
    if (prodSort !== "none" && list.length > 1) {
      const pctOf = (x) => x.bought > 0 ? (x.sold / x.bought) * 100 : null;
      list = [...list].sort((a,b) => {
        const pa = pctOf(a), pb = pctOf(b);
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;      // اللي ما له مشتريات آخر القائمة
        if (pb === null) return -1;
        return prodSort === "best" ? pb - pa : pa - pb;
      });
    }
    return list;
  }, [items, search, settings, prodSort]);

  // المنتجات المختارة بكامل معلوماتها للعرض
  const pickedItems = useMemo(
    () => picked.map(bc => {
      const x = items.find(i => i.p.barcode === bc);
      if (!x) return null;
      return {
        barcode: x.p.barcode, name: x.p.name, container: x.p.container,
        sellPrice: num(x.p.sellPrice), buyPrice: num(x.p.purchases?.slice(-1)[0]?.buyPrice ?? 0),
        bought: x.bought, sold: x.sold, closing: x.closing, soldPct: x.soldPct,
      };
    }).filter(Boolean),
    [picked, items]
  );

  const colorOf = (soldPct) => {
    if (soldPct < redMax)   return { border:"#ef4444", txt:"#ef4444", bg:"rgba(239,68,68,0.08)" };
    if (soldPct < greenMin) return { border:"#f59e0b", txt:"#f59e0b", bg:"rgba(245,158,11,0.08)" };
    return { border:"#22c55e", txt:"#22c55e", bg:"rgba(34,197,94,0.08)" };
  };

  // شاشة منشئ العرض
  if (showOffer) {
    return <OfferBuilder items={pickedItems} images={images} settings={settings} onClose={()=>setShowOffer(false)} />;
  }

  return (
    <div className="space-y-3">
      {scan && <BarcodeScanner onDetect={(code)=>{ setSearch(code); setScan(false); }} onClose={()=>setScan(false)} />}
      {viewImg && <ImageViewer src={viewImg.src} name={viewImg.name} onClose={()=>setViewImg(null)} />}
      <button onClick={onBack} className="text-blue-400 font-bold text-sm">← رجوع</button>
      {factoryCode ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
          {editName ? (
            <div className="flex gap-2 items-center">
              <span className="text-slate-400 font-mono text-sm shrink-0">🏭 {factoryCode}</span>
              <input value={nameInput} onChange={e=>setNameInput(e.target.value)} autoFocus placeholder="اسم المصنع…"
                className="flex-1 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
              <button onClick={async()=>{ await onSaveFactoryName?.(factoryCode, nameInput.trim()); setEditName(false); }}
                className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold shrink-0">حفظ</button>
              <button onClick={()=>{ setNameInput(factoryName??""); setEditName(false); }}
                className="bg-slate-600 text-white px-2 py-1.5 rounded-lg text-sm shrink-0">✕</button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="font-black text-slate-100">🏭 {factoryCode}{factoryName?` · ${factoryName}`:""}</div>
              <button onClick={()=>{ setNameInput(factoryName??""); setEditName(true); }}
                className="text-blue-400 text-sm font-bold shrink-0">✏️ تعديل الاسم</button>
            </div>
          )}
        </div>
      ) : (
        <div className="font-black text-slate-100">{title}</div>
      )}

      <div className="flex gap-2">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 بحث بالاسم أو الباركود أو المصنع…"
          className="flex-1 bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
        <button onClick={()=>setScan(true)} className="bg-blue-600 text-white px-4 rounded-xl font-bold">📷</button>
      </div>

      {filtered.length > 1 && (
        <div className="flex gap-2">
          <button onClick={()=>setProdSort(prodSort==="best" ? "none" : "best")}
            className={`flex-1 py-2 rounded-xl text-xs font-black border transition ${
              prodSort==="best" ? "bg-emerald-600 text-white border-emerald-500"
                                : "bg-slate-800 text-emerald-400 border-slate-600"}`}>
            🔥 الأفضل مبيعاً
          </button>
          <button onClick={()=>setProdSort(prodSort==="worst" ? "none" : "worst")}
            className={`flex-1 py-2 rounded-xl text-xs font-black border transition ${
              prodSort==="worst" ? "bg-red-600 text-white border-red-500"
                                 : "bg-slate-800 text-red-400 border-slate-600"}`}>
            📉 الأضعف مبيعاً
          </button>
        </div>
      )}
      {prodSort !== "none" && (
        <div className="text-xs text-slate-400 -mt-1">
          {filtered.length} منتج ·
          <span className={prodSort==="best" ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
            {prodSort==="best" ? " مرتّبة بالأفضل مبيعاً" : " مرتّبة بالأضعف مبيعاً"}
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <button onClick={()=>exportExcel(filtered, title.replace(/[^\w\u0600-\u06FF]/g,"_"))} className="bg-emerald-600 text-white py-2.5 rounded-xl text-xs font-bold">📊 طلب</button>
        <button onClick={()=>exportExcelFull(filtered, title.replace(/[^\w\u0600-\u06FF]/g,"_"))} className="bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-bold">📊 كامل</button>
        <button onClick={()=>printReport(filtered, title, "ALBAROO", images)} className="bg-slate-700 border border-slate-600 text-slate-200 py-2.5 rounded-xl text-xs font-bold">🖨️ تقرير</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={()=>printPolicies(filtered, periods, images, "ALBAROO", settings?.closedBranches ?? [], "80mm")} className="bg-purple-600 text-white py-2.5 rounded-xl text-sm font-bold">🏷️ بوليصات 80mm</button>
        <button onClick={()=>printPolicies(filtered, periods, images, "ALBAROO", settings?.closedBranches ?? [], "A5")} className="bg-purple-700 text-white py-2.5 rounded-xl text-sm font-bold">🏷️ بوليصات A5</button>
      </div>
      <button onClick={()=>printTransferPlan(filtered, periods, title, "ALBAROO", images, settings?.cityOverrides ?? {}, settings?.closedBranches ?? [], settings?.newBranches ?? [])} className="w-full bg-orange-600 text-white py-2.5 rounded-xl text-sm font-bold mt-2">🔀 خطة النقل بين الفروع</button>
      <div className="text-xs text-slate-500">{filtered.length} منتج · اضغط ✓ لاختيار منتجات للعرض</div>

      <div className="space-y-2">
        {filtered.slice(0, visible).map(x => {
          const soldOut = x.closing <= 0;
          const c = soldOut
            ? { border:"#64748b", txt:"#94a3b8", bg:"rgba(100,116,139,0.12)" }
            : colorOf(x.soldPct);
          const conts = [...new Set((x.p.purchases ?? []).map(pu => pu.container ?? x.p.container).filter(Boolean))];
          const isDup = conts.length > 1;
          const isPicked = picked.includes(x.p.barcode);
          return (
            <div key={x.p.barcode} style={{
              background:c.bg,
              border: isPicked ? "2px solid #d4a853" : soldOut ? "1.5px solid #64748b" : isDup ? "2px solid #a855f7" : `1.5px solid ${c.border}`,
              borderRadius:"14px",padding:"12px",position:"relative",
              opacity: soldOut ? 0.7 : 1
            }}>
              {soldOut && (
                <div style={{position:"absolute",top:"-9px",left:"10px",background:"#64748b",color:"#fff",fontSize:"10px",fontWeight:"900",padding:"2px 8px",borderRadius:"100px"}}>SOLD OUT</div>
              )}
              {!soldOut && isDup && (
                <div style={{position:"absolute",top:"-9px",left:"10px",background:"#a855f7",color:"#fff",fontSize:"10px",fontWeight:"900",padding:"2px 8px",borderRadius:"100px"}}>🔁 مكرر · {conts.length} كونتينر</div>
              )}
              <div className="flex items-start gap-3">
                {/* زر اختيار للعرض */}
                <button onClick={(e)=>{e.stopPropagation(); togglePick(x.p.barcode);}} className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center font-black mt-1"
                  style={{background:isPicked?"#d4a853":"rgba(255,255,255,0.08)",color:isPicked?"#0a0804":"transparent",fontSize:"16px",border:"none",cursor:"pointer"}}>✓</button>
                {images?.[x.p.barcode]
                  ? <img src={images[x.p.barcode]} alt="" onClick={(e)=>{e.stopPropagation(); setViewImg({src:images[x.p.barcode], name:x.p.name});}} className="w-14 h-14 rounded-lg object-cover shrink-0" style={{filter:soldOut?"grayscale(1)":"none"}} />
                  : <div className="w-14 h-14 rounded-lg bg-slate-700 flex items-center justify-center text-xl shrink-0">📦</div>}
                <div className="flex-1 min-w-0" onClick={()=>onSelect(x.p)} style={{cursor:"pointer"}}>
                  <div className="font-bold text-slate-100 text-sm leading-tight">{x.p.name}</div>
                  <div className="mt-1" onClick={e=>e.stopPropagation()}><CopyBarcode barcode={x.p.barcode} /></div>
                  <div className="text-xs text-blue-400 mt-1">🏭 {getFactoryCode(x.p.barcode)}{(settings?.factories?.[getFactoryCode(x.p.barcode)])?` · ${settings.factories[getFactoryCode(x.p.barcode)]}`:""} · 🏷️ {getCategoryName(x.p.barcode, settings)}</div>
                  <ContainerQtys product={x.p} />
                </div>
                <div onClick={()=>onSelect(x.p)} style={{fontSize:"20px",fontWeight:"900",color:c.txt,cursor:"pointer"}} className="shrink-0">{fmtPct(x.soldPct)}</div>
              </div>
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

      {/* شريط أنشئ عرض */}
      {picked.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 px-4 z-40" style={{maxWidth:"480px",margin:"0 auto"}}>
          <div className="flex gap-2">
            <button onClick={()=>setPicked([])} className="px-4 py-3.5 rounded-2xl bg-slate-700 text-slate-300 text-sm font-bold border border-slate-600">✕</button>
            <button onClick={()=>setShowOffer(true)}
              className="flex-1 py-3.5 rounded-2xl border-none text-black font-black text-base"
              style={{background:"linear-gradient(135deg,#d4a853,#b8935a)",boxShadow:"0 8px 24px rgba(0,0,0,0.4)"}}>
              🏷️ أنشئ عرض ({picked.length})
            </button>
          </div>
        </div>
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

      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 بحث برقم المصنع أو اسمه…"
        className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />

      <div className="grid grid-cols-3 gap-2">
        <button onClick={()=>exportExcel(allItems, container)} className="bg-emerald-600 text-white py-2.5 rounded-xl text-xs font-bold">📊 طلب</button>
        <button onClick={()=>exportExcelFull(allItems, container)} className="bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-bold">📊 كامل</button>
        <button onClick={()=>printReport(allItems, `كونتينر ${container}`, "ALBAROO", images)} className="bg-slate-700 border border-slate-600 text-slate-200 py-2.5 rounded-xl text-xs font-bold">🖨️ تقرير</button>
      </div>
      <button onClick={()=>printTransferPlan(allItems, periods, `كونتينر ${container}`, "ALBAROO", images, settings?.cityOverrides ?? {}, settings?.closedBranches ?? [], settings?.newBranches ?? [])} className="w-full bg-orange-600 text-white py-2.5 rounded-xl text-sm font-bold">🔀 خطة النقل بين الفروع</button>

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

// ─── تقرير الأبطال المتكامل ──────────────────────────────────
function printHeroesReport(groups, contNames, images, brandName, onlyCont = null) {
  if (onlyCont) { contNames = [onlyCont]; }
  const d = new Date();
  const dnum = (d.getDate()+"").padStart(2,"0")+"/"+(d.getMonth()+1+"").padStart(2,"0")+"/"+d.getFullYear();
  const total = contNames.reduce((s,c)=>s+groups[c].length,0);
  if (total === 0) { alert("لا أبطال للطباعة"); return; }
  const imgCell = (bc) => {
    const im = images?.[bc];
    return im ? `<img src="${im}" class="th"/>` : `<div class="noimg">📦</div>`;
  };
  const sections = contNames.map(cont => {
    const list = groups[cont];
    const rows = list.map(h => `
      <tr>
        <td class="imgc">${imgCell(h.p.barcode)}</td>
        <td class="nm">${h.p.name} ${h.winner?'🎉':''}${h.star?'⭐':''}</td>
        <td class="bc">${h.p.barcode}</td>
        <td data-l="جاء">${fmtN(h.bought)}</td><td data-l="باع">${fmtN(h.sold)}</td><td data-l="باقي">${fmtN(h.closing)}</td>
        <td class="pct" data-l="نسبة">${fmtPct(h.soldPct)}</td><td class="mrg" data-l="هامش">${Math.round(h.margin)}%</td>
        <td data-l="جملة">${fmtN(h.buyPrice)}</td><td data-l="بيع">${fmtN(num(h.p.sellPrice))}</td>${finCellsH(h)}
      </tr>`).join("");
    return `<div class="sec">
      <div class="sech">📦 ${cont} <span class="cnt">${list.length} بطل</span></div>
      ${summaryBarH(list)}
      <table><thead><tr><th>صورة</th><th>الصنف</th><th>الباركود</th><th>جاء</th><th>باع</th><th>باقي</th><th>نسبة</th><th>هامش</th><th>شراء</th><th>بيع</th>${FIN_HEADERS}</tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }).join("");
  const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>تقرير الأبطال</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
      *{font-family:'Cairo',sans-serif;box-sizing:border-box;margin:0;padding:0}
      body{background:#f1f5f9;color:#1a1a1a}
      .tb{position:fixed;top:0;left:0;right:0;background:#0f172a;padding:10px;display:flex;gap:10px;justify-content:center;z-index:99}
      .tb button{font-family:'Cairo';font-size:14px;font-weight:700;border:none;border-radius:10px;padding:10px 20px;cursor:pointer}
      .bk{background:#334155;color:#fff}.pr{background:#d4a853;color:#0a0804}
      .page{max-width:900px;margin:70px auto 30px;background:#fff;padding:24px;border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
      .hd{display:flex;justify-content:space-between;border-bottom:3px solid #d4a853;padding-bottom:14px;margin-bottom:18px}
      .brand{font-size:26px;font-weight:900;color:#0f172a;letter-spacing:2px}
      .ttl{font-size:15px;color:#b8935a;margin-top:2px;font-weight:700}
      .ref{text-align:left;font-size:13px;color:#64748b}
      .sec{margin-bottom:22px;page-break-inside:avoid}
      .sech{background:linear-gradient(135deg,#d4a853,#b8935a);color:#0a0804;padding:11px 16px;border-radius:10px 10px 0 0;font-weight:900;font-size:15px;display:flex;justify-content:space-between;align-items:center}
      .cnt{font-size:12px;background:rgba(10,8,4,0.15);padding:3px 10px;border-radius:100px}
      table{width:100%;border-collapse:collapse}
      th{background:#e2e8f0;padding:8px 4px;font-size:11px;color:#334155}
      td{border:1px solid #e2e8f0;padding:6px 4px;text-align:center;font-size:12px;vertical-align:middle}
      td.imgc{width:50px;padding:3px}
      .th{width:46px;height:46px;object-fit:cover;border-radius:7px;border:1px solid #e2e8f0}
      .noimg{width:46px;height:46px;display:flex;align-items:center;justify-content:center;font-size:20px;background:#f1f5f9;border-radius:7px;margin:0 auto}
      td.nm{text-align:right;font-weight:700;color:#0f172a;font-size:13px}
      td.bc{font-family:monospace;font-size:10px;color:#64748b}
      td.pct{color:#16a34a;font-weight:900;font-size:14px}
      td.mrg{color:#7c3aed;font-weight:900}
      tr:nth-child(even) td{background:#fafbfc}
      ${TABLE_HELP_CSS}
      ${FINSUM_CSS}
      @media print{body{background:#fff}.tb{display:none}.page{margin:0;box-shadow:none;border-radius:0;max-width:100%}}
    
      ${REPORT_CSS}
    </style></head><body>
    <div class="tb"><button class="bk" onclick="window.close()">✕ إغلاق</button><button class="pr" onclick="window.print()">🖨️ طباعة</button></div>
    <div class="page">
      <div class="hd">
        <div><div class="brand">${brandName ?? "ALBAROO"}</div><div class="ttl">⭐ تقرير الأبطال${onlyCont?` — 📦 ${onlyCont}`:" — المنتجات الرابحة والمفضّلة"}</div></div>
        <div class="ref">📅 ${dnum}<br><b>${total}</b> بطل · ${contNames.length} كونتينر</div>
      </div>
      ${financeSummaryHtml(contNames.flatMap(c=>groups[c]))}
      ${sections}
    </div></body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── تقرير فئة واحدة ─────────────────────────────────────────
function printCategoryReport(cat, catName, images, brandName) {
  const d = new Date();
  const dnum = (d.getDate()+"").padStart(2,"0")+"/"+(d.getMonth()+1+"").padStart(2,"0")+"/"+d.getFullYear();
  const title = cat.code + (catName ? ` · ${catName}` : "");
  const imgCell = (bc) => { const im = images?.[bc]; return im ? `<img src="${im}" class="th"/>` : `<div class="noimg">📦</div>`; };
  const rows = cat.items.map(h => `
    <tr>
      <td class="imgc">${imgCell(h.p.barcode)}</td>
      <td class="nm">${h.p.name}</td>
      <td class="bc">${h.p.barcode}</td>
      <td data-l="جاء">${fmtN(h.bought)}</td><td data-l="باع">${fmtN(h.sold)}</td><td data-l="باقي">${fmtN(h.closing)}</td>
      <td class="pct" data-l="نسبة">${fmtPct(h.soldPct)}</td><td data-l="هامش">${Math.round(h.margin)}%</td>
      <td data-l="جملة">${fmtN(h.buyPrice)}</td><td data-l="بيع">${fmtN(h.sell)}</td>${finCellsH(h)}
    </tr>`).join("");
  const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>فئة ${title}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
      *{font-family:'Cairo',sans-serif;box-sizing:border-box;margin:0;padding:0}
      body{background:#f1f5f9;color:#1a1a1a}
      .tb{position:fixed;top:0;left:0;right:0;background:#312e81;padding:10px;display:flex;gap:10px;justify-content:center;z-index:99}
      .tb button{font-family:'Cairo';font-size:14px;font-weight:700;border:none;border-radius:10px;padding:10px 20px;cursor:pointer}
      .bk{background:#334155;color:#fff}.pr{background:#4f46e5;color:#fff}
      .page{max-width:900px;margin:70px auto 30px;background:#fff;padding:24px;border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
      .hd{display:flex;justify-content:space-between;border-bottom:3px solid #4f46e5;padding-bottom:14px;margin-bottom:18px}
      .brand{font-size:26px;font-weight:900;color:#0f172a;letter-spacing:2px}
      .ttl{font-size:16px;color:#4f46e5;margin-top:2px;font-weight:900}
      .ref{text-align:left;font-size:13px;color:#64748b}
      .sum{display:flex;gap:10px;margin-bottom:18px}
      .sc{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:11px;text-align:center}
      .sc b{display:block;font-size:20px;font-weight:900;color:#4f46e5}
      .sc span{font-size:11px;color:#64748b}
      ${FINSUM_CSS}
      table{width:100%;border-collapse:collapse}
      th{background:#e2e8f0;padding:8px 4px;font-size:11px;color:#334155}
      td{border:1px solid #e2e8f0;padding:6px 4px;text-align:center;font-size:12px;vertical-align:middle}
      td.imgc{width:50px;padding:3px}
      .th{width:46px;height:46px;object-fit:cover;border-radius:7px;border:1px solid #e2e8f0}
      .noimg{width:46px;height:46px;display:flex;align-items:center;justify-content:center;font-size:20px;background:#f1f5f9;border-radius:7px;margin:0 auto}
      td.nm{text-align:right;font-weight:700;color:#0f172a;font-size:13px}
      td.bc{font-family:monospace;font-size:12px;font-weight:900}
      td.pct{color:#4f46e5;font-weight:900;font-size:14px}
      tr:nth-child(even) td{background:#fafbfc}
      ${TABLE_HELP_CSS}
      @media print{body{background:#fff}.tb{display:none}.page{margin:0;box-shadow:none;border-radius:0;max-width:100%}}
    
      ${REPORT_CSS}
    </style></head><body>
    <div class="tb"><button class="bk" onclick="window.close()">✕ إغلاق</button><button class="pr" onclick="window.print()">🖨️ طباعة</button></div>
    <div class="page">
      <div class="hd">
        <div><div class="brand">${brandName ?? "ALBAROO"}</div><div class="ttl">🏷️ فئة ${title}</div></div>
        <div class="ref">📅 ${dnum}<br><b>${cat.items.length}</b> منتج</div>
      </div>
      <div class="sum">
        <div class="sc"><b>${fmtN(cat.bought)}</b><span>جاء</span></div>
        <div class="sc"><b>${fmtN(cat.sold)}</b><span>باع</span></div>
        <div class="sc"><b>${fmtPct(cat.soldPct)}</b><span>نسبة البيع</span></div>
        <div class="sc"><b>${Math.round(cat.margin)}%</b><span>هامش</span></div>
        <div class="sc"><b>${fmtM(cat.profit)}</b><span>ربح</span></div>
      </div>
      ${summaryBarH(cat.items)}
      <table>
        <thead><tr><th>صورة</th><th>المنتج</th><th>الباركود</th><th>جاء</th><th>باع</th><th>باقي</th><th>نسبة</th><th>هامش</th><th>جملة</th><th>بيع</th>${FIN_HEADERS}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${financeSummaryHtml(cat.items)}
    </div></body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── تقرير السيئين المتكامل ──────────────────────────────────
function printBadReport(groups, contNames, images, brandName, onlyCont = null) {
  if (onlyCont) { contNames = [onlyCont]; }
  const d = new Date();
  const dnum = (d.getDate()+"").padStart(2,"0")+"/"+(d.getMonth()+1+"").padStart(2,"0")+"/"+d.getFullYear();
  const total = contNames.reduce((s,c)=>s+groups[c].length,0);
  if (total === 0) { alert("لا منتجات سيئة للطباعة"); return; }
  const imgCell = (bc) => {
    const im = images?.[bc];
    return im ? `<img src="${im}" class="th"/>` : `<div class="noimg">📦</div>`;
  };
  const sections = contNames.map(cont => {
    const list = groups[cont];
    const rows = list.map(h => `
      <tr>
        <td class="imgc">${imgCell(h.p.barcode)}</td>
        <td class="nm">${h.p.name} ${h.soldPct<30?'🐌':''}${h.margin<5?'📉':''}</td>
        <td class="bc">${h.p.barcode}</td>
        <td data-l="جاء">${fmtN(h.bought)}</td><td data-l="باع">${fmtN(h.sold)}</td><td data-l="باقي">${fmtN(h.closing)}</td>
        <td class="pct" data-l="نسبة">${fmtPct(h.soldPct)}</td><td class="mrg" data-l="هامش">${Math.round(h.margin)}%</td>
        <td data-l="جملة">${fmtN(h.buyPrice)}</td><td data-l="بيع">${fmtN(num(h.p.sellPrice))}</td>${finCellsH(h)}
      </tr>`).join("");
    return `<div class="sec">
      <div class="sech">📦 ${cont} <span class="cnt">${list.length} منتج</span></div>
      ${summaryBarH(list)}
      <table><thead><tr><th>صورة</th><th>الصنف</th><th>الباركود</th><th>جاء</th><th>باع</th><th>باقي</th><th>نسبة</th><th>هامش</th><th>جملة</th><th>بيع</th>${FIN_HEADERS}</tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }).join("");
  const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>تقرير السيئين</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
      *{font-family:'Cairo',sans-serif;box-sizing:border-box;margin:0;padding:0}
      body{background:#f1f5f9;color:#1a1a1a}
      .tb{position:fixed;top:0;left:0;right:0;background:#0f172a;padding:10px;display:flex;gap:10px;justify-content:center;z-index:99}
      .tb button{font-family:'Cairo';font-size:14px;font-weight:700;border:none;border-radius:10px;padding:10px 20px;cursor:pointer}
      .bk{background:#334155;color:#fff}.pr{background:#e11d48;color:#fff}
      .page{max-width:900px;margin:70px auto 30px;background:#fff;padding:24px;border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
      .hd{display:flex;justify-content:space-between;border-bottom:3px solid #e11d48;padding-bottom:14px;margin-bottom:18px}
      .brand{font-size:26px;font-weight:900;color:#0f172a;letter-spacing:2px}
      .ttl{font-size:15px;color:#e11d48;margin-top:2px;font-weight:700}
      .ref{text-align:left;font-size:13px;color:#64748b}
      .sec{margin-bottom:22px;page-break-inside:avoid}
      .sech{background:linear-gradient(135deg,#e11d48,#9f1239);color:#fff;padding:11px 16px;border-radius:10px 10px 0 0;font-weight:900;font-size:15px;display:flex;justify-content:space-between;align-items:center}
      .cnt{font-size:12px;background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:100px}
      table{width:100%;border-collapse:collapse}
      th{background:#e2e8f0;padding:8px 4px;font-size:11px;color:#334155}
      td{border:1px solid #e2e8f0;padding:6px 4px;text-align:center;font-size:12px;vertical-align:middle}
      td.imgc{width:50px;padding:3px}
      .th{width:46px;height:46px;object-fit:cover;border-radius:7px;border:1px solid #e2e8f0}
      .noimg{width:46px;height:46px;display:flex;align-items:center;justify-content:center;font-size:20px;background:#f1f5f9;border-radius:7px;margin:0 auto}
      td.nm{text-align:right;font-weight:700;color:#0f172a;font-size:13px}
      td.bc{font-family:monospace;font-size:11px;font-weight:900;color:#334155}
      td.pct{color:#e11d48;font-weight:900;font-size:14px}
      td.mrg{color:#dc2626;font-weight:900}
      tr:nth-child(even) td{background:#fafbfc}
      ${TABLE_HELP_CSS}
      ${FINSUM_CSS}
      @media print{body{background:#fff}.tb{display:none}.page{margin:0;box-shadow:none;border-radius:0;max-width:100%}}
    
      ${REPORT_CSS}
    </style></head><body>
    <div class="tb"><button class="bk" onclick="window.close()">✕ إغلاق</button><button class="pr" onclick="window.print()">🖨️ طباعة</button></div>
    <div class="page">
      <div class="hd">
        <div><div class="brand">${brandName ?? "ALBAROO"}</div><div class="ttl">⚠️ تقرير السيئين${onlyCont?` — 📦 ${onlyCont}`:" — بيع ضعيف أو هامش ضعيف"}</div></div>
        <div class="ref">📅 ${dnum}<br><b>${total}</b> منتج · ${contNames.length} كونتينر</div>
      </div>
      ${financeSummaryHtml(contNames.flatMap(c=>groups[c]))}
      ${sections}
    </div></body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── الشاشة الرئيسية: كونتينر → مصنع → منتجات ────────────────
export default function ProductNeedsScreen({ products = [], periods = [], images = {}, settings = {}, onSaveSettings }) {
  const [container, setContainer] = useState(null);
  const scrollPos = useRef(0);
  const saveScroll = () => { scrollPos.current = window.scrollY || document.documentElement.scrollTop || 0; };
  const restoreScroll = () => { requestAnimationFrame(()=>{ window.scrollTo(0, scrollPos.current); }); };
  const [factory,   setFactory]   = useState(null);
  const [selected,  setSelected]  = useState(null);
  const [redMax,    setRedMax]    = useState(30);
  const [greenMin,  setGreenMin]  = useState(60);
  const [showHeroes, setShowHeroes] = useState(false);
  const [showBad, setShowBad] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [openCatCode, setOpenCatCode] = useState(null);
  const [openBadCont, setOpenBadCont] = useState(null);   // كونتينر السيئين المفتوح
  const [openHeroCont, setOpenHeroCont] = useState(null);
  const [heroViewImg, setHeroViewImg] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchQuery), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);
  const [searchScan, setSearchScan] = useState(false);
  const [searchSort, setSearchSort] = useState("none");  // none | best | worst
  const [starred, setStarred] = useState(settings?.starred ?? []);

  const toggleStar = async (barcode) => {
    const next = starred.includes(barcode) ? starred.filter(b=>b!==barcode) : [...starred, barcode];
    setStarred(next);
    if (onSaveSettings) await onSaveSettings({ ...settings, starred: next });
  };
  const isWinner = (soldPct, margin) => soldPct > 70 && margin > 20;

  const saveFactoryName = async (code, name) => {
    const factories = { ...(settings?.factories ?? {}), [code]: name };
    if (onSaveSettings) await onSaveSettings({ ...settings, factories });
  };
  const saveCategoryName = async (code, name) => {
    const categories = { ...(settings?.categories ?? {}), [code]: name };
    if (onSaveSettings) await onSaveSettings({ ...settings, categories });
  };

  const calcItem = (p) => {
    const bought  = totalPurchases(p);
    const sold    = soldAllPeriods(p.barcode, periods);
    const closing = Math.max(0, bought - sold);
    const soldPct = bought > 0 ? (sold/bought)*100 : 0;
    return { p, bought, sold, closing, soldPct };
  };

  const containers = useMemo(() => allContainers(products), [products]);

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

  const factoryItems = useMemo(() => {
    if (!factory) return [];
    const f = factories.find(x=>x.code===factory);
    return f ? [...f.items].sort((a,b)=>b.closing-a.closing) : [];
  }, [factory, factories]);

  if (selected) {
    return <ProductDetail product={selected} periods={periods} images={images} settings={settings} onBack={()=>setSelected(null)} />;
  }

  if (factory) {
    const f = factories.find(x=>x.code===factory);
    return <ProductList items={factoryItems} images={images} periods={periods} settings={settings} redMax={redMax} greenMin={greenMin}
      onSelect={setSelected} onBack={()=>{ setFactory(null); restoreScroll(); }}
      factoryCode={f?.code} factoryName={f?.name} onSaveFactoryName={saveFactoryName}
      title={`🏭 ${f?.code}${f?.name?` · ${f.name}`:""}`} />;
  }

  if (container) {
    return <FactoriesView container={container} factories={factories} allItems={factories.flatMap(f=>f.items)} images={images} periods={periods} settings={settings} redMax={redMax} greenMin={greenMin}
      setRedMax={setRedMax} setGreenMin={setGreenMin}
      onSelectFactory={(code)=>{ saveScroll(); setFactory(code); }}
      onBack={()=>{ setContainer(null); restoreScroll(); }} />;
  }

  if (showSearch) {
    const q = searchDebounced.trim().toLowerCase();
    let results = q
      ? products.filter(p => {
          const fac = getFactoryCode(p.barcode);
          const facName = settings?.factories?.[fac] ?? "";
          return p.barcode.toLowerCase().includes(q)
              || arabicIncludes(p.name, searchDebounced)
              || fac.includes(q)                        // رقم المصنع
              || arabicIncludes(facName, searchDebounced);  // اسم المصنع
        })
      : [];
    // فلتر الترتيب: الأفضل مبيعاً أو الأسوأ مبيعاً (حسب نسبة البيع)
    if (searchSort !== "none" && results.length > 1) {
      const pctOf = (p) => {
        const x = calcItem(p);
        return x.bought > 0 ? (x.sold / x.bought) * 100 : null;  // null = ما له مشتريات
      };
      results = [...results].sort((a, b) => {
        const pa = pctOf(a), pb = pctOf(b);
        // اللي ما له مشتريات ينزل آخر القائمة دايماً (نسبته غير معروفة)
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return searchSort === "best" ? pb - pa : pa - pb;
      });
    }
    return (
      <div className="space-y-3">
        {heroViewImg && <ImageViewer src={heroViewImg.src} name={heroViewImg.name} onClose={()=>setHeroViewImg(null)} />}
        {searchScan && <BarcodeScanner onDetect={(code)=>{ setSearchQuery(code); setSearchScan(false); }} onClose={()=>setSearchScan(false)} />}
        <button onClick={()=>{ setShowSearch(false); setSearchQuery(""); }} className="text-blue-400 font-bold text-sm">← رجوع</button>
        <div className="font-black text-slate-100 text-lg">🔍 بحث بالباركود</div>
        <div className="flex gap-2">
          <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} autoFocus placeholder="باركود أو اسم المنتج أو المصنع…"
            className="flex-1 bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
          <button onClick={()=>setSearchScan(true)} className="bg-blue-600 text-white px-4 rounded-xl font-bold">📷</button>
        </div>
        {q && results.length > 1 && (
          <div className="flex gap-2">
            <button onClick={()=>setSearchSort(searchSort==="best" ? "none" : "best")}
              className={`flex-1 py-2 rounded-xl text-xs font-black border transition ${
                searchSort==="best"
                  ? "bg-emerald-600 text-white border-emerald-500"
                  : "bg-slate-800 text-emerald-400 border-slate-600"}`}>
              🔥 الأفضل مبيعاً
            </button>
            <button onClick={()=>setSearchSort(searchSort==="worst" ? "none" : "worst")}
              className={`flex-1 py-2 rounded-xl text-xs font-black border transition ${
                searchSort==="worst"
                  ? "bg-red-600 text-white border-red-500"
                  : "bg-slate-800 text-red-400 border-slate-600"}`}>
              📉 الأسوأ مبيعاً
            </button>
          </div>
        )}
        {q && <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {results.length} نتيجة
            {searchSort==="best" && <span className="text-emerald-400 font-bold"> · مرتّبة بالأفضل</span>}
            {searchSort==="worst" && <span className="text-red-400 font-bold"> · مرتّبة بالأسوأ</span>}
          </div>
          {results.length > 0 && <button onClick={()=>printSearchResults(results, calcItem, images, settings, searchQuery)}
            className="bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-black">🖨️ طباعة النتائج</button>}
        </div>}
        <div className="space-y-2">
          {results.map(p => {
            const x = calcItem(p);
            const sell = num(p.sellPrice);
            const whole = num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
            const fac = getFactoryCode(p.barcode);
            const facName = settings?.factories?.[fac] ?? "";
            const img = images?.[p.barcode];
            return (
              <div key={p.barcode} onClick={()=>{ setSelected(p); setShowSearch(false); }} className="bg-slate-800 border border-slate-700 rounded-xl p-3 cursor-pointer">
                <div className="flex items-center gap-3">
                  {img
                    ? <img src={img} alt="" onClick={e=>{ e.stopPropagation(); setHeroViewImg({src:img,name:p.name}); }} className="w-12 h-12 rounded-lg object-cover shrink-0 cursor-zoom-in" />
                    : <div className="w-12 h-12 rounded-lg bg-slate-700 flex items-center justify-center text-lg shrink-0">📦</div>}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-100 text-sm truncate">{p.name}</div>
                    <div className="text-sm text-slate-300 font-mono font-black tracking-wide">{p.barcode}</div>
                    <div className="text-[11px] text-blue-400 truncate">🏭 {fac}{facName ? ` · ${facName}` : ""}</div>
                  </div>
                </div>
                {/* جاء · باع · باقي */}
                <div className="grid grid-cols-3 gap-1.5 mt-2">
                  <div className="bg-blue-950/40 rounded-lg py-1.5 text-center">
                    <div className="text-base font-black text-blue-300">{fmtN(x.bought)}</div>
                    <div className="text-[9px] text-slate-500">جاء</div>
                  </div>
                  <div className="bg-amber-950/40 rounded-lg py-1.5 text-center">
                    <div className="text-base font-black text-amber-300">{fmtN(x.sold)}</div>
                    <div className="text-[9px] text-slate-500">باع</div>
                  </div>
                  <div className="bg-emerald-950/40 rounded-lg py-1.5 text-center">
                    <div className="text-base font-black text-emerald-300">{fmtN(x.closing)}</div>
                    <div className="text-[9px] text-slate-500">باقي</div>
                  </div>
                </div>
                {/* نسبة البيع — تبيّن الأفضل من الأسوأ */}
                {x.bought > 0 && (()=>{ 
                  const pct = Math.round((x.sold / x.bought) * 100);
                  const box = pct >= 70 ? "bg-emerald-950/30" : pct >= 40 ? "bg-amber-950/30" : "bg-red-950/30";
                  const bar = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
                  const txt = pct >= 70 ? "text-emerald-300" : pct >= 40 ? "text-amber-300" : "text-red-300";
                  return (
                    <div className={`mt-1.5 flex items-center gap-2 ${box} rounded-lg px-2.5 py-1.5`}>
                      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full ${bar} rounded-full`} style={{width:`${Math.min(100,pct)}%`}} />
                      </div>
                      <span className={`text-xs font-black ${txt} shrink-0`}>{pct}% باع</span>
                    </div>
                  );
                })()}
                {/* الأسعار */}
                <div className="flex gap-1.5 mt-1.5">
                  <span className="flex-1 text-center text-xs px-2 py-1 rounded-lg bg-emerald-900/25 text-emerald-300 font-bold">بيع {fmtN(sell)} ﷼</span>
                  <span className="flex-1 text-center text-xs px-2 py-1 rounded-lg bg-red-900/20 text-red-300 font-bold">جملة {fmtN(whole)} ﷼</span>
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

  if (showCats) {
    // تجميع المنتجات بالفئة
    const cats = {};
    products.forEach(p => {
      const code = getCategoryCode(p.barcode);
      if (!cats[code]) cats[code] = { code, items: [], bought:0, sold:0, revenue:0, cost:0, branchSold:{} };
      const x = calcItem(p);
      const buyPrice = num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
      const sell = num(p.sellPrice);
      const m = buyPrice > 0 ? ((sell - buyPrice) / buyPrice) * 100 : 0;
      cats[code].items.push({ ...x, buyPrice, sell, margin:m });
      cats[code].bought += x.bought;
      cats[code].sold += x.sold;
      cats[code].revenue += x.sold * sell;
      cats[code].cost += x.sold * buyPrice;
      // مبيعات كل فرع لهذا المنتج → تُجمّع على مستوى الفئة
      periods.forEach(per => {
        Object.entries(per.sales ?? {}).forEach(([branch, d]) => {
          const q = num(d[p.barcode]?.qty ?? 0);
          if (q > 0) cats[code].branchSold[branch] = (cats[code].branchSold[branch] ?? 0) + q;
        });
      });
    });
    const catList = Object.values(cats).map(c => {
      const soldPct = c.bought > 0 ? (c.sold / c.bought) * 100 : 0;
      const margin = c.cost > 0 ? ((c.revenue - c.cost) / c.cost) * 100 : 0;
      const profit = c.revenue - c.cost;
      c.items.sort((a,b)=> b.soldPct - a.soldPct);
      return { ...c, soldPct, margin, profit, score: soldPct + margin };
    }).sort((a,b) => b.score - a.score);

    const best = catList[0];
    const worst = catList[catList.length - 1];

    return (
      <div className="space-y-3">
        {heroViewImg && <ImageViewer src={heroViewImg.src} name={heroViewImg.name} onClose={()=>setHeroViewImg(null)} />}
        <button onClick={()=>setShowCats(false)} className="text-blue-400 font-bold text-sm">← رجوع</button>
        <div className="font-black text-slate-100 text-lg">🏷️ تحليل الفئات ({catList.length})</div>
        <div className="text-xs text-slate-500">الفئة = 3 أرقام قبل حرف B · الباركود 69 = ميكب · مرتّبة من الأقوى للأضعف</div>

        {best && worst && catList.length > 1 && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-emerald-950/40 border border-emerald-700/40 rounded-xl p-3">
              <div className="text-[11px] text-emerald-400 font-bold mb-1">🏆 أقوى فئة</div>
              <div className="font-black text-slate-100">{best.code}{settings?.categories?.[best.code]?` · ${settings.categories[best.code]}`:""}</div>
              <div className="text-xs text-slate-400 mt-1">باع {fmtN(best.sold)} · نسبة {fmtPct(best.soldPct)} · هامش {Math.round(best.margin)}%</div>
            </div>
            <div className="bg-rose-950/40 border border-rose-700/40 rounded-xl p-3">
              <div className="text-[11px] text-rose-400 font-bold mb-1">🐌 أضعف فئة</div>
              <div className="font-black text-slate-100">{worst.code}{settings?.categories?.[worst.code]?` · ${settings.categories[worst.code]}`:""}</div>
              <div className="text-xs text-slate-400 mt-1">باع {fmtN(worst.sold)} · نسبة {fmtPct(worst.soldPct)} · هامش {Math.round(worst.margin)}%</div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {catList.map((c, i) => {
            const catName = settings?.categories?.[c.code];
            // الاسم المقترح = أكثر أول كلمة تكرارًا في أسماء منتجات الفئة
            const suggestName = (() => {
              const freq = {};
              c.items.forEach(it => {
                const w = (it.p.name || "").trim().split(/\s+/)[0];
                if (w && w.length > 1) freq[w] = (freq[w] || 0) + 1;
              });
              const top = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0];
              return top ? top[0] : "";
            })();
            const isTop = i === 0, isBottom = i === catList.length - 1 && catList.length > 1;
            const open = openCatCode === c.code;
            return (
              <div key={c.code} className={`rounded-2xl border overflow-hidden ${isTop?"border-emerald-700/40 bg-emerald-950/20":isBottom?"border-rose-700/40 bg-rose-950/20":"border-slate-700 bg-slate-800/50"}`}>
                <div onClick={()=>setOpenCatCode(open?null:c.code)} className="p-3 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{isTop?"🏆":isBottom?"🐌":"🏷️"}</span>
                      <div>
                        <div className="font-black text-slate-100">{c.code}{catName ? ` · ${catName}` : suggestName ? ` · ${suggestName}` : ""}</div>
                        <div className="text-[11px] text-slate-400 font-bold">📦 {c.items.length} منتج</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={async e=>{ e.stopPropagation(); const n = window.prompt(`اسم الفئة ${c.code}:`, catName || suggestName || ""); if (n !== null) await saveCategoryName(c.code, n.trim()); }}
                        className="text-xs bg-slate-600 text-white px-2.5 py-1 rounded-lg font-bold">✏️</button>
                      <button onClick={e=>{ e.stopPropagation(); printCategoryReport(c, catName, images, settings?.brandName ?? "ALBAROO"); }}
                        className="text-xs bg-indigo-700 text-white px-2.5 py-1 rounded-lg font-bold">🖨️</button>
                      <div className="text-left">
                        <div className={`text-lg font-black ${c.soldPct>60?"text-emerald-400":c.soldPct<30?"text-rose-400":"text-amber-400"}`}>{fmtPct(c.soldPct)}</div>
                      </div>
                      <span className="text-slate-500 text-sm">{open?"▲":"▼"}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 mt-2.5">
                    <div className="bg-blue-950/40 rounded-lg py-1.5 text-center"><div className="text-sm font-black text-blue-300">{fmtN(c.bought)}</div><div className="text-[9px] text-slate-500">جاء</div></div>
                    <div className="bg-amber-950/40 rounded-lg py-1.5 text-center"><div className="text-sm font-black text-amber-300">{fmtN(c.sold)}</div><div className="text-[9px] text-slate-500">باع</div></div>
                    <div className="bg-purple-950/40 rounded-lg py-1.5 text-center"><div className="text-sm font-black text-purple-300">{Math.round(c.margin)}%</div><div className="text-[9px] text-slate-500">هامش</div></div>
                    <div className="bg-emerald-950/40 rounded-lg py-1.5 text-center"><div className="text-sm font-black text-emerald-300">{fmtM(c.profit)}</div><div className="text-[9px] text-slate-500">ربح</div></div>
                  </div>
                </div>
                {open && (
                  <div className="px-2.5 pb-2.5 space-y-2 border-t border-slate-700/50 pt-2">
                    {(() => {
                      const branchArr = Object.entries(c.branchSold).sort((a,b)=>b[1]-a[1]);
                      if (branchArr.length === 0) return null;
                      const top = branchArr[0], bottom = branchArr[branchArr.length-1];
                      const maxQty = top[1];
                      const totalCatSold = branchArr.reduce((s,[,q])=>s+q, 0);
                      const pctOf = (q) => totalCatSold > 0 ? (q/totalCatSold)*100 : 0;
                      return (
                        <div className="bg-slate-900/60 rounded-xl p-2.5 mb-1">
                          <div className="text-[11px] font-black text-slate-400 mb-2">🏪 الفروع في هذي الفئة ({branchArr.length})</div>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <div className="bg-emerald-950/40 border border-emerald-700/40 rounded-lg p-2">
                              <div className="text-[10px] text-emerald-400 font-bold">🟢 أقوى فرع</div>
                              <div className="font-black text-slate-100 text-sm truncate">{top[0]}</div>
                              <div className="text-xs text-emerald-300 font-black">{fmtN(top[1])} قطعة · {fmtPct(pctOf(top[1]))}</div>
                            </div>
                            <div className="bg-rose-950/40 border border-rose-700/40 rounded-lg p-2">
                              <div className="text-[10px] text-rose-400 font-bold">🔴 أضعف فرع</div>
                              <div className="font-black text-slate-100 text-sm truncate">{bottom[0]}</div>
                              <div className="text-xs text-rose-300 font-black">{fmtN(bottom[1])} قطعة · {fmtPct(pctOf(bottom[1]))}</div>
                            </div>
                          </div>
                          <div className="space-y-1">
                            {branchArr.map(([br, qty]) => (
                              <div key={br} className="flex items-center gap-2">
                                <div className="text-[11px] text-slate-300 w-24 truncate shrink-0">{br}</div>
                                <div className="flex-1 bg-slate-800 rounded-full h-3 overflow-hidden">
                                  <div className="h-full bg-gradient-to-l from-indigo-500 to-blue-500 rounded-full" style={{width:`${maxQty>0?(qty/maxQty)*100:0}%`}}></div>
                                </div>
                                <div className="text-[11px] font-black text-slate-200 w-16 text-left shrink-0">{fmtN(qty)} · {fmtPct(pctOf(qty))}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {c.items.map(h => (
                      <div key={h.p.barcode} className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800">
                        <div className="flex items-start gap-3">
                          {images?.[h.p.barcode]
                            ? <img src={images[h.p.barcode]} alt="" onClick={()=>setHeroViewImg({src:images[h.p.barcode],name:h.p.name})} className="w-16 h-16 rounded-lg object-cover shrink-0 cursor-zoom-in" />
                            : <div className="w-16 h-16 rounded-lg bg-slate-700 flex items-center justify-center text-2xl shrink-0">📦</div>}
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-100 text-sm leading-tight">{h.p.name}</div>
                            <div className="mt-1" onClick={e=>e.stopPropagation()}><CopyBarcode barcode={h.p.barcode} /></div>
                            <div className="text-xs text-blue-400 mt-1">🏭 {getFactoryCode(h.p.barcode)}{settings?.factories?.[getFactoryCode(h.p.barcode)]?` · ${settings.factories[getFactoryCode(h.p.barcode)]}`:""} · 🏷️ {getCategoryName(h.p.barcode, settings)}</div>
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-wrap mt-2">
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-blue-900/30 text-blue-300">جاء {fmtN(h.bought)}</span>
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-amber-900/30 text-amber-300">باع {fmtN(h.sold)}</span>
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-700 text-slate-300">باقي {fmtN(h.closing)}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-lg ${h.soldPct>60?"bg-emerald-900/30 text-emerald-300":h.soldPct<30?"bg-rose-900/40 text-rose-300":"bg-amber-900/30 text-amber-300"}`}>نسبة {fmtPct(h.soldPct)}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-lg ${h.margin<5?"bg-rose-900/40 text-rose-300":"bg-purple-900/30 text-purple-300"}`}>هامش {Math.round(h.margin)}%</span>
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-red-900/20 text-red-300">جملة {fmtN(h.buyPrice)}﷼</span>
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-emerald-900/20 text-emerald-300">بيع {fmtN(h.sell)}﷼</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (showBad) {
    const isBad = (soldPct, margin) => soldPct < 30 || margin < 5;
    const bads = products.map(p => {
      const x = calcItem(p);
      const buyPrice = num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
      const m = buyPrice > 0 ? ((num(p.sellPrice)-buyPrice)/buyPrice)*100 : 0;
      return { ...x, margin:m, buyPrice, bad: isBad(x.soldPct, m) };
    }).filter(h => h.bad);

    const groups = {};
    bads.forEach(h => {
      const cont = h.p.container || "بدون كونتينر";
      if (!groups[cont]) groups[cont] = [];
      groups[cont].push(h);
    });
    Object.values(groups).forEach(g => g.sort((a,b)=> a.soldPct-b.soldPct || a.margin-b.margin));
    const contNames = Object.keys(groups).sort();

    return (
      <div className="space-y-3">
        {heroViewImg && <ImageViewer src={heroViewImg.src} name={heroViewImg.name} onClose={()=>setHeroViewImg(null)} />}
        <button onClick={()=>setShowBad(false)} className="text-blue-400 font-bold text-sm">← رجوع</button>
        <div className="font-black text-slate-100 text-lg">⚠️ السيئين ({bads.length})</div>
        <div className="text-xs text-slate-500">بيع ضعيف 🐌 (أقل من 30%) أو هامش ضعيف 📉 (أقل من 5%) — مقسّمة بالكونتينر</div>

        {bads.length > 0 && (
          <button onClick={()=>printBadReport(groups, contNames, images, settings?.brandName ?? "ALBAROO")}
            className="w-full bg-gradient-to-r from-rose-700 to-red-700 text-white py-3 rounded-xl font-bold text-sm">
            🖨️ تقرير السيئين المتكامل (بالصور)
          </button>
        )}

        {bads.length === 0 && <div className="text-center text-slate-500 py-12">لا منتجات سيئة 🎉</div>}

        <div className="space-y-2">
          {contNames.map(cont => {
            const list = groups[cont];
            const open = openBadCont === cont;
            return (
              <div key={cont} className="bg-slate-800/60 border border-slate-700 rounded-2xl overflow-hidden">
                <div onClick={()=>setOpenBadCont(open?null:cont)} className="flex items-center justify-between p-3.5 cursor-pointer">
                  <div className="font-black text-slate-100">📦 {cont}</div>
                  <div className="flex items-center gap-2">
                    <button onClick={e=>{ e.stopPropagation(); printBadReport(groups, contNames, images, settings?.brandName ?? "ALBAROO", cont); }}
                      className="text-xs bg-rose-800 text-white px-2.5 py-1 rounded-lg font-bold">🖨️</button>
                    <span className="text-xs font-bold bg-rose-700 text-white px-2.5 py-1 rounded-full">{list.length} منتج</span>
                    <span className="text-slate-500">{open?"▲":"▼"}</span>
                  </div>
                </div>
                {open && (
                  <div className="px-2.5 pb-2.5 space-y-2">
                    {list.map(h => (
                      <div key={h.p.barcode} style={{background:"rgba(225,29,72,0.07)",border:"1.5px solid rgba(225,29,72,0.28)",borderRadius:"14px",padding:"12px",position:"relative"}}>
                        {h.soldPct < 30 && <div style={{position:"absolute",top:"-9px",left:"10px",background:"linear-gradient(135deg,#e11d48,#9f1239)",color:"#fff",fontSize:"10px",fontWeight:"900",padding:"2px 8px",borderRadius:"100px"}}>🐌 بيع بطيء</div>}
                        <div className="flex items-start gap-3">
                          {images?.[h.p.barcode]
                            ? <img src={images[h.p.barcode]} alt="" onClick={()=>setHeroViewImg({src:images[h.p.barcode],name:h.p.name})} className="w-16 h-16 rounded-lg object-cover shrink-0 cursor-pointer" />
                            : <div className="w-16 h-16 rounded-lg bg-slate-700 flex items-center justify-center text-2xl shrink-0">📦</div>}
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-100 text-sm leading-tight">{h.p.name}</div>
                            <div className="mt-1" onClick={e=>e.stopPropagation()}><CopyBarcode barcode={h.p.barcode} /></div>
                            <div className="text-xs text-blue-400 mt-1">🏭 {getFactoryCode(h.p.barcode)}{settings?.factories?.[getFactoryCode(h.p.barcode)]?` · ${settings.factories[getFactoryCode(h.p.barcode)]}`:""} · 🏷️ {getCategoryName(h.p.barcode, settings)}</div>
                            <ContainerQtys product={h.p} />
                          </div>
                          <button onClick={()=>toggleStar(h.p.barcode)} style={{fontSize:"24px",background:"none",border:"none",cursor:"pointer"}}>
                            {starred.includes(h.p.barcode) ? "⭐" : "☆"}
                          </button>
                        </div>
                        <div className="flex gap-1.5 flex-wrap mt-2">
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-blue-900/30 text-blue-300">جاء {fmtN(h.bought)}</span>
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-amber-900/30 text-amber-300">باع {fmtN(h.sold)}</span>
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-700 text-slate-300">باقي {fmtN(h.closing)}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-lg ${h.soldPct<30?"bg-rose-900/40 text-rose-300":"bg-emerald-900/30 text-emerald-300"}`}>نسبة {fmtPct(h.soldPct)}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-lg ${h.margin<5?"bg-rose-900/40 text-rose-300":"bg-purple-900/30 text-purple-300"}`}>هامش {Math.round(h.margin)}%</span>
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-red-900/20 text-red-300">جملة {fmtN(h.buyPrice)}﷼</span>
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-emerald-900/20 text-emerald-300">بيع {fmtN(num(h.p.sellPrice))}﷼</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (showHeroes) {
    const heroes = products.map(p => {
      const x = calcItem(p);
      const buyPrice = num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
      const m = buyPrice > 0 ? ((num(p.sellPrice)-buyPrice)/buyPrice)*100 : 0;
      const winner = isWinner(x.soldPct, m);
      const star = starred.includes(p.barcode);
      return { ...x, margin:m, buyPrice, winner, star };
    }).filter(h => h.winner || h.star);

    const groups = {};
    heroes.forEach(h => {
      const cont = h.p.container || "بدون كونتينر";
      if (!groups[cont]) groups[cont] = [];
      groups[cont].push(h);
    });
    Object.values(groups).forEach(g => g.sort((a,b)=> (b.winner?1:0)-(a.winner?1:0) || b.soldPct-a.soldPct));
    const contNames = Object.keys(groups).sort();

    return (
      <div className="space-y-3">
        {heroViewImg && <ImageViewer src={heroViewImg.src} name={heroViewImg.name} onClose={()=>setHeroViewImg(null)} />}
        <button onClick={()=>setShowHeroes(false)} className="text-blue-400 font-bold text-sm">← رجوع</button>
        <div className="font-black text-slate-100 text-lg">⭐ الأبطال ({heroes.length})</div>
        <div className="text-xs text-slate-500">المنتجات الرابحة 🎉 والمفضّلة ⭐ — مقسّمة بالكونتينر</div>

        {heroes.length > 0 && (
          <button onClick={()=>printHeroesReport(groups, contNames, images, settings?.brandName ?? "ALBAROO")}
            className="w-full bg-gradient-to-r from-amber-600 to-yellow-600 text-white py-3 rounded-xl font-bold text-sm">
            🖨️ تقرير الأبطال المتكامل (بالصور)
          </button>
        )}

        {heroes.length === 0 && <div className="text-center text-slate-500 py-12">لا أبطال بعد — نجّم منتجاتك المفضّلة ⭐</div>}

        <div className="space-y-2">
          {contNames.map(cont => {
            const list = groups[cont];
            const open = openHeroCont === cont;
            return (
              <div key={cont} className="bg-slate-800/60 border border-slate-700 rounded-2xl overflow-hidden">
                <div onClick={()=>setOpenHeroCont(open?null:cont)} className="flex items-center justify-between p-3.5 cursor-pointer">
                  <div className="font-black text-slate-100">📦 {cont}</div>
                  <div className="flex items-center gap-2">
                    <button onClick={e=>{ e.stopPropagation(); printHeroesReport(groups, contNames, images, settings?.brandName ?? "ALBAROO", cont); }}
                      className="text-xs bg-amber-700 text-white px-2.5 py-1 rounded-lg font-bold">🖨️</button>
                    <span className="text-xs font-bold bg-amber-600 text-white px-2.5 py-1 rounded-full">{list.length} بطل</span>
                    <span className="text-slate-500">{open?"▲":"▼"}</span>
                  </div>
                </div>
                {open && (
                  <div className="px-2.5 pb-2.5 space-y-2">
                    {list.map(h => (
                      <div key={h.p.barcode} style={{background:"rgba(212,168,83,0.08)",border:"1.5px solid rgba(212,168,83,0.3)",borderRadius:"14px",padding:"12px",position:"relative"}}>
                        {h.winner && <div style={{position:"absolute",top:"-9px",left:"10px",background:"linear-gradient(135deg,#d4a853,#b8935a)",color:"#0a0804",fontSize:"10px",fontWeight:"900",padding:"2px 8px",borderRadius:"100px"}}>🎉 مبروك رابح</div>}
                        <div className="flex items-start gap-3">
                          {images?.[h.p.barcode]
                            ? <img src={images[h.p.barcode]} alt="" onClick={()=>setHeroViewImg({src:images[h.p.barcode],name:h.p.name})} className="w-16 h-16 rounded-lg object-cover shrink-0 cursor-pointer" />
                            : <div className="w-16 h-16 rounded-lg bg-slate-700 flex items-center justify-center text-2xl shrink-0">📦</div>}
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-100 text-sm leading-tight">{h.p.name}</div>
                            <div className="mt-1" onClick={e=>e.stopPropagation()}><CopyBarcode barcode={h.p.barcode} /></div>
                            <div className="text-xs text-blue-400 mt-1">🏭 {getFactoryCode(h.p.barcode)}{settings?.factories?.[getFactoryCode(h.p.barcode)]?` · ${settings.factories[getFactoryCode(h.p.barcode)]}`:""} · 🏷️ {getCategoryName(h.p.barcode, settings)}</div>
                            <ContainerQtys product={h.p} />
                          </div>
                          <button onClick={()=>toggleStar(h.p.barcode)} style={{fontSize:"24px",background:"none",border:"none",cursor:"pointer"}}>
                            {h.star ? "⭐" : "☆"}
                          </button>
                        </div>
                        <div className="flex gap-1.5 flex-wrap mt-2">
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-blue-900/30 text-blue-300">جاء {fmtN(h.bought)}</span>
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-amber-900/30 text-amber-300">باع {fmtN(h.sold)}</span>
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-700 text-slate-300">باقي {fmtN(h.closing)}</span>
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-emerald-900/30 text-emerald-300">نسبة {fmtPct(h.soldPct)}</span>
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-purple-900/30 text-purple-300">هامش {Math.round(h.margin)}%</span>
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-red-900/20 text-red-300">شراء {fmtN(h.buyPrice)}﷼</span>
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-emerald-900/20 text-emerald-300">بيع {fmtN(num(h.p.sellPrice))}﷼</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="font-black text-slate-100 text-lg">🔍 احتياج المنتجات</div>
        <div className="text-xs text-slate-500 mb-3">اختر كونتينر → مصنع → منتج</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button onClick={()=>setShowSearch(true)} className="bg-blue-600 text-white py-2.5 rounded-xl text-sm font-bold">🔍 بحث</button>
          <button onClick={()=>setShowHeroes(true)} className="bg-amber-600 text-white py-2.5 rounded-xl text-sm font-bold">⭐ الأبطال</button>
          <button onClick={()=>setShowBad(true)} className="bg-rose-700 text-white py-2.5 rounded-xl text-sm font-bold">⚠️ السيئين</button>
          <button onClick={()=>setShowCats(true)} className="bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-bold">🏷️ الفئات</button>
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
