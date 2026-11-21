// ============================================================
// hijri.js — ربط التقويمين وقياس قوة الأيام والشهور
//
// مواسم السعودية نصفها هجري (رمضان · الأعياد) يتقدّم ١١ يومًا كل سنة،
// ونصفها ميلادي ثابت (التأسيس · الوطني · المدارس · الجمعة البيضاء).
// فالمقارنة بالتاريخ الميلادي وحده تُضلّل، ولا بد من التقويمين معًا.
//
// تقويم أم القرى مدعوم في المتصفح عبر Intl — بلا مكتبات خارجية.
// ============================================================

export const HIJRI_MONTHS = [
  "محرّم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة",
  "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
];

let _fmt = null;
function fmt() {
  if (_fmt) return _fmt;
  try {
    _fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn",
      { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" });
  } catch { _fmt = null; }
  return _fmt;
}

/** تحويل تاريخ ميلادي إلى هجري (أم القرى). يرجع null لو المتصفح لا يدعمه. */
export function toHijri(date) {
  const f = fmt();
  if (!f) return null;
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d)) return null;
    const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const p = {};
    for (const x of f.formatToParts(utc)) if (x.type !== "literal") p[x.type] = x.value;
    const y = parseInt(String(p.year).replace(/\D/g, ""), 10);
    const m = parseInt(p.month, 10);
    const dd = parseInt(p.day, 10);
    if (!y || !m || !dd) return null;
    return { y, m, d: dd, name: HIJRI_MONTHS[m - 1] };
  } catch { return null; }
}

export const hijriLabel = date => {
  const h = toHijri(date);
  return h ? `${h.d} ${h.name} ${h.y}` : "";
};

/**
 * أول يوم ميلادي لشهر هجري.
 * تقدير أولي ثم زحف، ثم مسح يومي دقيق — لأن التقريب يخطئ يومًا أو يومين
 * وفرق يوم واحد في بداية رمضان يزيح خطة الموسم كلها.
 */
export function hijriMonthStart(hy, hm) {
  const DAY = 86400000;
  // متوسط السنة الهجرية ٣٥٤.٣٦٧ يوم · ١ محرّم ١ هـ ≈ 622-07-19
  const approx = new Date(Date.UTC(622, 6, 19) + ((hy - 1) * 354.367 + (hm - 1) * 29.531) * DAY);
  // كل العمل على تواريخ منتصف الليل المحلي — toHijri يقرأ اليوم المحلي،
  // وأي بقية وقت تجعل التاريخ المحلي يسبق أو يتأخر يومًا عن UTC.
  let d = midnight(approx.getUTCFullYear(), approx.getUTCMonth(), approx.getUTCDate());

  for (let i = 0; i < 60; i++) {                 // اقترب بالقفز
    const h = toHijri(d);
    if (!h) return null;
    const off = (h.y - hy) * 354 + (h.m - hm) * 29.5 + (h.d - 1);
    if (Math.abs(off) < 1) break;
    d = addDays(d, -Math.round(off));
  }
  for (let k = -20; k <= 20; k++) {              // ثم امسح يومًا بيوم
    const c = addDays(d, k);
    const h = toHijri(c);
    if (h && h.y === hy && h.m === hm && h.d === 1) return c;
  }
  return null;
}

/** منتصف الليل المحلي — لتفادي اختلاف اليوم بين المحلي وUTC. */
export const midnight = (y, m, d) => new Date(y, m, d, 0, 0, 0, 0);
export const addDays  = (date, n) =>
  midnight(date.getFullYear(), date.getMonth(), date.getDate() + n);

/** مواعيد موسم سنة هجرية معيّنة بالميلادي. */
export function seasonDates(hy) {
  const ram  = hijriMonthStart(hy, 9);
  const eid  = hijriMonthStart(hy, 10);
  const dhul = hijriMonthStart(hy, 12);
  const adha = dhul ? addDays(dhul, 9) : null;
  return { ramadanStart: ram, eidFitr: eid, eidAdha: adha };
}

// ─── نوافذ المواسم ───────────────────────────────────────────
// الميلادية ثابتة، والهجرية تُحسب من تقويم أم القرى.

export const FIXED_EVENTS = [
  { key: "founding", label: "يوم التأسيس",     month: 2,  day: 22, span: 2 },
  { key: "national", label: "اليوم الوطني",     month: 9,  day: 23, span: 3 },
  { key: "school",   label: "العودة للمدارس",   month: 8,  day: 10, span: 18 },
  { key: "whitefri", label: "الجمعة البيضاء",   month: 11, day: 24, span: 7 },
  { key: "newyear",  label: "رأس السنة",        month: 12, day: 28, span: 7 },
];

const iso = d => d.toISOString().slice(0, 10);

/** يبني نوافذ المواسم التي تغطي مدى التواريخ المعطى. */
export function seasonWindows(dates) {
  if (!dates?.length) return [];
  const ds = [...dates].map(d => (d instanceof Date ? d : new Date(d))).sort((a, b) => a - b);
  const first = ds[0], lastD = ds[ds.length - 1];
  const out = [];

  const hs = toHijri(first), he = toHijri(lastD);
  if (hs && he) {
    for (let hy = hs.y; hy <= he.y; hy++) {
      const s = seasonDates(hy);
      if (s.ramadanStart && s.eidFitr) {
        out.push({ key: `ram${hy}`, label: `رمضان ${hy}`, kind: "hijri",
                   from: s.ramadanStart, to: addDays(s.eidFitr, -1) });
        out.push({ key: `fitr${hy}`, label: `عيد الفطر ${hy}`, kind: "hijri",
                   from: s.eidFitr, to: addDays(s.eidFitr, 4) });
      }
      if (s.eidAdha) {
        out.push({ key: `adha${hy}`, label: `عيد الأضحى ${hy}`, kind: "hijri",
                   from: addDays(s.eidAdha, -12), to: addDays(s.eidAdha, 3) });
      }
    }
  }
  for (let y = first.getFullYear(); y <= lastD.getFullYear(); y++) {
    for (const e of FIXED_EVENTS) {
      const from = midnight(y, e.month - 1, e.day);
      out.push({ key: `${e.key}${y}`, label: `${e.label} ${y}`, kind: "greg",
                 from, to: addDays(from, e.span) });
    }
  }
  return out.filter(w => w.to >= first && w.from <= lastD)
            .sort((a, b) => a.from - b.from);
}

export function windowOf(date, windows) {
  const d = date instanceof Date ? date : new Date(date);
  for (const w of windows) if (d >= w.from && d <= w.to) return w;
  return null;
}

// ─── قوة الأيام والشهور ──────────────────────────────────────

export const WEEKDAYS = ["الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت","الأحد"];

/**
 * يقيس قوة الوقت من سلسلة يومية.
 * @param {Array<{date: Date|string, value: number}>} series
 * @returns {{hijriMonths, weekdays, monthDays, windows, avgDay, days}}
 */
export function timeStrength(series) {
  const pts = (series || [])
    .map(p => ({ d: p.date instanceof Date ? p.date : new Date(p.date), v: Number(p.value) || 0 }))
    .filter(p => !isNaN(p.d))
    .sort((a, b) => a.d - b.d);
  if (!pts.length) return null;

  const windows = seasonWindows(pts.map(p => p.d));
  const inSeason = d => {
    const w = windowOf(d, windows);
    return w && w.kind === "hijri";
  };

  // الشهر الهجري
  const hm = new Map();
  for (const p of pts) {
    const h = toHijri(p.d);
    if (!h) continue;
    const k = `${h.y}-${String(h.m).padStart(2, "0")}`;
    const g = hm.get(k) || { key: k, y: h.y, m: h.m, name: HIJRI_MONTHS[h.m - 1], sum: 0, days: 0 };
    g.sum += p.v; g.days++; hm.set(k, g);
  }
  const hijriMonths = [...hm.values()].map(g => ({ ...g, perDay: g.sum / g.days }));

  // أساس المقارنة = الأيام خارج المواسم الهجرية
  const base = pts.filter(p => !inSeason(p.d));
  const avgDay = base.length ? base.reduce((s, p) => s + p.v, 0) / base.length
                             : pts.reduce((s, p) => s + p.v, 0) / pts.length;
  for (const g of hijriMonths) g.index = avgDay ? g.perDay / avgDay : 0;
  hijriMonths.sort((a, b) => (a.y - b.y) || (a.m - b.m));

  // يوم الأسبوع — خارج المواسم حتى لا يشوّهه رمضان
  const wd = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));
  for (const p of base) { const i = (p.d.getDay() + 6) % 7; wd[i].sum += p.v; wd[i].n++; }
  const wdAvg = wd.filter(x => x.n).reduce((s, x) => s + x.sum / x.n, 0) /
                Math.max(1, wd.filter(x => x.n).length);
  const weekdays = wd.map((x, i) => ({
    name: WEEKDAYS[i], perDay: x.n ? x.sum / x.n : 0,
    index: x.n && wdAvg ? (x.sum / x.n) / wdAvg : 0, n: x.n,
  }));

  // يوم الشهر الميلادي — دورة الراتب، معدَّلة على يوم الأسبوع
  const md = new Map();
  for (const p of base) {
    const w = weekdays[(p.d.getDay() + 6) % 7];
    const norm = w.perDay > 0 ? p.v / w.perDay : 0;
    const k = p.d.getDate();
    const g = md.get(k) || { day: k, sum: 0, n: 0 };
    g.sum += norm; g.n++; md.set(k, g);
  }
  const mdAvg = [...md.values()].reduce((s, g) => s + g.sum / g.n, 0) / Math.max(1, md.size);
  const monthDays = [...md.values()]
    .map(g => ({ day: g.day, index: mdAvg ? (g.sum / g.n) / mdAvg : 0, n: g.n }))
    .sort((a, b) => a.day - b.day);

  // قوة كل نافذة موسم
  const wins = windows.map(w => {
    const inside = pts.filter(p => p.d >= w.from && p.d <= w.to);
    if (!inside.length) return null;
    const perDay = inside.reduce((s, p) => s + p.v, 0) / inside.length;
    return { ...w, days: inside.length, sum: inside.reduce((s, p) => s + p.v, 0),
             perDay, index: avgDay ? perDay / avgDay : 0 };
  }).filter(Boolean).sort((a, b) => b.index - a.index);

  return { hijriMonths, weekdays, monthDays, windows: wins, avgDay,
           days: pts.length, from: pts[0].d, to: pts[pts.length - 1].d };
}

/**
 * منحنى الموسم بمقياس «الأيام قبل العيد» — قابل للإسقاط على أي سنة.
 */
export function seasonCurve(series, eidDate) {
  const eid = eidDate instanceof Date ? eidDate : new Date(eidDate);
  const pts = (series || [])
    .map(p => ({ d: p.date instanceof Date ? p.date : new Date(p.date), v: Number(p.value) || 0 }))
    .filter(p => !isNaN(p.d) && p.d < eid)
    .sort((a, b) => a.d - b.d);
  const total = pts.reduce((s, p) => s + p.v, 0);
  if (!total) return [];
  let cum = 0;
  return pts.map(p => {
    cum += p.v;
    const h = toHijri(p.d);
    return { date: iso(p.d), hijriDay: h?.d ?? null, hijriName: h?.name ?? "",
             before: Math.round((eid - p.d) / 86400000),
             value: p.v, share: p.v / total, cum: cum / total };
  });
}

/** المواعيد الحاكمة لموسم قادم — يُبنى من التقويم لا من أرقام مكتوبة يدويًا. */
export function nextSeasonPlan(hy, opts = {}) {
  const shelfLead = opts.shelfLeadDays ?? 10;   // البضاعة على الرف قبل الذروة بكم يوم
  const s = seasonDates(hy);
  if (!s.ramadanStart || !s.eidFitr) return null;
  const peakFrom = opts.peakStart instanceof Date
    ? opts.peakStart
    : addDays(s.ramadanStart, 18);                 // ١٩ رمضان افتراضًا
  return {
    hijriYear: hy,
    ramadanStart: s.ramadanStart,
    eidFitr: s.eidFitr,
    eidAdha: s.eidAdha,
    shelfDeadline: addDays(peakFrom, -shelfLead),
    warehouseBy:   addDays(peakFrom, -(shelfLead + 6)),
    peakFrom,
    peakTo: addDays(s.eidFitr, -1),
    peakDays: Math.round((s.eidFitr - peakFrom) / 86400000),
    stopBuying: addDays(s.eidFitr, -8),
    clearFrom:  addDays(s.eidFitr, 1),
  };
}

/** تاريخ ميلادي بصيغة YYYY-MM-DD بالتوقيت المحلي.
 *  لا تستخدم toISOString مع تواريخ منتصف الليل المحلي — تُرجع اليوم السابق. */
export const ymd = d => {
  const x = d instanceof Date ? d : new Date(d);
  return isNaN(x) ? "" :
    `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
};
