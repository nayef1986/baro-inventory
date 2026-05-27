// ============================================================
// calc.js — محرك الحسابات
// ============================================================

export const MIN_STOCK_DEFAULT = 12;

export function num(v) {
  const n = parseFloat(String(v ?? 0).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

export function pct(a, b) {
  if (!b) return 0;
  return Math.round((a / b) * 1000) / 10;
}

export function fmtN(n) {
  return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export function fmtM(n) {
  return `${fmtN(n)} ﷼`;
}

export function fmtPct(n) {
  return `${Number(n || 0).toFixed(1)}%`;
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ─── باركود / مصنع ──────────────────────────────────────────

export function getFactoryCode(barcode) {
  const s = String(barcode ?? '').replace(/\s/g, '');
  const m = s.match(/^(\d{5})/);
  return m ? m[1] : s.slice(0, 5) || '';
}

export function arabicIncludes(str, search) {
  if (!search) return true;
  const norm = (s) => String(s ?? '')
    .normalize('NFD')
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ةه]/g, 'ه')
    .replace(/[يىئ]/g, 'ي')
    .toLowerCase();
  return norm(str).includes(norm(search));
}

// ─── حسابات المنتج ──────────────────────────────────────────

export function totalPurchases(product) {
  return (product.purchases ?? []).reduce((s, p) => s + num(p.qty), 0);
}

export function soldAllPeriods(barcode, periods) {
  return periods.reduce((s, per) => {
    const data = per.sales ?? {};
    return s + Object.values(data).reduce((ss, branchData) => {
      return ss + num(branchData[barcode]?.qty ?? 0);
    }, 0);
  }, 0);
}

// تحليل إعادة الطلب والترند
// ─── التنبيهات الذكية ────────────────────────────────────────

export function getSmartAlerts(products, periods) {
  if (!periods || periods.length < 2) return [];

  const sorted = [...periods].sort((a,b) =>
    (a.uploadDate??a.label) > (b.uploadDate??b.label) ? 1 : -1
  );

  const alerts = [];

  products.forEach(p => {
    const monthly = sorted.map(per => ({
      label: per.label,
      qty: Object.values(per.sales ?? {}).reduce((s,b) =>
        s + num(b[p.barcode]?.qty ?? 0), 0),
    }));

    const nonZero = monthly.filter(m => m.qty > 0);
    if (nonZero.length < 2) return;

    const last3  = nonZero.slice(-3);
    const prev3  = nonZero.slice(-6, -3);
    const lastQ  = last3.reduce((s,m)=>s+m.qty,0);
    const prevQ  = prev3.length > 0 ? prev3.reduce((s,m)=>s+m.qty,0) : lastQ;
    const growth = prevQ > 0 ? ((lastQ - prevQ) / prevQ) * 100 : 0;

    const bought  = totalPurchases(p);
    const allSold = nonZero.reduce((s,m)=>s+m.qty,0);
    const closing = Math.max(0, bought - allSold);
    const avgMonth = lastQ / Math.max(last3.length, 1);
    const daysLeft = avgMonth > 0 ? Math.round((closing / avgMonth) * 30) : 999;

    // صاعد قوي
    if (growth > 50) {
      alerts.push({
        type: "rising", icon: "📈", color: "green",
        title: p.name, barcode: p.barcode,
        message: `دخل مرحلة صعود قوية +${Math.round(growth)}%`,
        detail: `مبيعات آخر فترة: ${num(last3[last3.length-1]?.qty)}`,
      });
    }

    // هابط قوي
    if (growth < -40 && prevQ > 10) {
      alerts.push({
        type: "falling", icon: "📉", color: "red",
        title: p.name, barcode: p.barcode,
        message: `بدأ يفقد الترند ${Math.round(growth)}%`,
        detail: `راجع المخزون والتسعير`,
      });
    }

    // يحتاج إعادة طلب عاجل
    if (daysLeft <= 14 && closing > 0 && growth >= 0) {
      alerts.push({
        type: "reorder", icon: "🔔", color: "amber",
        title: p.name, barcode: p.barcode,
        message: `أعد الطلب خلال ${daysLeft} يوم`,
        detail: `متبقي ${num(closing)} · معدل ${Math.round(avgMonth)}/شهر`,
      });
    }
  });

  // نرتب: عاجل أولاً
  const order = { reorder: 0, falling: 1, rising: 2 };
  return alerts.sort((a,b) => (order[a.type]??3) - (order[b.type]??3)).slice(0, 30);
}

// ─── ربط الترند بالفروع ──────────────────────────────────────

export function branchTrendAnalysis(products, periods) {
  if (!periods || periods.length < 2) return [];

  const sorted = [...periods].sort((a,b) =>
    (a.uploadDate??a.label) > (b.uploadDate??b.label) ? 1 : -1
  );

  const branches = allBranches(periods);

  return branches.map(branch => {
    const monthly = sorted.map(per => ({
      label: per.label,
      rev: Object.values(per.sales?.[branch] ?? {}).reduce((s,v)=>s+num(v.totalPrice),0),
      qty: Object.values(per.sales?.[branch] ?? {}).reduce((s,v)=>s+num(v.qty),0),
    }));

    const nonZero = monthly.filter(m => m.qty > 0);
    if (nonZero.length < 2) return null;

    const last  = nonZero[nonZero.length-1];
    const prev  = nonZero[nonZero.length-2];
    const growth = prev.qty > 0 ? ((last.qty - prev.qty) / prev.qty) * 100 : 0;
    const totalRev = nonZero.reduce((s,m)=>s+m.rev,0);

    // أكثر المنتجات ربحية في الفرع
    const topProducts = products.map(p => {
      const qty = sorted.slice(-1).reduce((s,per) =>
        s + num(per.sales?.[branch]?.[p.barcode]?.qty ?? 0), 0);
      const rev = sorted.slice(-1).reduce((s,per) =>
        s + num(per.sales?.[branch]?.[p.barcode]?.totalPrice ?? 0), 0);
      const cost = qty * num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
      return { name: p.name, barcode: p.barcode, qty, rev, profit: rev - cost };
    }).filter(p => p.qty > 0).sort((a,b) => b.profit - a.profit).slice(0, 5);

    return { branch, growth, totalRev, lastQty: last.qty, monthly, topProducts };
  }).filter(Boolean).sort((a,b) => b.totalRev - a.totalRev);
}

// ─── أكثر المنتجات ربحية وأسرعها دوراناً ────────────────────

export function topProductsAnalysis(products, periods) {
  if (!periods || periods.length === 0) return { profitable: [], fastest: [] };

  return {
    profitable: products.map(p => {
      const sold = periods.reduce((s, per) =>
        s + Object.values(per.sales ?? {}).reduce((ss,b) => ss + num(b[p.barcode]?.qty ?? 0), 0), 0);
      const rev  = periods.reduce((s, per) =>
        s + Object.values(per.sales ?? {}).reduce((ss,b) => ss + num(b[p.barcode]?.totalPrice ?? 0), 0), 0);
      const cost = sold * num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
      return { ...p, sold, rev, profit: rev - cost, margin: rev > 0 ? ((rev-cost)/rev)*100 : 0 };
    }).filter(p => p.sold > 0).sort((a,b) => b.profit - a.profit).slice(0, 20),

    fastest: products.map(p => {
      const bought = totalPurchases(p);
      const sold   = periods.reduce((s, per) =>
        s + Object.values(per.sales ?? {}).reduce((ss,b) => ss + num(b[p.barcode]?.qty ?? 0), 0), 0);
      const turnover = bought > 0 ? (sold / bought) * 100 : 0;
      return { ...p, sold, bought, turnover };
    }).filter(p => p.bought > 0).sort((a,b) => b.turnover - a.turnover).slice(0, 20),
  };
}

export function analyzeReorder(product, periods) {
  if (!periods || periods.length < 2) return null;

  const sorted = [...periods].sort((a,b) =>
    (a.uploadDate??a.label) > (b.uploadDate??b.label) ? 1 : -1
  );

  // مبيعات كل فترة
  const monthlySales = sorted.map(per => ({
    label: per.label,
    qty: Object.values(per.sales ?? {}).reduce((s,b) =>
      s + num(b[product.barcode]?.qty ?? 0), 0),
  })).filter(m => m.qty > 0);

  if (monthlySales.length < 2) return null;

  const avgSales = monthlySales.reduce((s,m) => s+m.qty, 0) / monthlySales.length;
  const lastSales = monthlySales[monthlySales.length-1].qty;
  const prevSales = monthlySales[monthlySales.length-2].qty;

  const bought  = totalPurchases(product);
  const allSold = monthlySales.reduce((s,m) => s+m.qty, 0);
  const closing = Math.max(0, bought - allSold);

  // أيام حتى النفاد (بافتراض نفس معدل البيع)
  const daysToEmpty = avgSales > 0 ? Math.round((closing / avgSales) * 30) : 999;

  // تحليل الترند
  const growth = prevSales > 0 ? ((lastSales - prevSales) / prevSales) * 100 : 0;

  let status = "normal";
  let message = "";
  let urgent = false;

  if (daysToEmpty <= 14 && closing > 0) {
    status = "urgent";
    message = `أعد الطلب خلال ${daysToEmpty} يوم`;
    urgent = true;
  } else if (daysToEmpty <= 30 && closing > 0) {
    status = "soon";
    message = `يحتاج إعادة طلب قريباً (${daysToEmpty} يوم)`;
  } else if (closing === 0) {
    status = "empty";
    message = "نفد من المخزون";
    urgent = true;
  }

  const trend = growth > 30 ? "rising" : growth < -30 ? "falling" : "stable";
  const trendMsg = growth > 30
    ? `📈 صاعد +${Math.round(growth)}% — ارفع الكمية`
    : growth < -30
    ? `📉 هابط ${Math.round(growth)}% — راقب المخزون`
    : null;

  return { avgSales, lastSales, closing, daysToEmpty, growth, status, message, urgent, trend, trendMsg };
}

export function getSalesNames(barcode, periods) {
  const names = new Set();
  periods.forEach(per => {
    Object.values(per.sales ?? {}).forEach(branch => {
      const item = branch[barcode];
      if (item?.salesNames) item.salesNames.forEach(n => names.add(n));
    });
  });
  return [...names];
}

export function calcProduct(product, periods) {
  const bought  = totalPurchases(product);
  const sold    = soldAllPeriods(product.barcode, periods);
  const closing = Math.max(0, bought - sold);
  const buyPrice = num(product.purchases?.slice(-1)[0]?.buyPrice ?? 0);
  const sellPrice = num(product.sellPrice);
  const revenue = sold * sellPrice;
  const cost    = sold * buyPrice;
  const profit  = revenue - cost;
  const marginPct = buyPrice > 0 ? pct(sellPrice - buyPrice, buyPrice) : 0;
  const soldPct   = bought > 0 ? pct(sold, bought) : 0;

  let status = 'جيد';
  if (closing === 0) status = 'نفد';
  else if (closing < 12) status = 'منخفض';

  return {
    ...product,
    bought, sold, closing, buyPrice, sellPrice,
    revenue, cost, profit, marginPct, soldPct, status,
  };
}

// ─── الكونتينر ──────────────────────────────────────────────

export function allContainers(products) {
  return [...new Set(products.map(p => p.container).filter(Boolean))].sort();
}

export function containerSummary(products, periods, container) {
  const prods = products.filter(p => p.container === container);
  const calced = prods.map(p => calcProduct(p, periods));

  const totalBought  = calced.reduce((s, p) => s + p.bought, 0);
  const totalSold    = calced.reduce((s, p) => s + p.sold, 0);
  const totalClosing = calced.reduce((s, p) => s + p.closing, 0);
  const totalCost    = calced.reduce((s, p) => s + p.cost, 0);
  const totalRevenue = calced.reduce((s, p) => s + p.revenue, 0);
  const totalProfit  = totalRevenue - totalCost;
  const overallMargin = totalCost > 0 ? pct(totalProfit, totalCost) : 0;
  const soldPct = totalBought > 0 ? pct(totalSold, totalBought) : 0;

  return {
    container,
    productCount: prods.length,
    totalBought, totalSold, totalClosing,
    totalCost, totalRevenue, totalProfit,
    overallMargin, soldPct,
    products: calced,
  };
}

// ─── المصانع ────────────────────────────────────────────────

export function allFactoryCodes(products) {
  return [...new Set(products.map(p => getFactoryCode(p.barcode)).filter(Boolean))].sort();
}

export function factoryReport(products, periods, factoryCode) {
  const prods  = products.filter(p => getFactoryCode(p.barcode) === factoryCode);
  const calced = prods.map(p => calcProduct(p, periods));

  const successful = calced.filter(p => p.soldPct >= 60);
  const weak       = calced.filter(p => p.soldPct < 60);

  return {
    factoryCode,
    productCount: prods.length,
    successful, weak,
    products: calced,
  };
}

// ─── الفروع ─────────────────────────────────────────────────

export function allBranches(periods) {
  const set = new Set();
  periods.forEach(per => {
    Object.keys(per.sales ?? {}).forEach(b => set.add(b));
  });
  return [...set].sort();
}

export function branchNeed(products, branch, period, minStock = MIN_STOCK_DEFAULT) {
  if (!period) return [];
  const branchSales = period.sales?.[branch] ?? {};

  return products
    .filter(p => {
      const sold = num(branchSales[p.barcode]?.qty ?? 0);
      return sold > 0;
    })
    .map(p => {
      const sold      = num(branchSales[p.barcode]?.qty ?? 0);
      const given     = sold; // ما أُعطي = ما بيع (تقدير)
      const remaining = Math.max(0, given - sold);
      const needQty   = Math.max(0, minStock - remaining);
      const buyPrice  = num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0);

      return {
        barcode:   p.barcode,
        name:      p.name,
        container: p.container,
        buyPrice,
        sellPrice: num(p.sellPrice),
        sold, given, remaining, needQty,
      };
    })
    .filter(i => i.needQty > 0)
    .sort((a, b) => b.needQty - a.needQty);
}

export function branchTopBottom(products, branch, periods, sortBy = 'sold', topN = 10) {
  const salesMap = {};
  periods.forEach(per => {
    const data = per.sales?.[branch] ?? {};
    Object.entries(data).forEach(([barcode, v]) => {
      if (!salesMap[barcode]) salesMap[barcode] = { qty: 0, totalPrice: 0 };
      salesMap[barcode].qty        += num(v.qty);
      salesMap[barcode].totalPrice += num(v.totalPrice);
    });
  });

  const items = products
    .filter(p => salesMap[p.barcode])
    .map(p => {
      const s       = salesMap[p.barcode];
      const bought  = totalPurchases(p);
      const sold    = s.qty;
      const closing = Math.max(0, bought - sold);
      const soldPct = bought > 0 ? pct(sold, bought) : 0;
      return { ...p, sold, revenue: s.totalPrice, closingQty: closing, soldPct };
    });

  const sorted = [...items].sort((a, b) =>
    sortBy === 'sold' ? b.sold - a.sold : b.closingQty - a.closingQty
  );

  const zero = products.filter(p => !salesMap[p.barcode]);

  return {
    top:    sorted.slice(0, topN),
    bottom: sorted.slice(-topN).reverse(),
    zero,
  };
}

export function branchProductsSorted(products, branch, periods, sortBy = 'sold', filter = { type: 'all' }) {
  const salesMap = {};
  periods.forEach(per => {
    const data = per.sales?.[branch] ?? {};
    Object.entries(data).forEach(([barcode, v]) => {
      if (!salesMap[barcode]) salesMap[barcode] = { qty: 0, totalPrice: 0 };
      salesMap[barcode].qty        += num(v.qty);
      salesMap[barcode].totalPrice += num(v.totalPrice);
    });
  });

  let items = products.map(p => {
    const s       = salesMap[p.barcode] ?? { qty: 0, totalPrice: 0 };
    const bought  = totalPurchases(p);
    const sold    = s.qty;
    const closing = Math.max(0, bought - sold);
    const soldPct = bought > 0 ? pct(sold, bought) : 0;
    return { ...p, sold, revenue: s.totalPrice, closingQty: closing, soldPct };
  });

  if (filter.type === 'container') {
    items = items.filter(p => p.container === filter.value);
  } else if (filter.type === 'factory') {
    items = items.filter(p => getFactoryCode(p.barcode) === filter.value);
  }

  return items.sort((a, b) => {
    if (sortBy === 'sold')    return b.sold - a.sold;
    if (sortBy === 'revenue') return b.revenue - a.revenue;
    if (sortBy === 'closing') return b.closingQty - a.closingQty;
    return 0;
  });
}

// ─── المقارنة ────────────────────────────────────────────────

export function comparePeriods(products, periodA, periodB) {
  if (!periodA || !periodB) return [];

  const getSold = (period, barcode) =>
    Object.values(period.sales ?? {}).reduce((s, d) => s + num(d[barcode]?.qty ?? 0), 0);

  const getRevenue = (period, barcode) =>
    Object.values(period.sales ?? {}).reduce((s, d) => s + num(d[barcode]?.totalPrice ?? 0), 0);

  return products.map(p => {
    const soldA    = getSold(periodA, p.barcode);
    const soldB    = getSold(periodB, p.barcode);
    const revenueA = getRevenue(periodA, p.barcode);
    const revenueB = getRevenue(periodB, p.barcode);
    const diff     = soldB - soldA;
    const diffPct  = soldA > 0 ? pct(diff, soldA) : null;

    let trend = 'ثابت';
    if (soldA === 0 && soldB > 0) trend = 'جديد';
    else if (diff > 0) trend = 'صاعد';
    else if (diff < 0) trend = 'هابط';

    return {
      barcode:  p.barcode,
      name:     p.name,
      container: p.container,
      soldA, soldB, revenueA, revenueB,
      diff, diffPct, trend,
    };
  }).filter(r => r.soldA > 0 || r.soldB > 0);
}
