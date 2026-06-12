// ============================================================
// parsers.js — قراءة ملفات Excel
// ============================================================

import * as XLSX from "xlsx";
import { num } from "./calc.js";

function cleanBarcode(raw) {
  return String(raw ?? "").trim().replace(/了/g, "B").replace(/\s+/g, "");
}

// تنظيف اسم الفرع — يوحّد المسافات (يمنع التكرار)
function cleanBranch(raw) {
  return String(raw ?? "").trim().replace(/\s+/g, " ");
}

function toNum(raw) {
  const n = parseFloat(String(raw ?? "").replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function uuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fingerprint(sales) {
  const total = Object.values(sales).reduce((s, b) =>
    s + Object.values(b).reduce((ss, v) => ss + num(v.qty), 0), 0);
  const allBarcodes = [...new Set(
    Object.values(sales).flatMap(b => Object.keys(b))
  )].sort();
  const perBarcode = allBarcodes.map(bc => {
    const qty = Object.values(sales).reduce((s, b) => s + num(b[bc]?.qty ?? 0), 0);
    return `${bc}:${qty}`;
  }).join("|");
  const branchCount = Object.keys(sales).length;
  return `${total}_${allBarcodes.length}_${branchCount}_${perBarcode}`;
}

// ─── فاتورة المشتريات ────────────────────────────────────────

export function parsePurchaseFile(buffer) {
  const errors   = [];
  const warnings = [];
  let container  = "";

  let wb, ws, rows;
  try {
    wb   = XLSX.read(buffer, { type: "array" });
    ws   = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  } catch (e) {
    return { items: [], container: "", errors: [`فشل فتح الملف: ${e.message}`], warnings: [] };
  }

  if (rows.length < 3) {
    return { items: [], container: "", errors: ["الملف فارغ أو أقل من 3 صفوف"], warnings: [] };
  }

  const row0 = rows[0].join(" ");
  const contMatch = row0.match(/BAR[A-Z0-9]+/i);
  if (contMatch) container = contMatch[0].toUpperCase();
  else warnings.push("لم يُعثر على رقم كونتينر في الصف الأول");

  const merged = {};

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    const barcodeStr = cleanBarcode(row[1]);
    const nameStr    = String(row[2] ?? "").trim();

    if (!barcodeStr || barcodeStr.toLowerCase() === "item no") continue;
    if (!nameStr    || nameStr.toLowerCase()    === "name")    continue;
    if (nameStr.toLowerCase() === "freight")                   continue;
    if (nameStr === "الإجمالي" || nameStr === "Total")         continue;

    const qty = parseInt(row[3]);
    if (isNaN(qty) || qty <= 0) continue;

    const buyPrice  = toNum(row[4]);
    const sellPrice = toNum(row[0]);

    if (buyPrice === 0) warnings.push(`سطر ${i+1}: سعر شراء صفر للمنتج "${nameStr}"`);

    if (merged[barcodeStr]) {
      merged[barcodeStr].qty += qty;
      if (buyPrice  > 0) merged[barcodeStr].buyPrice  = buyPrice;
      if (sellPrice > 0) merged[barcodeStr].sellPrice = sellPrice;
    } else {
      merged[barcodeStr] = { barcode: barcodeStr, name: nameStr, qty, buyPrice, sellPrice, container };
    }
  }

  const items = Object.values(merged);
  if (items.length === 0) errors.push("لم يُعثر على أي منتج صالح");

  return { items, container, errors, warnings };
}

// ─── ملف المبيعات ────────────────────────────────────────────

export function parseSalesFile(buffer, label = "") {
  let rows;
  try {
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  } catch (e) {
    return { period: null, periods: [], errors: [`فشل فتح الملف: ${e.message}`], warnings: [] };
  }

  const monthRow = rows[1] ?? [];
  const monthKeywords = /20\d{2}|يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر/;
  const hasMonths = monthRow.some(v => typeof v === "string" && monthKeywords.test(v) && v.trim() !== "الإجمالي");

  if (hasMonths) {
    const r = parseMonthlyFile(buffer);
    return { period: r.periods?.[0] ?? null, periods: r.periods ?? [], errors: r.errors ?? [], warnings: r.warnings ?? [] };
  }

  const single = parseSalesFileFromRows(rows, label);
  return { period: single.period, periods: single.period ? [single.period] : [], errors: single.errors, warnings: single.warnings };
}

export function parseSalesFileFromRows(rows, label = "") {
  const errors   = [];
  const warnings = [];

  if (!rows || rows.length < 5) {
    return { period: null, errors: ["الملف أقل من 5 صفوف"], warnings: [] };
  }

  const branchRow = rows[1] ?? [];
  const branches  = {};

  branchRow.forEach((val, colIdx) => {
    if (!val || typeof val !== "string") return;
    const str = val.trim();
    if (!str) return;

    // دائماً نأخذ الاسم الكامل قبل القوس (نتجاهل محتوى القوس — يوحّد الفروع)
    let name = str.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (!name) name = str.trim();

    name = cleanBranch(name);
    if (!name) return;
    // نتجنب التكرار بالاسم النظيف
    const alreadyExists = Object.values(branches).some(b => b === name);
    if (alreadyExists) return;
    branches[colIdx] = name;
  });

  if (Object.keys(branches).length === 0) {
    errors.push("لم يُعثر على أي فرع في الصف الثاني");
    return { period: null, errors, warnings };
  }

  const sales = {};
  Object.values(branches).forEach(b => { sales[b] = {}; });

  for (let i = 4; i < rows.length; i++) {
    const row    = rows[i];
    const rawKey = String(row[0] ?? "").trim();

    if (!rawKey) continue;
    if (rawKey === "الإجمالي" || rawKey === "Total" || rawKey === "المجموع") continue;

    const bcMatch = rawKey.match(/\[([^\]]+)\]/);
    if (!bcMatch) continue;

    const barcode  = cleanBarcode(bcMatch[1]);
    if (!barcode) continue;

    const salesName = rawKey.replace(/^\s*\[[^\]]+\]\s*/, "").trim();

    Object.entries(branches).forEach(([colStr, branchName]) => {
      const col        = parseInt(colStr);
      const qty        = toNum(row[col + 1]);
      const totalPrice = toNum(row[col + 2]);

      if (qty <= 0) return;

      if (sales[branchName][barcode]) {
        sales[branchName][barcode].qty        += qty;
        if (salesName && !sales[branchName][barcode].salesNames?.includes(salesName)) {
          sales[branchName][barcode].salesNames = sales[branchName][barcode].salesNames ?? [];
          sales[branchName][barcode].salesNames.push(salesName);
        }
        sales[branchName][barcode].totalPrice += totalPrice;
      } else {
        sales[branchName][barcode] = { qty, totalPrice, salesNames: salesName ? [salesName] : [] };
      }
    });
  }

  const totalRecords = Object.values(sales).reduce((s, d) => s + Object.keys(d).length, 0);

  if (totalRecords === 0) {
    errors.push("لم يُعثر على أي مبيعات");
    return { period: null, errors, warnings };
  }

  const period = {
    id:          uuid(),
    label:       label.trim() || todayStr(),
    uploadDate:  todayStr(),
    sales,
    fingerprint: fingerprint(sales),
  };

  return { period, errors, warnings };
}

// ─── حذف كونتينر وعكس تأثيره ────────────────────────────────

export function reversePurchases(existingProducts, container) {
  const result = existingProducts.map(p => {
    const purchases = (p.purchases ?? []).filter(pur => pur.container !== container);
    if (purchases.length === 0 && (p.purchases ?? []).some(pur => pur.container === container)) {
      return null;
    }
    return { ...p, purchases };
  }).filter(Boolean);

  const removedCount = existingProducts.length - result.length;
  const updatedCount = result.filter((p, i) =>
    JSON.stringify(p.purchases) !== JSON.stringify(existingProducts[i]?.purchases)
  ).length;

  return { products: result, removedCount, updatedCount };
}

// ─── تطبيق قرارات الكونتينر ──────────────────────────────────

export function applyPurchases(existingProducts, newItems, container) {
  const result   = existingProducts.map(p => ({ ...p }));
  const resultMap = {};
  result.forEach(p => { resultMap[p.barcode] = p; });

  const date = new Date().toISOString().slice(0, 10);

  newItems.forEach(item => {
    if (resultMap[item.barcode]) {
      const existing = resultMap[item.barcode];
      existing.purchases = existing.purchases ?? [];
      existing.purchases.push({ container, qty: item.qty, buyPrice: item.buyPrice, date });
      if (item.sellPrice > 0) existing.sellPrice = item.sellPrice;
    } else {
      const newProduct = {
        barcode:   item.barcode,
        name:      item.name,
        sellPrice: item.sellPrice,
        container: item.container || container,
        purchases: [{ container, qty: item.qty, buyPrice: item.buyPrice, date }],
      };
      result.push(newProduct);
      resultMap[item.barcode] = newProduct;
    }
  });

  return result;
}

// ─── رفع ملف شهري (1-12 شهر) ─────────────────────────────────

export function parseMonthlyFile(buffer) {
  const wb   = XLSX.read(buffer, { type: "array" });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  if (rows.length < 5) return { periods: [], errors: ["الملف فارغ أو غير صحيح"] };

  const monthRow  = rows[1] ?? [];
  const branchRow = rows[2] ?? [];

  const monthKeywords = /20\d{2}|يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر/;
  const row1HasMonths = monthRow.some(v => typeof v === "string" && monthKeywords.test(v) && v.trim() !== "الإجمالي");

  if (!row1HasMonths) {
    const single = parseSalesFileFromRows(rows, "");
    if (single.period) {
      return { periods: [single.period], errors: single.errors, warnings: single.warnings };
    }
    return { periods: [], errors: single.errors.length ? single.errors : ["لم يُعثر على شهور أو فروع صالحة"] };
  }

  const monthCols = [];
  monthRow.forEach((val, colIdx) => {
    if (!val || typeof val !== "string") return;
    const s = val.trim();
    if (!s || s === "الإجمالي" || s === "Total") return;
    monthCols.push({ col: colIdx, name: s });
  });

  if (monthCols.length === 0) {
    return { periods: [], errors: ["لم يُعثر على شهور في الصف الثاني"] };
  }

  const monthData = monthCols.map((m, i) => {
    const start = m.col;
    const end   = i + 1 < monthCols.length ? monthCols[i + 1].col : branchRow.length;

    const branches = {};
    for (let col = start; col < end; col++) {
      const val = branchRow[col];
      if (!val || typeof val !== "string") continue;
      const s = val.trim();
      if (!s) continue;

      // دائماً نأخذ الاسم قبل القوس (يوحّد الفروع عبر الفواتير)
      let name = s.replace(/\s*\([^)]*\)\s*$/, "").trim();
      if (!name) name = s.trim();

      name = cleanBranch(name);
      if (!name) continue;
      // نفس الفرع داخل الشهر = نفس الاسم (لا نضيف رقم العمود — يمنع التكرار)
      branches[col] = name;
    }

    return { name: m.name, start, end, branches };
  });

  const periods = [];

  monthData.forEach(month => {
    const sales = {};
    Object.values(month.branches).forEach(b => { sales[b] = {}; });

    let totalUnits = 0;

    for (let i = 5; i < rows.length; i++) {
      const row    = rows[i];
      const rawKey = String(row[0] ?? "").trim();
      if (!rawKey || rawKey === "الإجمالي" || rawKey === "Total") continue;

      const bcMatch = rawKey.match(/\[([^\]]+)\]/);
      if (!bcMatch) continue;
      const barcode = cleanBarcode(bcMatch[1]);
      if (!barcode) continue;

      const salesName = rawKey.replace(/^\s*\[[^\]]+\]\s*/, "").trim();

      Object.entries(month.branches).forEach(([colStr, branchName]) => {
        const col        = parseInt(colStr);
        const qty        = toNum(row[col + 1]);
        const totalPrice = toNum(row[col + 2]);

        if (qty <= 0) return;

        if (sales[branchName][barcode]) {
          sales[branchName][barcode].qty        += qty;
          sales[branchName][barcode].totalPrice += totalPrice;
          if (salesName && !sales[branchName][barcode].salesNames?.includes(salesName)) {
            sales[branchName][barcode].salesNames = sales[branchName][barcode].salesNames ?? [];
            sales[branchName][barcode].salesNames.push(salesName);
          }
        } else {
          sales[branchName][barcode] = { qty, totalPrice, salesNames: salesName ? [salesName] : [] };
        }
        totalUnits += qty;
      });
    }

    const branchTotals = {};
    Object.entries(sales).forEach(([branch, data]) => {
      branchTotals[branch] = Object.values(data).reduce((s, v) => s + v.qty, 0);
    });

    const fp = fingerprint(sales);
    const id = `monthly_${month.name.replace(/\s+/g, "_")}`;

    periods.push({
      id,
      label:      month.name,
      uploadDate: new Date().toISOString().slice(0, 10),
      fingerprint: fp,
      sales,
      totalUnits,
      branchTotals,
    });
  });

  return { periods, errors: [], warnings: [] };
}
