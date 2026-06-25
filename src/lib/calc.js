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

export function totalPurchases(product) {
  return (product.purchases ?? []).reduce((s, p) => s + num(p.qty), 0);
}

export function avgBuyPrice(product) {
  const purchases = product.purchases ?? [];
  const totalQty = purchases.reduce((s, p) => s + num(p.qty), 0);
  if (totalQty === 0) return 0;
  const totalCost = purchases.reduce((s, p) => s + num(p.qty) * num(p.buyPrice), 0);
  return totalCost / totalQty;
}

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

export function soldAllPeriods(barcode, periods, branch = null) {
  return periods.reduce((s, period) => s + soldInPeriod(barcode, period, branch), 0);
}

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

export function closing(product, periods) {
  const bought = totalPurchases(product);
  const sold = soldAllPeriods(product.barcode, periods);
  return Math.max(0, bought - sold);
}

export function closingStatus(closingQty, purchased) {
  if (purchased === 0) return "بدون_مشتريات";
  if (closingQty === 0) return "نفد";
  if (closingQty <= MIN_STOCK) return "منخفض";
  return "جيد";
}

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
    bought, sold, closing: closingQty,
    status: closingStatus(closingQty, bought),
    buyPrice, sellPrice, revenue, cost, profit, marginPct, soldPct,
  };
}

// ─── الفروع ─────────────────────────────────────────────────

/**
 * المتبقي الفعلي لمنتج في فرع — يدعم 3 حالات:
 * - لا تعديل: تقدير دزينة المبيعات ناقص المبيعات
 * - تعديل رقم قديم: ثابت
 * - تعديل كائن فيه qty و atPeriodCount: الكمية ناقص مبيعات الفترات الجديدة
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

export function allBranches(periods) {
  const set = new Set();
  periods.forEach((period) => {
    Object.keys(period.sales ?? {}).forEach((b) => set.add(b));
  });
  return [...set].sort();
}

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

      return { ...p, sold, given, remaining, needQty, buyPrice: avgBuyPrice(p) };
    })
    .filter(Boolean)
    .sort((a, b) => b.needQty - a.needQty);
}

// ─── الكونتينر ──────────────────────────────────────────────

export function containerSummary(products, periods, containerName) {
  const contProducts = products.filter((p) => p.container === containerName);
  const rows = contProducts.map((p) => calcProduct(p, periods));

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
    totalBought, totalSold, totalClosing, totalCost,
    totalRevenue: totalRevenue_, totalProfit, overallMargin, soldPct,
    products: rows,
  };
}

// ─── تقرير المصنع ───────────────────────────────────────────

export function factoryReport(products, periods, factoryCode, threshold) {
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

  return { factoryCode, productCount: facProducts.length, products: rows, successful, weak, threshold };
}

// ─── المقارنة ───────────────────────────────────────────────

export function comparePeriods(products, periodA, periodB) {
  return products.map((p) => {
    const soldA = soldInPeriod(p.barcode, periodA);
    const soldB = soldInPeriod(p.barcode, periodB);
    const revenueA = totalRevenue(p.barcode, [periodA]);
    const revenueB = totalRevenue(p.barcode, [periodB]);
    const diff = soldB - soldA;
    const diffPct = soldA > 0 ? pct(diff, soldA) : null;
    const trend = diff > 0 ? "صاعد" : diff < 0 ? "هابط" : "ثابت";

    return {
      barcode: p.barcode, name: p.name, container: p.container,
      soldA, soldB, revenueA, revenueB, diff, diffPct, trend,
    };
  });
}

export function compareBranches(products, period, branchA, branchB) {
  return products.map((p) => {
    const soldA = soldInPeriod(p.barcode, period, branchA);
    const soldB = soldInPeriod(p.barcode, period, branchB);
    const revenueA = num(period.sales?.[branchA]?.[p.barcode]?.totalPrice);
    const revenueB = num(period.sales?.[branchB]?.[p.barcode]?.totalPrice);
    const diff = soldB - soldA;

    return {
      barcode: p.barcode, name: p.name, container: p.container,
      soldA, soldB, revenueA, revenueB, diff,
      winner: soldA > soldB ? branchA : soldB > soldA ? branchB : "متساوي",
    };
  });
}

// ─── مساعدات عامة ───────────────────────────────────────────

export function getFactoryCode(barcode) {
  const str = String(barcode ?? "").trim();
  if (str.length < 5) return str;
  return str.slice(0, 5);
}

export function allContainers(products) {
  return [...new Set(products.map((p) => p.container).filter(Boolean))].sort();
}

export function allFactoryCodes(products) {
  return [...new Set(products.map((p) => getFactoryCode(p.barcode)).filter(Boolean))].sort();
}

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

// ─── تحليلات التقارير ───────────────────────────────────────

export function analyzeReorder(product, periods) {
  if (!periods || periods.length === 0) return null;
  const bought = totalPurchases(product);
  if (bought === 0) return null;
  const sold = soldAllPeriods(product.barcode, periods);
  const closingQty = Math.max(0, bought - sold);

  const perSales = periods.map(per => soldInPeriod(product.barcode, per));
  const active = perSales.filter(q => q > 0);
  if (active.length === 0) return null;
  const avgSales = active.reduce((s, q) => s + q, 0) / active.length;
  const lastSales = perSales[perSales.length - 1];

  const monthsToEmpty = avgSales > 0 ? closingQty / avgSales : 999;
  const daysToEmpty = Math.round(monthsToEmpty * 30);

  let status = "ok";
  if (closingQty === 0) status = "empty";
  else if (daysToEmpty <= 30) status = "urgent";
  else if (daysToEmpty <= 60) status = "soon";

  let trend = "stable";
  if (lastSales > avgSales * 1.2) trend = "rising";
  else if (lastSales < avgSales * 0.8) trend = "falling";

  let message = "";
  if (status === "empty") message = "⛔ نفد المخزون";
  else if (status === "urgent") message = `🔴 ينفد خلال ${daysToEmpty} يوم — اطلب الآن`;
  else if (status === "soon") message = `🟡 ينفد خلال ${daysToEmpty} يوم`;

  let trendMsg = "";
  if (trend === "rising") trendMsg = "📈 الطلب يرتفع — زِد الكمية";
  else if (trend === "falling") trendMsg = "📉 الطلب ينخفض";

  return { status, trend, daysToEmpty, closing: closingQty, avgSales, lastSales, message, trendMsg };
}

export function getSmartAlerts(products, periods) {
  if (!periods || periods.length < 2) return [];
  const alerts = [];
  const lastPer = periods[periods.length - 1];
  const prevPer = periods[periods.length - 2];

  products.forEach(p => {
    const soldLast = soldInPeriod(p.barcode, lastPer);
    const soldPrev = soldInPeriod(p.barcode, prevPer);
    const bought = totalPurchases(p);
    const closingQty = Math.max(0, bought - soldAllPeriods(p.barcode, periods));

    if (soldPrev > 0 && soldLast >= soldPrev * 2 && soldLast >= 6) {
      alerts.push({
        icon: "🚀", title: p.name, barcode: p.barcode, color: "green",
        message: `صاعد قوي +${Math.round(((soldLast - soldPrev) / soldPrev) * 100)}%`,
        detail: `باع ${soldPrev} ← ${soldLast}`,
      });
    } else if (soldPrev >= 6 && soldLast <= soldPrev * 0.4) {
      alerts.push({
        icon: "📉", title: p.name, barcode: p.barcode, color: "red",
        message: `هابط حاد -${Math.round(((soldPrev - soldLast) / soldPrev) * 100)}%`,
        detail: `باع ${soldPrev} ← ${soldLast}`,
      });
    } else if (closingQty > 0 && closingQty <= MIN_STOCK && soldLast > 0) {
      alerts.push({
        icon: "🔔", title: p.name, barcode: p.barcode, color: "amber",
        message: `يحتاج إعادة طلب`,
        detail: `متبقي ${closingQty} · باع ${soldLast} آخر فترة`,
      });
    }
  });

  return alerts.sort((a, b) => {
    const order = { red: 0, green: 1, amber: 2 };
    return order[a.color] - order[b.color];
  });
}

export function topProductsAnalysis(products, periods) {
  const calc = products.map(p => {
    const bought = totalPurchases(p);
    const sold = soldAllPeriods(p.barcode, periods);
    const buyPrice = avgBuyPrice(p);
    const sellPrice = num(p.sellPrice);
    const rev = totalRevenue(p.barcode, periods);
    const cost = sold * buyPrice;
    const profit = rev - cost;
    const margin = cost > 0 ? (profit / cost) * 100 : 0;
    const turnover = bought > 0 ? (sold / bought) * 100 : 0;
    return { ...p, bought, sold, rev, profit, margin, turnover };
  });

  const profitable = [...calc].filter(p => p.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 30);
  const fastest = [...calc].filter(p => p.sold > 0).sort((a, b) => b.turnover - a.turnover).slice(0, 30);

  return { profitable, fastest };
}

export function branchTrendAnalysis(products, periods) {
  if (!periods || periods.length === 0) return [];
  const branches = allBranches(periods);
  const lastPer = periods[periods.length - 1];
  const prevPer = periods.length >= 2 ? periods[periods.length - 2] : null;

  return branches.map(branch => {
    let totalRev = 0;
    Object.values(lastPer.sales?.[branch] ?? {}).forEach(d => { totalRev += num(d.totalPrice); });

    let growth = 0;
    if (prevPer) {
      let revPrev = 0;
      Object.values(prevPer.sales?.[branch] ?? {}).forEach(d => { revPrev += num(d.totalPrice); });
      growth = revPrev > 0 ? ((totalRev - revPrev) / revPrev) * 100 : 0;
    }

    const branchSales = lastPer.sales?.[branch] ?? {};
    const topProducts = Object.entries(branchSales)
      .map(([barcode, d]) => {
        const prod = products.find(p => p.barcode === barcode);
        return { barcode, name: prod?.name ?? barcode, qty: num(d.qty) };
      })
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 3);

    return { branch, growth, totalRev, topProducts };
  }).sort((a, b) => b.totalRev - a.totalRev);
}

export { MIN_STOCK };
