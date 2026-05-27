// ============================================================
// exporters.js — تصدير Excel وطباعة
// ============================================================

import * as XLSX from "xlsx";
import { num, fmtN, fmtM, fmtPct } from "./calc.js";

// التاريخ الميلادي والهجري
const todayMiladi = () =>
  new Date().toLocaleDateString("ar-SA", {
    calendar: "gregory",
    year: "numeric", month: "2-digit", day: "2-digit",
  });

const todayHijri = () => {
  try {
    return new Date().toLocaleDateString("ar-SA", {
      calendar: "islamic",
      year: "numeric", month: "2-digit", day: "2-digit",
    });
  } catch { return ""; }
};

const todayBoth = () => {
  const m = new Date().toLocaleDateString("ar-SA", { calendar:"gregory", year:"numeric", month:"2-digit", day:"2-digit" });
  const h = todayHijri();
  return h ? `${m} م  |  ${h} هـ` : m;
};

const todayLabel = () =>
  new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });

function safeFilename(name) {
  return String(name ?? "تقرير").replace(/[/\\:*?"<>|]/g, "_").trim() || "تقرير";
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Excel ───────────────────────────────────────────────────

function buildWorkbook(title, subtitle, headers, rows) {
  const wb  = XLSX.utils.book_new();
  const aoa = [
    [title],
    [subtitle || todayLabel()],
    [],
    headers,
    ...rows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = headers.map((h, i) => ({
    wch: Math.min(40, Math.max(String(h).length + 2,
      ...rows.slice(0, 30).map(r => String(r[i] ?? "").length + 2)))
  }));
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "تقرير");
  return wb;
}

function exportExcel(title, subtitle, headers, rows, filename) {
  try {
    if (!rows || rows.length === 0) return { ok: false, error: "لا توجد بيانات" };
    const wb = buildWorkbook(title, subtitle, headers, rows);
    XLSX.writeFile(wb, `${safeFilename(filename)}.xlsx`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `فشل التصدير: ${e.message}` };
  }
}

export function exportContainerReport(summary) {
  const headers = ["الباركود","الاسم","المصنع","مشتريات","مباع","متبقي","سعر شراء","سعر بيع","هامش%","نسبة%","الحالة"];
  const rows    = summary.products.map(p => [
    p.barcode, p.name, p.barcode.slice(0,5),
    fmtN(p.bought), fmtN(p.sold), fmtN(p.closing),
    fmtM(p.buyPrice), fmtM(p.sellPrice), fmtPct(p.marginPct), fmtPct(p.soldPct), p.status,
  ]);
  return exportExcel(
    `تقرير كونتينر: ${summary.container}`,
    `${todayLabel()} · ${summary.productCount} منتج`,
    headers, rows,
    `كونتينر_${summary.container}`
  );
}

export function exportBranchNeedReport(branch, items, filterLabel = "الكل") {
  const totalNeed = items.reduce((s, i) => s + num(i.needQty), 0);
  const totalCost = items.reduce((s, i) => s + num(i.needQty) * num(i.buyPrice), 0);
  const headers   = ["الباركود","الاسم","الكونتينر","سعر شراء","سعر بيع","مباع","أُعطي","متبقي","احتياج","تكلفة الاحتياج"];
  const rows = items.map(i => [
    i.barcode, i.name, i.container ?? "",
    fmtM(i.buyPrice), fmtM(i.sellPrice ?? 0),
    fmtN(i.sold), fmtN(i.given), fmtN(i.remaining), fmtN(i.needQty),
    fmtM(num(i.needQty) * num(i.buyPrice)),
  ]);
  return exportExcel(
    `احتياج فرع: ${branch}`,
    `${todayLabel()} · ${items.length} منتج · ${fmtN(totalNeed)} وحدة · ${fmtM(totalCost)} · ${filterLabel}`,
    headers, rows,
    `احتياج_${branch}`
  );
}

export function exportTrendReport(rows, labelA, labelB) {
  const headers = ["الباركود","الاسم","الكونتينر",`مباع — ${labelA}`,`مباع — ${labelB}`,"الفرق","الفرق%","الاتجاه"];
  const data = rows.map(r => [
    r.barcode, r.name, r.container,
    fmtN(r.soldA), fmtN(r.soldB),
    (r.diff > 0 ? "+" : "") + fmtN(r.diff),
    r.diffPct != null ? fmtPct(r.diffPct) : "—",
    r.trend,
  ]);
  return exportExcel(
    `تقرير الترند: ${labelA} vs ${labelB}`,
    todayLabel(), headers, data,
    `ترند_${labelA}_vs_${labelB}`
  );
}

export function exportFactoryReport(report, factoryName = "", threshold = null) {
  const name    = factoryName ? `${report.factoryCode} — ${factoryName}` : report.factoryCode;
  const headers = ["الباركود","الاسم","الكونتينر","مشتريات","مباع","متبقي","نسبة%","سعر شراء","سعر بيع","الحالة",
    ...(threshold != null ? ["تكرار؟"] : [])];
  const rows = report.products.map(p => [
    p.barcode, p.name, p.container,
    fmtN(p.bought), fmtN(p.sold), fmtN(p.closing),
    fmtPct(p.soldPct), fmtM(p.buyPrice), fmtM(p.sellPrice), p.status,
    ...(threshold != null ? [p.soldPct >= threshold ? "✓ نعم" : "✗ لا"] : []),
  ]);
  return exportExcel(
    `تقرير مصنع: ${name}`,
    `${todayLabel()} · ${report.productCount} منتج`,
    headers, rows,
    `مصنع_${report.factoryCode}`
  );
}

export function exportGeneric(data, title, filename) {
  if (!data || data.length === 0) return { ok: false, error: "لا توجد بيانات" };
  const headers = Object.keys(data[0]);
  const rows    = data.map(row => headers.map(h => row[h] ?? ""));
  return exportExcel(title, todayLabel(), headers, rows, filename);
}

// ─── طباعة ───────────────────────────────────────────────────

const PRINT_CSS = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI','Arial',sans-serif; padding:16px; color:#1e293b; font-size:11px; direction:rtl; }
  .header { margin-bottom:12px; border-bottom:3px solid #1e40af; padding-bottom:8px; }
  h1 { font-size:16px; color:#1e40af; margin-bottom:3px; }
  .meta { color:#64748b; font-size:10px; }
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(100px,1fr)); gap:6px; margin-bottom:12px; }
  .stat { background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; padding:6px; text-align:center; }
  .stat-v { font-size:13px; font-weight:900; }
  .stat-l { font-size:9px; color:#64748b; margin-top:1px; }
  table { width:100%; border-collapse:collapse; }
  th { background:#1e40af; color:#fff; padding:6px 8px; text-align:right; font-size:10px; }
  td { padding:5px 8px; border-bottom:1px solid #e2e8f0; font-size:10px; }
  tr:nth-child(even) td { background:#f8fafc; }
  .g { color:#16a34a; font-weight:700; }
  .r { color:#dc2626; font-weight:700; }
  .y { color:#d97706; font-weight:700; }
  .u { color:#16a34a; }
  .d { color:#dc2626; }
  @media print { body { padding:6px; } }
`;

function openPrint(html) {
  try {
    const w = window.open("", "_blank", "width=900,height=680");
    if (!w) return { ok: false, error: "فعّل النوافذ المنبثقة في المتصفح" };
    w.document.write(html);
    w.document.close();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function printPage(title, meta, statsHtml, tableHtml) {
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${escHtml(title)}</title>
  <style>${PRINT_CSS}</style></head><body>
  <div class="header"><h1>${escHtml(title)}</h1><div class="meta">📅 ${todayBoth()}${meta ? ` · ${escHtml(meta)}` : ""}</div></div>
  ${statsHtml}${tableHtml}
  <script>setTimeout(()=>window.print(),600);<\/script></body></html>`;
}

function buildStats(stats) {
  return `<div class="stats">${stats.map(([l, v]) =>
    `<div class="stat"><div class="stat-v">${escHtml(String(v))}</div><div class="stat-l">${escHtml(l)}</div></div>`
  ).join("")}</div>`;
}

function buildTable(headers, rows, images = {}, barcodeIdx = 0, nameIdx = 1) {
  const ths = headers.map(h => `<th>${escHtml(h)}</th>`).join("");
  const trs = rows.map(row => {
    const cells = row.map((cell, i) => {
      const s   = String(cell ?? "");
      let cls   = "";
      if (s === "جيد")   cls = "g";
      if (s === "منخفض") cls = "y";
      if (s === "نفد")   cls = "r";
      if (s === "صاعد")  cls = "u";
      if (s === "هابط")  cls = "d";
      if (i === nameIdx && images[row[barcodeIdx]]) {
        return `<td><div style="display:flex;align-items:center;gap:6px"><img src="${images[row[barcodeIdx]]}" style="width:32px;height:32px;border-radius:4px;object-fit:cover"><span>${escHtml(s)}</span></div></td>`;
      }
      return `<td${cls ? ` class="${cls}"` : ""}>${escHtml(s)}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
}

export function printContainerReport(summary, brandName = "", images = {}) {
  const stats = [
    ["المنتجات", fmtN(summary.productCount)],
    ["المشتريات", fmtN(summary.totalBought)],
    ["المباع", fmtN(summary.totalSold)],
    ["المتبقي", fmtN(summary.totalClosing)],
    ["الإيرادات", fmtM(summary.totalRevenue)],
    ["الربح", fmtM(summary.totalProfit)],
    ["نسبة المبيعات", fmtPct(summary.soldPct)],
  ];
  const headers = ["الباركود","الاسم","مشتريات","مباع","متبقي","سعر شراء","سعر بيع","هامش%","الحالة"];
  const rows    = summary.products.map(p => [
    p.barcode, p.name, fmtN(p.bought), fmtN(p.sold), fmtN(p.closing),
    fmtM(p.buyPrice), fmtM(p.sellPrice), fmtPct(p.marginPct), p.status,
  ]);
  return openPrint(printPage(
    `تقرير كونتينر: ${summary.container}`,
    brandName,
    buildStats(stats),
    buildTable(headers, rows, images, 0, 1)
  ));
}

export function printBranchNeedReport(branch, items, brandName = "", filterLabel = "الكل", images = {}) {
  const totalNeed = items.reduce((s, i) => s + num(i.needQty), 0);
  const totalCost = items.reduce((s, i) => s + num(i.needQty) * num(i.buyPrice), 0);
  const stats = [
    ["المنتجات", fmtN(items.length)],
    ["إجمالي الوحدات", fmtN(totalNeed)],
    ["التكلفة المقدرة", fmtM(totalCost)],
    ["الفلتر", filterLabel],
  ];
  const headers = ["الباركود","الاسم","الكونتينر","سعر شراء","سعر بيع","مباع","أُعطي","متبقي","احتياج","تكلفة"];
  const rows = items.map(i => [
    i.barcode, i.name, i.container ?? "",
    fmtM(i.buyPrice), fmtM(i.sellPrice ?? 0),
    fmtN(i.sold), fmtN(i.given), fmtN(i.remaining), fmtN(i.needQty),
    fmtM(num(i.needQty) * num(i.buyPrice)),
  ]);
  return openPrint(printPage(
    `احتياج فرع: ${branch}`,
    `${brandName ? brandName + " · " : ""}${items.length} منتج · ${fmtN(totalNeed)} وحدة`,
    buildStats(stats),
    buildTable(headers, rows, images, 0, 1)
  ));
}

export function printTrendReport(rows, labelA, labelB, brandName = "") {
  const rising  = rows.filter(r => r.trend === "صاعد").length;
  const falling = rows.filter(r => r.trend === "هابط").length;
  const stats   = [["صاعد", fmtN(rising)], ["هابط", fmtN(falling)], ["ثابت", fmtN(rows.filter(r=>r.trend==="ثابت").length)], ["الكل", fmtN(rows.length)]];
  const headers = ["الباركود","الاسم","الكونتينر",`مباع — ${labelA}`,`مباع — ${labelB}`,"الفرق","الاتجاه"];
  const tableRows = rows.map(r => [
    r.barcode, r.name, r.container,
    fmtN(r.soldA), fmtN(r.soldB),
    (r.diff > 0 ? "+" : "") + fmtN(r.diff),
    r.trend,
  ]);
  return openPrint(printPage(
    `تقرير الترند: ${labelA} vs ${labelB}`,
    brandName, buildStats(stats), buildTable(headers, tableRows)
  ));
}
