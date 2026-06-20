// ============================================================
// calc.js — كل الحسابات معزولة عن الواجهة
// ============================================================

const MIN_STOCK = 12;

// ─── مساعدات أساسية ─────────────────────────────────────────

export const num = (v) => Number(v) || 0;

export const pct = (part, total) =>
  total > 0 ? Math.round((num(part) / num(total)) * 1000) / 10 : 0;

export const safeDiv = (a, b) => (num(b) !== 0 ? num(a) / num(b) : 0);

// ─── تنسيق الأرقام ──────────────────────────────────────────

export const fmtN = (v) => {
  const n = Number(v) || 0;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
};
export const fmtM = (v) => {
  const n = Number(v) || 0;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
};
export const fmtPct = (v) => {
  const n = Number(v) || 0;
  return Math.round(n) + "%";
};

// ─── المشتريات ──────────────────────────────────────────────

/**
 * إجمالي الكميات المشتراة لمنتج
 * product.purchases = [{ qty, buyPrice, container, date }]
 */
export function totalPurchases(product) {
  return (product.purchases ?? []).reduce((s, p) => s + num(p.qty), 0);
}

/**
 * متوسط سعر الشراء (مرجح بالكمية)
 */
export function avgBuyPrice(product) {
  const purchases = product.purchases ?? [];
  const totalQty = purchases.reduce((s, p) => s + num(p.qty), 0);
  if (totalQty === 0) return 0;
  const totalCost = purchases.reduce((s, p) => s + num(p.qty) * num(p.buyPrice), 0);
  return totalCost / totalQty;
}

/**
 * تكلفة الكونتينر الكاملة
 */
export function containerCost(products, containerName) {
  return products
    .filter((p) => p.container === containerName)
    .reduce((s, p) => {
      const purchases = p.purchases ?? [];
      const contPurch = purchases.filter((pp) => pp.container === containerName);
      return s + contPurch.reduce((ss, pp) => ss + num(pp.qty) * num(pp.buyPrice), 0);
    }, 0);
}

// ─── المبيعات ───────────────────────────────────────────────

/**
 * مبيعات منتج في فترة واحدة — فرع اختياري
 * period.sales = { [branch]: { [barcode]: { qty, orders, totalPrice } } }
 */
export function soldInPeriod(barcode, period, branch = null) {
  if (!period?.sales) return 0;
  if (branch) {
    return num(period.sales[branch]?.[barcode]?.qty);
  }
  return Object.values(period.sales).reduce(
    (s, branchData) => s + num(branchData[barcode]?.qty),
    0
  );
}

/**
 * إجمالي مبيعات منتج عبر فترات — فرع اختياري
 */
export function soldAllPeriods(barcode, periods, branch = null) {
  return periods.reduce((s, period) => s + soldInPeriod(barcode, period, branch), 0);
}

/**
 * إجمالي إيرادات منتج — فرع اختياري
 */
export function totalRevenue(barcode, periods, branch = null) {
  return periods.reduce((s, period) => {
    if (!period?.sales) return s;
    if (branch) {
      return s + num(period.sales[branch]?.[barcode]?.totalPrice);
    }
    return (
      s +
      Object.values(period.sales).reduce(
        (ss, branchData) => ss + num(branchData[barcode]?.totalPrice),
        0
      )
    );
  }, 0);
}

/**
 * كل الفروع التي باعت منتجاً في فترة
 */
export function branchesSoldProduct(barcode, period) {
  if (!period?.sales) return [];
  return Object.entries(period.sales)
    .filter(([, branchData]) => num(branchData[barcode]?.qty) > 0)
    .map(([branch, branchData]) => ({
      branch,
      qty: num(branchData[barcode].qty),
      totalPrice: num(branchData[barcode].totalPrice),
    }))
    .sort((a, b) => b.qty - a.qty);
}

/**
 * أسماء المنتجات من ملفات المبيعات (باركود → اسم)
 */
export function getSalesNames(periods) {
  const names = {};
  periods.forEach((period) => {
    Object.values(period.sales ?? {}).forEach((branchData) => {
      Object.entries(branchData).forEach(([barcode, d]) => {
        if (d?.name && !names[barcode]) names[barcode] = d.name;
      });
    });
  });
  return names;
}

// ─── المخزون ────────────────────────────────────────────────

/**
 * المتبقي = مشتريات − مباع في كل الفترات
 * لا يرجع أقل من 0
 */
export function closing(product, periods) {
  const bought = totalPurchases(product);
  const sold = soldAllPeriods(product.barcode, periods);
  return Math.max(0, bought - sold);
}

/**
 * حالة المخزون
 */
export function closingStatus(closingQty, purchased) {
  if (purchased === 0) return "بدون_مشتريات";
  if (closingQty === 0) return "نفد";
  if (closingQty <= MIN_STOCK) return "منخفض";
  return "جيد";
}

/**
 * بيانات منتج كاملة محسوبة
 */
export function calcProduct(product, periods) {
  const bought = totalPurchases(product);
  const sold = soldAllPeriods(product.barcode, periods);
  const closingQty = Math.max(0, bought - sold);
  const buyPrice = avgBuyPrice(product);
  const sellPrice = num(product.sellPrice);
  const revenue = totalRevenue(product.barcode, periods);
  const cost = sold * buyPrice;
  const profit = revenue - cost;
  const marginPct = cost > 0 ? pct(profit, cost) : 0;
  const soldPct = pct(sold, bought);

  return {
    ...product,
    bought,
    sold,
    closing: closingQty,
    status: closingStatus(closingQty, bought),
    buyPrice,
    sellPrice,
    revenue,
    cost,
    profit,
    marginPct,
    soldPct,
  };
}

// ─── الفروع ─────────────────────────────────────────────────

/**
 * المتبقي الفعلي لمنتج في فرع — يدعم 3 حالات:
 * - لا تعديل: تقدير دزينة المبيعات ناقص المبيعات
 * - تعديل رقم قديم: ثابت
 * - تعديل كائن فيه qty و atPeriodCount: الكمية ناقص مبيعات الفترات الجديدة
 * مثال: عدّل لـ12 عند 5 فترات، رفع فترة باع فيها 4، المتبقي = 8
 */
export function getBranchRemaining(branch, barcode, periods, overrides = {}, minStock = 12) {
  const sold = soldAllPeriods(barcode, periods, branch);
  const key = branch + "|" + barcode;
  const ov = overrides[key];

  if (ov === undefined || ov === null) {
    const given = Math.ceil(sold / minStock) * minStock;
    return Math.max(0, given - sold);
  }
  if (typeof ov === "number") {
    return Math.max(0, ov);
  }
  const baseQty = num(ov.qty);
  const atCount = num(ov.atPeriodCount);
  const newPeriods = periods.slice(atCount);
  const newSold = newPeriods.reduce((s, per) => s + soldInPeriod(barcode, per, branch), 0);
  return Math.max(0, baseQty - newSold);
}

/**
 * كل الفروع من مجموعة فترات
 */
export function allBranches(periods) {
  const set = new Set();
  periods.forEach((period) => {
    Object.keys(period.sales ?? {}).forEach((b) => set.add(b));
  });
  return [...set].sort();
}

/**
 * تقييم منتج في فرع
 */
export function productStrengthInBranch(product, branch, periods, mode = "sold") {
  const sold = soldAllPeriods(product.barcode, periods, branch);
  const bought = totalPurchases(product);
  const closingQty = closing(product, periods);
  const soldPct = pct(sold, bought);
  const closingPct = pct(closingQty, bought);

  let score = 0;
  if (mode === "sold")    score = sold;
  if (mode === "closing") score = closingQty;
  if (mode === "both")    score = (soldPct + (100 - closingPct)) / 2;

  return { sold, closingQty, soldPct, closingPct, score };
}

/**
 * منتجات فرع مرتبة حسب القوة
 */
export function branchProductsSorted(products, branch, periods, sortBy = "sold", filter = { type: "all" }) {
  let filtered = products;

  if (filter.type === "container") {
    filtered = products.filter((p) => p.container === filter.value);
  } else if (filter.type === "factory") {
    filtered = products.filter((p) => getFactoryCode(p.barcode) === filter.value);
  }

  return filtered
    .map((p) => {
      const sold = soldAllPeriods(p.barcode, periods, branch);
      const bought = totalPurchases(p);
      const closingQty = Math.max(0, bought - soldAllPeriods(p.barcode, periods));
      const soldPct = pct(sold, bought);
      const revenue = totalRevenue(p.barcode, periods, branch);
      return { ...p, sold, bought, closingQty, soldPct, revenue };
    })
    .sort((a, b) => {
      if (sortBy === "sold")    return b.sold - a.sold;
      if (sortBy === "closing") return b.closingQty - a.closingQty;
      return 0;
    });
}

/**
 * أقوى وأضعف N منتج في فرع
 */
export function branchTopBottom(products, branch, periods, sortBy = "sold", n = 5) {
  const sorted = branchProductsSorted(products, branch, periods, sortBy);
  const withSales = sorted.filter((p) => p.sold > 0);
  const noSales   = sorted.filter((p) => p.sold === 0);
  return {
    top:    withSales.slice(0, n),
    bottom: withSales.slice(-n).reverse(),
    zero:   noSales,
  };
}

/**
 * احتياج فرع من آخر فترة
 */
export function branchNeed(products, branch, period) {
  if (!period?.sales) return [];
  const branchData = period.sales[branch] ?? {};

  return products
    .map((p) => {
      const sold = num(branchData[p.barcode]?.qty);
      if (sold === 0) return null;

      const dozens = Math.ceil(sold / MIN_STOCK);
      const given = dozens * MIN_STOCK;
      const remaining = given - sold;
      const needQty = Math.max(0, MIN_STOCK - remaining);

      if (needQty === 0) return null;

      return {
        ...p,
        sold,
        given,
        remaining,
        needQty,
        buyPrice: avgBuyPrice(p),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.needQty - a.needQty);
}

// ─── الكونتينر ──────────────────────────────────────────────

/**
 * ملخص كونتينر كامل
 */
export function containerSummary(products, containerName, periods) {
  const contProducts = products.filter((p) => p.container === containerName);

  const rows = contProducts.map((p) => {
    const calc = calcProduct(p, periods);
    return calc;
  });

  const totalBought   = rows.reduce((s, r) => s + r.bought, 0);
  const totalSold     = rows.reduce((s, r) => s + r.sold, 0);
  const totalClosing  = rows.reduce((s, r) => s + r.closing, 0);
  const totalCost     = rows.reduce((s, r) => s + r.cost, 0);
  const totalRevenue_ = rows.reduce((s, r) => s + r.revenue, 0);
  const totalProfit   = rows.reduce((s, r) => s + r.profit, 0);
  const overallMargin = totalCost > 0 ? pct(totalProfit, totalCost) : 0;
  const soldPct       = pct(totalSold, totalBought);

  return {
    container: containerName,
    productCount: contProducts.length,
    totalBought,
    totalSold,
    totalClosing,
    totalCost,
    totalRevenue: totalRevenue_,
    totalProfit,
    overallMargin,
    soldPct,
    products: rows,
  };
}

// ─── تقرير المصنع ───────────────────────────────────────────

/**
 * منتجات مصنع مع نسب مبيعاتها
 */
export function factoryReport(products, factoryCode, periods, threshold) {
  const facProducts = products.filter(
    (p) => getFactoryCode(p.barcode) === factoryCode
  );

  const rows = facProducts.map((p) => {
    const calc = calcProduct(p, periods);
    const repeat = threshold != null ? calc.soldPct >= threshold : null;
    return { ...calc, repeat };
  });

  const successful = threshold != null ? rows.filter((r) => r.repeat) : [];
  const weak       = threshold != null ? rows.filter((r) => !r.repeat) : [];

  return {
    factoryCode,
    productCount: facProducts.length,
    products: rows,
    successful,
    weak,
    threshold,
  };
}

// ─── المقارنة بين فترتين ────────────────────────────────────

/**
 * مقارنة فترتين — على مستوى المنتجات
 */
export function comparePeriods(products, periodA, periodB) {
  return products.map((p) => {
    const soldA = soldInPeriod(p.barcode, periodA);
    const soldB = soldInPeriod(p.barcode, periodB);
    const revenueA = totalRevenue(p.barcode, [periodA]);
    const revenueB = totalRevenue(p.barcode, [periodB]);
    const diff = soldB - soldA;
    const diffPct = soldA > 0 ? pct(diff, soldA) : null;
    const trend =
      diff > 0 ? "صاعد" : diff < 0 ? "هابط" : "ثابت";

    return {
      barcode: p.barcode,
      name: p.name,
      container: p.container,
      soldA,
      soldB,
      revenueA,
      revenueB,
      diff,
      diffPct,
      trend,
    };
  });
}

/**
 * مقارنة فرعين في نفس الفترة
 */
export function compareBranches(products, period, branchA, branchB) {
  return products.map((p) => {
    const soldA = soldInPeriod(p.barcode, period, branchA);
    const soldB = soldInPeriod(p.barcode, period, branchB);
    const revenueA = num(period.sales?.[branchA]?.[p.barcode]?.totalPrice);
    const revenueB = num(period.sales?.[branchB]?.[p.barcode]?.totalPrice);
    const diff = soldB - soldA;

    return {
      barcode: p.barcode,
      name: p.name,
      container: p.container,
      soldA,
      soldB,
      revenueA,
      revenueB,
      diff,
      winner: soldA > soldB ? branchA : soldB > soldA ? branchB : "متساوي",
    };
  });
}

// ─── مساعدات عامة ───────────────────────────────────────────

/**
 * كود المصنع = أول 5 أرقام من الباركود
 */
export function getFactoryCode(barcode) {
  const str = String(barcode ?? "").trim();
  if (str.length < 5) return str;
  return str.slice(0, 5);
}

/**
 * كل كونتينرات المنتجات
 */
export function allContainers(products) {
  return [...new Set(products.map((p) => p.container).filter(Boolean))].sort();
}

/**
 * كل كودات المصانع
 */
export function allFactoryCodes(products) {
  return [...new Set(products.map((p) => getFactoryCode(p.barcode)).filter(Boolean))].sort();
}

/**
 * فلترة نص مع تطبيع الهمزة والألف
 */
export function normalizeArabic(text) {
  return String(text ?? "")
    .replace(/[أإآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .trim();
}

export function arabicIncludes(text, query) {
  return normalizeArabic(text).includes(normalizeArabic(query));
}

export { MIN_STOCK };
