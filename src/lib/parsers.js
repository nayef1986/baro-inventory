// ============================================================
// parsers.js — قراءة ملفات Excel
// ============================================================

import * as XLSX from "xlsx";
import { num } from "./calc.js";

function cleanBarcode(raw) {
  return String(raw ?? "").trim().replace(/了/g, "B").replace(/\s+/g, "");
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
  const total    = Object.values(sales).reduce((s, b) =>
    s + Object.values(b).reduce((ss, v) => ss + num(v.qty), 0), 0);
  const branches = Object.keys(sales).sort().join(",");
  const barcodes = [...new Set(
    Object.values(sales).flatMap(b => Object.keys(b))
  )].sort().slice(0, 10).join(",");
  return `${total}_${branches}_${barcodes}`;
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

  // رقم الكونتينر من الصف الأول
  const row0 = rows[0].join(" ");
  const contMatch = row0.match(/BAR[A-Z0-9]+/i);
  if (contMatch) container = contMatch[0].toUpperCase();
  else warnings.push("لم يُعثر على رقم كونتينر في الصف الأول");

  const merged = {};

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];

    const barcodeStr = cleanBarcode(row[1]);
    const nameStr    = String(row[2] ?? "").trim();

    // تجاهل بدون باركود
    if (!barcodeStr || barcodeStr.toLowerCase() === "item no") continue;
    if (!nameStr    || nameStr.toLowerCase()    === "name")    continue;
    if (nameStr.toLowerCase() === "freight")                   continue;
    if (nameStr === "الإجمالي" || nameStr === "Total")         continue;

    const qty = parseInt(row[3]);
    if (isNaN(qty) || qty <= 0) continue;

    const buyPrice  = toNum(row[4]);
    const sellPrice = toNum(row[0]);

    if (buyPrice === 0) warnings.push(`سطر ${i+1}: سعر شراء صفر للمنتج "${nameStr}"`);

    // باركود مكرر في نفس الملف = يجمع
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
  const errors   = [];
  const warnings = [];

  let wb, ws, rows;
  try {
    wb   = XLSX.read(buffer, { type: "array" });
    ws   = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  } catch (e) {
    return { period: null, errors: [`فشل فتح الملف: ${e.message}`], warnings: [] };
  }

  if (rows.length < 5) {
    return { period: null, errors: ["الملف أقل من 5 صفوف"], warnings: [] };
  }

  // استخراج الفروع من الصف الثاني
  const branchRow = rows[1] ?? [];
  const branches  = {};

  branchRow.forEach((val, colIdx) => {
    if (!val || typeof val !== "string") return;
    const str = val.trim();
    if (!str || str.includes("غير مستخدَم") || str.includes("غير مستخدم")) return;
    const parenMatch = str.match(/\(([^)]+)\)\s*$/);
    const name = parenMatch ? parenMatch[1].trim() : str;
    if (!name) return;
    if (Object.values(branches).includes(name)) return;
    branches[colIdx] = name;
  });

  if (Object.keys(branches).length === 0) {
    errors.push("لم يُعثر على أي فرع في الصف الثاني");
    return { period: null, errors, warnings };
  }

  // تهيئة البيانات
  const sales = {};
  Object.values(branches).forEach(b => { sales[b] = {}; });

  for (let i = 4; i < rows.length; i++) {
    const row    = rows[i];
    const rawKey = String(row[0] ?? "").trim();

    if (!rawKey) continue;
    if (rawKey === "الإجمالي" || rawKey === "Total" || rawKey === "المجموع") continue;

    const bcMatch = rawKey.match(/\[([^\]]+)\]/);
    if (!bcMatch) continue;

    const barcode = cleanBarcode(bcMatch[1]);
    if (!barcode) continue;

    Object.entries(branches).forEach(([colStr, branchName]) => {
      const col        = parseInt(colStr);
      const qty        = toNum(row[col + 1]);
      const totalPrice = toNum(row[col + 2]);

      if (qty <= 0) return;

      if (sales[branchName][barcode]) {
        sales[branchName][barcode].qty        += qty;
        sales[branchName][barcode].totalPrice += totalPrice;
      } else {
        sales[branchName][barcode] = { qty, totalPrice };
      }
    });
  }

  const totalRecords = Object.values(sales).reduce(
    (s, d) => s + Object.keys(d).length, 0
  );

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

// ─── تطبيق قرارات الكونتينر ──────────────────────────────────

export function applyPurchases(existingProducts, newItems, container) {
  const result   = existingProducts.map(p => ({ ...p }));
  const resultMap = {};
  result.forEach(p => { resultMap[p.barcode] = p; });

  const date = new Date().toISOString().slice(0, 10);

  newItems.forEach(item => {
    if (resultMap[item.barcode]) {
      // باركود موجود = يجمع دائماً
      const existing = resultMap[item.barcode];
      existing.purchases = existing.purchases ?? [];
      existing.purchases.push({ container, qty: item.qty, buyPrice: item.buyPrice, date });
      if (item.sellPrice > 0) existing.sellPrice = item.sellPrice;
    } else {
      // منتج جديد
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
