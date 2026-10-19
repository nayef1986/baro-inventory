// ============================================================
// season.js — محرك تحليل الموسم (رمضان وغيره)
// يحلل الفترات المرفوعة: الأفضل مبيعًا · الفئات · متى انتعشت ومتى هبطت
// لكل الفروع ولكل فرع لحاله · ثم يوصي ايش نجيب لكل فرع
// ============================================================

import {
  num, getCategoryCode, getCategoryName, getFactoryCode,
  allBranches, totalPurchases,
} from "./calc.js";

// ─── تاريخ الفترة ────────────────────────────────────────────
// الفترات المرفوعة يوميًا اسمها يكتبه المستخدم. نحاول نطلع تاريخ
// نرتب عليه؛ ولو ما قدرنا نعتمد ترتيب الرفع نفسه.

const AR_MONTHS = {
  "يناير":1,"فبراير":2,"مارس":3,"أبريل":4,"ابريل":4,"مايو":5,"يونيو":6,
  "يوليو":7,"أغسطس":8,"اغسطس":9,"سبتمبر":9,"أكتوبر":10,"اكتوبر":10,
  "نوفمبر":11,"ديسمبر":12,
};

/**
 * يستخرج مفتاح ترتيب زمني من اسم الفترة.
 * يفهم: 2026-03-15 · 15/3/2026 · 15-3 · "15 مارس" · "رمضان 12" · "يوم 12"
 * يرجّع رقم للترتيب، أو null لو ما فهم.
 */
export function parsePeriodDate(label) {
  const s = String(label ?? "").trim();
  if (!s) return null;

  // 2026-03-15 أو 2026/03/15
  let m = s.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return (+m[1]) * 10000 + (+m[2]) * 100 + (+m[3]);

  // 15-03-2026 أو 15/3/2026
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/);
  if (m) return (+m[3]) * 10000 + (+m[2]) * 100 + (+m[1]);

  // "15 مارس 2026" أو "مارس 15"
  for (const [name, mo] of Object.entries(AR_MONTHS)) {
    if (!s.includes(name)) continue;
    const dayM  = s.match(/(\d{1,2})/);
    const yearM = s.match(/(20\d{2})/);
    const year  = yearM ? +yearM[1] : 2000;
    const day   = dayM ? +dayM[1] : 1;
    return year * 10000 + mo * 100 + (day > 31 ? 1 : day);
  }

  // "رمضان 12" / "يوم 12" / "اليوم 12" — موسم بأيام متتابعة
  m = s.match(/(?:رمضان|يوم|اليوم|day)\s*[-#]?\s*(\d{1,2})/i);
  if (m) return 100 + (+m[1]);   // نطاق صغير منفصل، يرتب بين نفسه

  // 15-03 أو 15/3 (بدون سنة)
  m = s.match(/(\d{1,2})[-/.](\d{1,2})(?!\d)/);
  if (m) return 2000 * 10000 + (+m[2]) * 100 + (+m[1]);

  return null;
}

/**
 * يرتب الفترات زمنيًا ويعطي كل واحدة رقم تسلسلي.
 * لو ما فيه تواريخ مفهومة، يعتمد ترتيب الرفع كما هو.
 */
export function orderPeriods(periods) {
  const withKeys = (periods ?? []).map((p, i) => ({
    period: p,
    idx: i,
    key: parsePeriodDate(p?.label) ?? parsePeriodDate(p?.uploadDate),
  }));

  const parsedCount = withKeys.filter(x => x.key !== null).length;

  // لو أقل من نصفهم مفهوم، ما نخاطر — نخلي ترتيب الرفع
  if (parsedCount < withKeys.length / 2) {
    return withKeys.map((x, i) => ({ ...x.period, _ord: i, _dateKey: null }));
  }

  const sorted = [...withKeys].sort((a, b) => {
    if (a.key === null) return 1;
    if (b.key === null) return -1;
    return (a.key - b.key) || (a.idx - b.idx);
  });

  return sorted.map((x, i) => ({ ...x.period, _ord: i, _dateKey: x.key }));
}

// ─── أدوات ──────────────────────────────────────────────────

const byBranch = (period, branch) =>
  branch ? (period?.sales?.[branch] ?? {}) : null;

/** كمية وإيراد منتج في فترة (لفرع معيّن أو كل الفروع) */
function cellOf(period, barcode, branch = null) {
  if (!period?.sales) return { qty: 0, rev: 0 };
  if (branch) {
    const d = period.sales[branch]?.[barcode];
    return { qty: num(d?.qty), rev: num(d?.totalPrice) };
  }
  let qty = 0, rev = 0;
  Object.values(period.sales).forEach(bd => {
    qty += num(bd[barcode]?.qty);
    rev += num(bd[barcode]?.totalPrice);
  });
  return { qty, rev };
}

/** سعر الشراء الأخير */
function buyPriceOf(product) {
  return num(product?.purchases?.slice(-1)[0]?.buyPrice);
}

// ─── الأفضل مبيعًا: منتجات ──────────────────────────────────

/**
 * يرتب المنتجات حسب الموسم كامل.
 * branch = null يعني كل الفروع.
 * يرجّع لكل منتج: الكمية · الإيراد · الربح · نسبة الدوران
 */
export function rankProducts(products, periods, settings, branch = null) {
  const ord = periods;   // مرتبة مسبقًا
  const rows = [];

  (products ?? []).forEach(p => {
    let qty = 0, rev = 0;
    ord.forEach(per => {
      const c = cellOf(per, p.barcode, branch);
      qty += c.qty; rev += c.rev;
    });
    if (qty <= 0) return;

    const buy    = buyPriceOf(p);
    const profit = rev - (qty * buy);
    const bought = totalPurchases(p);
    const turn   = bought > 0 ? (qty / bought) * 100 : 0;

    const fac = getFactoryCode(p.barcode);
    rows.push({
      barcode:  p.barcode,
      name:     p.name ?? "",
      product:  p,
      cat:      getCategoryCode(p.barcode),
      catName:  getCategoryName(p.barcode, settings),
      fac,
      facName:  settings?.factories?.[fac] ?? "",
      cont:     p.container ?? "",
      sellPrice: num(p.sellPrice),
      qty, rev, profit,
      buyPrice: buy,
      bought,
      turnPct:  turn,
    });
  });

  return rows;
}

/** ترتيب جاهز بمقياس معيّن */
export function sortBy(rows, metric = "qty") {
  const key = metric === "profit" ? "profit"
            : metric === "rev"    ? "rev"
            : metric === "turn"   ? "turnPct"
            : "qty";
  return [...rows].sort((a, b) => b[key] - a[key]);
}

// ─── الأفضل مبيعًا: فئات ────────────────────────────────────

/** يجمع صفوف المنتجات على مستوى الفئة */
export function rankCategories(rows) {
  const map = {};
  rows.forEach(r => {
    const k = r.cat;
    if (!map[k]) map[k] = {
      cat: k, catName: r.catName,
      qty: 0, rev: 0, profit: 0, items: 0, barcodes: [],
    };
    map[k].qty    += r.qty;
    map[k].rev    += r.rev;
    map[k].profit += r.profit;
    map[k].items  += 1;
    map[k].barcodes.push(r.barcode);
  });
  return Object.values(map);
}

// ─── الخط الزمني: متى انتعشت ومتى هبطت ─────────────────────

/**
 * إجمالي كل فترة (كمية + إيراد) — لكل الفروع أو فرع واحد.
 * يرجّع مصفوفة مرتبة زمنيًا مع نسبة التغير عن اللي قبلها.
 */
export function timeline(periods, branch = null) {
  const pts = (periods ?? []).map(per => {
    let qty = 0, rev = 0;
    const src = branch ? { [branch]: byBranch(per, branch) } : (per.sales ?? {});
    Object.values(src).forEach(bd => {
      Object.values(bd ?? {}).forEach(d => { qty += num(d?.qty); rev += num(d?.totalPrice); });
    });
    return { label: per.label ?? "", ord: per._ord ?? 0, qty, rev };
  });

  const avg = pts.length ? pts.reduce((s,p)=>s+p.qty,0) / pts.length : 0;

  return pts.map((p, i) => {
    const prev   = i > 0 ? pts[i-1].qty : null;
    const change = prev !== null && prev > 0 ? ((p.qty - prev) / prev) * 100 : null;
    return {
      ...p,
      change,
      vsAvgPct: avg > 0 ? ((p.qty - avg) / avg) * 100 : 0,
    };
  });
}

/**
 * يستخرج الذرى (انتعاش) والهبوط من خط زمني.
 * الانتعاش: فوق المتوسط بنسبة thresholdPct على الأقل.
 * الهبوط: تحت المتوسط بنفس النسبة.
 */
export function peaksAndDips(tl, thresholdPct = 20) {
  const peaks = tl.filter(p => p.vsAvgPct >=  thresholdPct)
                  .sort((a,b) => b.qty - a.qty);
  const dips  = tl.filter(p => p.vsAvgPct <= -thresholdPct)
                  .sort((a,b) => a.qty - b.qty);
  const best  = tl.length ? tl.reduce((m,p)=> p.qty > m.qty ? p : m, tl[0]) : null;
  const worst = tl.length ? tl.reduce((m,p)=> p.qty < m.qty ? p : m, tl[0]) : null;
  const total = tl.reduce((s,p)=>s+p.qty, 0);
  const avg   = tl.length ? total / tl.length : 0;
  return { peaks, dips, best, worst, avg, total };
}

/**
 * الخط الزمني لمنتج واحد (أو مجموعة باركودات = فئة).
 * يكشف متى انتعش هذا المنتج تحديدًا ومتى هبط.
 */
export function timelineFor(periods, barcodes, branch = null) {
  const codes = Array.isArray(barcodes) ? barcodes : [barcodes];
  const pts = (periods ?? []).map(per => {
    let qty = 0, rev = 0;
    codes.forEach(bc => {
      const c = cellOf(per, bc, branch);
      qty += c.qty; rev += c.rev;
    });
    return { label: per.label ?? "", ord: per._ord ?? 0, qty, rev };
  });
  const avg = pts.length ? pts.reduce((s,p)=>s+p.qty,0)/pts.length : 0;
  return pts.map((p,i) => {
    const prev = i>0 ? pts[i-1].qty : null;
    return {
      ...p,
      change:   prev !== null && prev > 0 ? ((p.qty-prev)/prev)*100 : null,
      vsAvgPct: avg > 0 ? ((p.qty-avg)/avg)*100 : 0,
    };
  });
}

// ─── دورة حياة المنتج خلال الموسم ───────────────────────────
// الفرق بين "نفد" و"ضعف طلبه" حاسم:
//   نفد   → الطلب أعلى من اللي بعناه، لازم نزيد
//   ضعف   → عنده بضاعة وما انباعت، لازم نقلل
// بدونه نقرأ النفاد على إنه ضعف ونقلل منتج ناجح.

/** هل الفترة الأخيرة في المدة؟ نعتبر النفاد "مبكّرًا" لو بقي وقت معتبر */
const EARLY_RATIO = 0.8;    // نفد قبل 80% من المدة = مبكّر
const SOLDOUT_AT  = 0.92;   // باع 92% من الوارد = اعتبره نفد

/**
 * يحلل سلوك المنتج عبر الموسم:
 * متى نفد · كم فترة وقف فيها · معدل بيعه وهو متوفر ·
 * كم كان بيبيع لو ما نفد · وكم ضاع علينا.
 */
export function productLifecycle(product, periods, branch = null) {
  const n      = periods.length;
  const bought = totalPurchases(product);
  const pts    = periods.map(per => cellOf(per, product.barcode, branch));
  const qtys   = pts.map(p => p.qty);

  const sold = qtys.reduce((s,q) => s + q, 0);

  // أول وآخر فترة فيها بيع
  let firstIdx = -1, lastIdx = -1;
  for (let i = 0; i < n; i++)      if (qtys[i] > 0) { firstIdx = i; break; }
  for (let i = n - 1; i >= 0; i--) if (qtys[i] > 0) { lastIdx  = i; break; }

  const activeCount   = qtys.filter(q => q > 0).length;
  const trailingZeros = lastIdx >= 0 ? (n - 1 - lastIdx) : n;

  // هل نفد؟ التراكمي وصل ~كل الوارد.
  // العتبة تكشف النفاد، لكن *يوم* النفاد = آخر يوم باع فيه فعلًا —
  // لأن العتبة تقريبية وتسبق الواقع بفترة أو فترتين.
  const soldOutFlag = bought > 0 && sold >= bought * SOLDOUT_AT;
  const outIdx      = soldOutFlag ? lastIdx : -1;

  const turnPct = bought > 0 ? (sold / bought) * 100 : 0;
  const left    = Math.max(0, bought - sold);

  // المدى اللي كان متوفرًا فيه فعلًا = من أول بيعة لآخر بيعة.
  // نستخدم lastIdx مو outIdx: عتبة النفاد (92%) تقريبية وتُستخدم للتسمية فقط،
  // أما المعدل فلازم يُحسب على الأيام اللي باع فيها فعلًا وإلا طلع منفوخًا.
  const availSpan = (firstIdx >= 0 && lastIdx >= firstIdx) ? (lastIdx - firstIdx + 1) : 0;
  const rate      = availSpan > 0 ? sold / availSpan : 0;   // معدل البيع للفترة الواحدة

  // لو كان متوفرًا طول المدة، كم كان بيبيع؟
  const projected = rate > 0 ? Math.round(rate * n) : sold;
  const lost      = Math.max(0, projected - sold);

  // ── تحديد الحالة ──
  let status, note, color, severity;

  if (sold <= 0) {
    status = "ما تحرك"; color = "#475569"; severity = 4;
    note = bought > 0 ? `${fmtInt(bought)} قطعة واقفة بلا بيعة وحدة` : "ما له حركة ولا سجل شراء";

  } else if (outIdx >= 0 && outIdx < Math.floor(n * EARLY_RATIO)) {
    status = "نفد مبكرًا"; color = "#38bdf8"; severity = 0;
    note = `خلص في «${periods[outIdx]?.label ?? ""}» وباقي ${fmtInt(n-1-outIdx)} فترة — `
         + `ضاع علينا ~${fmtInt(lost)} قطعة`;
    // باع أكثر من المسجّل وارد → سجل المشتريات ناقص، نبهه بدل ما نعطيه رقمًا مضللًا
    if (turnPct > 115) {
      note += ` ⚠️ باع ${fmtInt(sold)} والمسجّل وارد ${fmtInt(bought)} فقط — راجع المشتريات`;
    }

  } else if (trailingZeros >= Math.max(3, Math.floor(n * 0.3)) && turnPct >= 60) {
    // وقف البيع فترة طويلة وهو مبيعاته عالية → غالبًا نفد من الفرع
    status = "توقف — غالبًا نفد"; color = "#60a5fa"; severity = 1;
    note = `آخر بيعة «${periods[lastIdx]?.label ?? ""}» وبعدها ${fmtInt(trailingZeros)} فترة صفر، `
         + `وباع ${fmtPctInt(turnPct)} من وارده`;

  } else if (trailingZeros >= Math.max(3, Math.floor(n * 0.3))) {
    status = "توقف بيعه"; color = "#fb923c"; severity = 3;
    note = `آخر بيعة «${periods[lastIdx]?.label ?? ""}» وبعدها ${fmtInt(trailingZeros)} فترة صفر، `
         + `وباقي عنده ${fmtInt(left)}`;

  } else if (bought > 0 && turnPct < 15) {
    status = "حركة ضعيفة"; color = "#f59e0b"; severity = 3;
    note = `باع ${fmtPctInt(turnPct)} بس من وارده · باقي ${fmtInt(left)}`;

  } else {
    // قارن النصف الأول بالنصف الثاني — ضعف حقيقي وهو عنده بضاعة
    const half  = Math.floor(n / 2);
    const h1    = qtys.slice(0, half).reduce((s,q)=>s+q, 0);
    const h2    = qtys.slice(half).reduce((s,q)=>s+q, 0);
    const drop  = h1 > 0 ? ((h1 - h2) / h1) * 100 : 0;

    if (drop >= 50 && left > bought * 0.2) {
      status = "ضعف طلبه"; color = "#f87171"; severity = 2;
      note = `نزل ${fmtPctInt(drop)} في النصف الثاني وعنده ${fmtInt(left)} باقية — `
           + `ما نفد، الطلب هو اللي ضعف`;
    } else {
      status = "مستقر"; color = "#10b981"; severity = 1;
      note = `باع ${fmtPctInt(turnPct)} من وارده على ${fmtInt(activeCount)} فترة`;
    }
  }

  return {
    status, note, color, severity,
    bought, sold, left, turnPct,
    firstIdx, lastIdx, outIdx, trailingZeros, activeCount,
    firstLabel: firstIdx >= 0 ? (periods[firstIdx]?.label ?? "") : "",
    lastLabel:  lastIdx  >= 0 ? (periods[lastIdx]?.label  ?? "") : "",
    outLabel:   outIdx   >= 0 ? (periods[outIdx]?.label   ?? "") : "",
    rate, projected, lost,
    soldOut: outIdx >= 0,
    // الطلب الحقيقي ÷ المباع — نضرب فيه التوصية عشان نعوّض النفاد
    demandFactor: sold > 0 ? Math.min(3, Math.max(1, projected / sold)) : 1,
    series: qtys,
  };
}

const fmtInt    = v => Math.round(Number(v)||0).toLocaleString("en-US");
const fmtPctInt = v => Math.round(Number(v)||0) + "%";

/**
 * الراكد: كل المنتجات اللي ما تحركت أو حركتها ضعيفة.
 * يمرّ على كل المنتجات — حتى اللي مبيعاتها صفر (ما تظهر في rankProducts).
 */
export function stagnantProducts(products, periods, settings, weakTurnPct = 15) {
  const out = [];
  (products ?? []).forEach(p => {
    const lc = productLifecycle(p, periods, null);
    if (lc.sold > 0 && lc.turnPct >= weakTurnPct) return;   // متحرك كفاية
    if (lc.bought <= 0 && lc.sold <= 0) return;             // لا وارد ولا مبيع

    const fac = getFactoryCode(p.barcode);
    const buy = buyPriceOf(p);
    out.push({
      barcode: p.barcode,
      name:    p.name ?? "",
      product: p,
      cat:     getCategoryCode(p.barcode),
      catName: getCategoryName(p.barcode, settings),
      fac,
      facName: settings?.factories?.[fac] ?? "",
      cont:    p.container ?? "",
      buyPrice: buy,
      ...lc,
      // الفلوس الواقفة في الرف
      tiedValue: lc.left * buy,
      dead:     lc.sold <= 0,
    });
  });

  // الأسوأ أول: اللي ما تحرك، ثم الأعلى قيمة واقفة
  return out.sort((a,b) =>
    (b.dead - a.dead) || (b.tiedValue - a.tiedValue) || (a.turnPct - b.turnPct));
}

// ─── تحليل الفرع ────────────────────────────────────────────

/**
 * تحليل كامل لفرع واحد: أفضل منتجاته · أفضل فئاته · خطه الزمني
 * ونصيبه من إجمالي الموسم.
 */
export function analyzeBranch(products, periods, settings, branch, grandTotalQty, thresholdPct = 20) {
  const rows = rankProducts(products, periods, settings, branch);
  const tl   = timeline(periods, branch);
  const pd   = peaksAndDips(tl, thresholdPct);
  const cats = rankCategories(rows);

  const qty    = rows.reduce((s,r)=>s+r.qty, 0);
  const rev    = rows.reduce((s,r)=>s+r.rev, 0);
  const profit = rows.reduce((s,r)=>s+r.profit, 0);

  return {
    branch,
    rows, cats, timeline: tl, ...pd,
    qty, rev, profit,
    sharePct: grandTotalQty > 0 ? (qty / grandTotalQty) * 100 : 0,
    topByQty:    sortBy(rows, "qty").slice(0, 20),
    topByProfit: sortBy(rows, "profit").slice(0, 20),
    topCats:     [...cats].sort((a,b)=>b.qty-a.qty),
  };
}

// ─── التوصية: ايش نجيب لكل فرع ─────────────────────────────

const DOZEN = 12;
const upDozen = n => Math.max(DOZEN, Math.ceil(n / DOZEN) * DOZEN);

/**
 * يصنّف المنتج داخل الفرع ويحدد الزيادة.
 * قوي  = مبيعات عالية + دوران عالي → نزيد
 * جيد  = مبيعات معقولة → نكرّر نفس الكمية
 * ضعيف = مبيعات قليلة → نقلل أو نوقف
 */
export function classifyForBranch(row, branchTopQty, opts = {}) {
  const strongTurn = opts.strongTurn ?? 70;   // نسبة دوران تعتبر قوية
  const weakTurn   = opts.weakTurn   ?? 25;
  const topShare   = branchTopQty > 0 ? (row.qty / branchTopQty) * 100 : 0;

  // ما له سجل مشتريات → الدوران ما ينحسب، فنحكم بالمبيعات وحدها
  // (لو حكمنا بالدوران نظلمه ونعتبره ضعيف وهو باع كويس)
  if (num(row.bought) <= 0) {
    if (topShare >= 50) return { tier:"قوي",  grow: opts.growStrong ?? 1.35, color:"#10b981" };
    if (topShare >= 15) return { tier:"جيد",  grow: opts.growGood   ?? 1.0,  color:"#d4a853" };
    return { tier:"ضعيف", grow: opts.growWeak ?? 0.5, color:"#f87171" };
  }

  // بيع كمية كبيرة + صفّى اللي عنده → اشتغل
  if (row.turnPct >= strongTurn && topShare >= 30) {
    return { tier: "قوي", grow: opts.growStrong ?? 1.35, color: "#10b981" };
  }
  // دوران قوي بس كميته صغيرة — غالبًا نقص بضاعة
  if (row.turnPct >= strongTurn) {
    return { tier: "متعطش", grow: opts.growThirsty ?? 1.6, color: "#38bdf8" };
  }
  if (row.turnPct >= weakTurn) {
    return { tier: "جيد", grow: opts.growGood ?? 1.0, color: "#d4a853" };
  }
  return { tier: "ضعيف", grow: opts.growWeak ?? 0.5, color: "#f87171" };
}

/**
 * توصية الفرع: لكل منتج باع فيه، كم نجيب للموسم القادم.
 * الأساس = اللي باعه فعلًا هذا الموسم × معامل حسب قوته.
 */
export function recommendForBranch(branchAnalysis, opts = {}, lifecycles = {}) {
  const minQty = opts.minQty ?? 1;   // تجاهل اللي باع أقل من كذا
  const top    = branchAnalysis.topByQty[0]?.qty ?? 0;

  const recs = branchAnalysis.rows
    .filter(r => r.qty >= minQty)
    .map(r => {
      const lc   = lifecycles[r.barcode] ?? null;
      const base = r.qty;
      let tier, color, grow, why;

      // حالة المنتج تسبق حساب الدوران: الدوران وحده يضلل.
      // منتج نفد دورانه 100% فيطلع "قوي" — صح بس ناقص، الطلب أعلى.
      // ومنتج ضعف طلبه قد يطلع دورانه معقول فيُقرأ "جيد" وهو عنده بضاعة راكدة.
      const st = lc?.status ?? "";

      if (lc?.soldOut && lc.demandFactor > 1.05) {
        tier  = "نفد — الطلب أعلى";
        color = "#38bdf8";
        grow  = lc.demandFactor * (opts.growSoldOut ?? 1.15);
        why   = `خلص في «${lc.outLabel}» · معدله ${Math.round(lc.rate)} للفترة `
              + `· ضاع ~${Math.round(lc.lost)}`;

      } else if (st === "توقف — غالبًا نفد") {
        tier  = "توقف — غالبًا نفد";
        color = "#60a5fa";
        grow  = opts.growStalled ?? 1.3;
        why   = lc.note;

      } else if (st === "ضعف طلبه") {
        // الطلب نزل وعنده بضاعة باقية → نقلل، والباقي يغطي جزء من الموسم الجاي
        tier  = "ضعف طلبه";
        color = "#f87171";
        grow  = opts.growDeclined ?? 0.6;
        why   = lc.note;

      } else if (st === "حركة ضعيفة" || st === "توقف بيعه") {
        tier  = st;
        color = st === "حركة ضعيفة" ? "#f59e0b" : "#fb923c";
        grow  = opts.growWeak ?? 0.5;
        why   = lc.note;

      } else {
        const cls = classifyForBranch(r, top, opts);
        tier = cls.tier; color = cls.color; grow = cls.grow;
        why  = lc?.note ?? "";
      }

      const sug = upDozen(base * grow);
      return {
        ...r,
        tier, color, why,
        grow:     Math.round(grow * 100) / 100,
        suggest:  sug,
        delta:    sug - base,
        soldOut:  !!lc?.soldOut,
        lost:     lc?.lost ?? 0,
        status:   lc?.status ?? "",
      };
    });

  // الحالات اللي نقلل فيها بدل ما نكرر
  const CUT = new Set(["ضعيف", "ضعف طلبه", "حركة ضعيفة", "توقف بيعه"]);

  const sorted = recs.sort((a,b) => b.suggest - a.suggest);
  const bring  = sorted.filter(r => !CUT.has(r.tier));
  const stop   = sorted.filter(r =>  CUT.has(r.tier));
  const urgent = sorted.filter(r => r.soldOut);   // نفدوا — أولوية الطلب

  return {
    branch:       branchAnalysis.branch,
    sharePct:     branchAnalysis.sharePct,
    all:          sorted,
    bring,
    stop,
    urgent,
    totalSuggest: bring.reduce((s,r)=>s+r.suggest, 0),
    totalLastQty: sorted.reduce((s,r)=>s+r.qty, 0),
    totalLost:    sorted.reduce((s,r)=>s+(r.lost||0), 0),
  };
}

// ─── التحليل الكامل ─────────────────────────────────────────

/**
 * نقطة الدخول: يحلل الموسم كامل.
 * periodsRaw = الفترات كما هي من التخزين (نرتبها هنا)
 */
export function seasonAnalysis(products, periodsRaw, settings, opts = {}) {
  const periods = orderPeriods(periodsRaw);

  // المستوى العام
  const thr  = opts.thresholdPct ?? 20;
  const rows = rankProducts(products, periods, settings, null);
  const cats = rankCategories(rows);
  const tl   = timeline(periods, null);
  const pd   = peaksAndDips(tl, thr);

  const grandQty    = rows.reduce((s,r)=>s+r.qty, 0);
  const grandRev    = rows.reduce((s,r)=>s+r.rev, 0);
  const grandProfit = rows.reduce((s,r)=>s+r.profit, 0);

  // الفروع
  const branches  = allBranches(periods);
  const byBranchA = branches
    .map(b => analyzeBranch(products, periods, settings, b, grandQty, thr))
    .filter(b => b.qty > 0)
    .sort((a,b) => b.qty - a.qty);

  // دورة حياة كل منتج (على مستوى الشركة — المشتريات مو موزعة على الفروع)
  const lifecycles = {};
  (products ?? []).forEach(p => { lifecycles[p.barcode] = productLifecycle(p, periods, null); });

  // الراكد وما تحرك — يشمل اللي مبيعاته صفر
  const stagnant = stagnantProducts(products, periods, settings, opts.weakTurnPct ?? 15);

  // المنتجات اللي نفدت قبل نهاية الموسم
  const soldOut = rows
    .map(r => ({ ...r, lc: lifecycles[r.barcode] }))
    .filter(r => r.lc?.soldOut && r.lc.status === "نفد مبكرًا")
    .sort((a,b) => b.lc.lost - a.lc.lost);

  // توقفوا بدون ما يخلص وارِدهم حسب السجل — غالبًا نفدوا من الفرع
  const stalled = rows
    .map(r => ({ ...r, lc: lifecycles[r.barcode] }))
    .filter(r => r.lc?.status === "توقف — غالبًا نفد" || r.lc?.status === "توقف بيعه")
    .sort((a,b) => b.qty - a.qty);

  // ضعف طلبهم فعلًا وهم عندهم بضاعة
  const declined = rows
    .map(r => ({ ...r, lc: lifecycles[r.barcode] }))
    .filter(r => r.lc?.status === "ضعف طلبه")
    .sort((a,b) => b.lc.left - a.lc.left);

  // التوصيات — تستخدم دورة الحياة عشان تعوّض النفاد
  const recs = byBranchA.map(b => recommendForBranch(b, opts, lifecycles));

  return {
    periods,
    periodCount: periods.length,
    firstLabel:  periods[0]?.label ?? "",
    lastLabel:   periods[periods.length-1]?.label ?? "",
    dateParsed:  periods.some(p => p._dateKey !== null),
    thresholdPct: thr,

    // عام
    rows, cats, timeline: tl, ...pd,
    grandQty, grandRev, grandProfit,
    topByQty:    sortBy(rows, "qty"),
    topByProfit: sortBy(rows, "profit"),
    topCats:     [...cats].sort((a,b)=>b.qty-a.qty),
    topCatsProfit: [...cats].sort((a,b)=>b.profit-a.profit),

    // فروع + قرار
    branches: byBranchA,
    recs,

    // حالة المنتجات
    lifecycles,
    soldOut,    // نفد مبكرًا — الطلب أعلى مما بعناه
    // باعوا أكثر من المسجّل وارد — سجل المشتريات ناقص عندهم
    overSold:   rows.filter(r => (lifecycles[r.barcode]?.turnPct ?? 0) > 115),
    stalled,    // وقف بيعه — غالبًا نفد من الفرع
    declined,   // ضعف طلبه وعنده بضاعة
    stagnant,   // راكد وما تحرك

    // المهدور: كم قطعة ضاعت بسبب النفاد
    totalLost:  soldOut.reduce((s,r)=>s+(r.lc?.lost ?? 0), 0),
    // الفلوس الواقفة في الراكد
    tiedValue:  stagnant.reduce((s,r)=>s+(r.tiedValue ?? 0), 0),
    deadCount:  stagnant.filter(r=>r.dead).length,
  };
}
