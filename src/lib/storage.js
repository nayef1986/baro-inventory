// ============================================================
// storage.js — Supabase backend
// ============================================================

const SUPABASE_URL = "https://tvxxprynqeufzlgleurm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2eHhwcnlucWV1ZnpsZ2xldXJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNjk4NTAsImV4cCI6MjA5NDY0NTg1MH0.FfHtUehBX0yjZsuMiE8Z8UP7bE1Ii_RFB5FKT4EJuXk";

const VERSION = "2.0";
const TABLE   = "baro_store";
const MAX_IMAGE_BYTES = 500 * 1024;

const KEYS = {
  META:     "baro_meta_v2",
  PRODUCTS: "baro_products_v2",
  PERIODS:  "baro_periods_v2",
  SETTINGS: "baro_settings_v2",
  IMAGES:   "baro_images_v2",
  COUNTS:   "baro_branch_counts_v2",
  TRANSFERS:"baro_transfers_v2",
};

const MAX_PERIODS = 52; // أقصى عدد فترات محفوظة

// ─── Supabase REST ───────────────────────────────────────────

let lastSbError = null; // آخر سبب فشل حقيقي من الخادم (للتشخيص فقط — ما يغيّر سلوك أي مكان ثاني)

async function sbGet(key) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows?.length) return null;
    return JSON.parse(rows[0].value);
  } catch { return null; }
}

// فحص خفيف جداً: يجيب بس تاريخ آخر تحديث (بايتات قليلة)، بدون تحميل البيانات الكاملة —
// يستخدم قبل أي جلب كامل لبيانات كبيرة (زي الصور)، يوفّر Egress بشكل كبير
async function sbGetUpdatedAt(key) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(key)}&select=updated_at`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0]?.updated_at ?? null;
  } catch { return null; }
}

async function sbSet(key, value) {
  try {
    const body = JSON.stringify({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body,
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 200); } catch {}
      lastSbError = `HTTP ${res.status}${detail ? " — " + detail : ""} (حجم البيانات: ${(body.length/1024).toFixed(0)} كيلوبايت)`;
    } else {
      lastSbError = null;
    }
    return res.ok;
  } catch (e) {
    lastSbError = `خطأ شبكة: ${e?.message || e}`;
    return false;
  }
}
function getLastSbError(){ return lastSbError; }

async function sbDelete(key) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    return res.ok;
  } catch { return false; }
}

// ─── Cache ───────────────────────────────────────────────────

function cacheGet(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function cacheSet(key, value) {
  try {
    const str = JSON.stringify(value);
    // localStorage محدود ~5 ميجا — لو البيانات كبيرة نتخطّاها (نعتمد على Supabase)
    if (str.length > 2_000_000) { try { localStorage.removeItem(key); } catch {} return; }
    localStorage.setItem(key, str);
  } catch {}
}
function cacheClear() {
  try { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); } catch {}
}

// ─── موحّد ───────────────────────────────────────────────────

// ─── كاش الصور في IndexedDB (يقلّل egress — الصور تُحمّل مرة واحدة لكل جهاز) ───
const IDB_NAME = "baro_img_cache", IDB_STORE = "kv";
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(key) {
  try { const db = await idbOpen(); return await new Promise((res)=>{ const t=db.transaction(IDB_STORE,"readonly").objectStore(IDB_STORE).get(key); t.onsuccess=()=>res(t.result??null); t.onerror=()=>res(null); }); }
  catch { return null; }
}
async function idbSet(key, val) {
  try { const db = await idbOpen(); const t=db.transaction(IDB_STORE,"readwrite"); t.objectStore(IDB_STORE).put(val, key); } catch {}
}

async function load(key) {
  // الصور: كاش IndexedDB أولاً (فوري)، ثم فحص خفيف لتاريخ آخر تحديث —
  // ما نجيب البيانات الكاملة إلا لو فعلاً تغيّرت (يوفّر Egress بشكل كبير)
  if (key === KEYS.IMAGES) {
    const cached = await idbGet("images");
    const cachedAt = await idbGet("images_updated_at");
    if (cached) {
      // فحص خفيف بالخلفية (بايتات قليلة)، مو تحميل كامل زي قبل
      sbGetUpdatedAt(key).then(remoteAt => {
        if (remoteAt && remoteAt !== cachedAt) {
          sbGet(key).then(fresh => {
            if (fresh) { idbSet("images", fresh); idbSet("images_updated_at", remoteAt); }
          }).catch(()=>{});
        }
      }).catch(()=>{});
      return cached;
    }
    const remote = await sbGet(key);
    if (remote !== null) {
      idbSet("images", remote);
      sbGetUpdatedAt(key).then(at => { if (at) idbSet("images_updated_at", at); }).catch(()=>{});
      return remote;
    }
    return {};
  }
  const remote = await sbGet(key);
  if (remote !== null) {
    cacheSet(key, remote);
    return remote;
  }
  return cacheGet(key);
}

async function save(key, value) {
  if (key === KEYS.IMAGES) {
    idbSet("images", value); // حدّث كاش الصور
    const ok = await sbSet(key, value);
    if (ok) sbGetUpdatedAt(key).then(at => { if (at) idbSet("images_updated_at", at); }).catch(()=>{});
    return ok;
  }
  cacheSet(key, value);
  return await sbSet(key, value);
}

// ─── تهيئة ───────────────────────────────────────────────────

export async function initStorage() {
  // ننظّف الصور العالقة في الكاش (تملأ المساحة وتفسد البيانات)
  try { localStorage.removeItem(KEYS.IMAGES); } catch {}
  const meta = await load(KEYS.META);
  if (!meta) {
    await save(KEYS.META,     { version: VERSION, created: new Date().toISOString() });
    await save(KEYS.PRODUCTS, []);
    await save(KEYS.PERIODS,  []);
    await save(KEYS.SETTINGS, defaultSettings());
    await save(KEYS.IMAGES,   {});
    return { fresh: true };
  }
  return { fresh: false };
}

// ─── Products ────────────────────────────────────────────────

export async function loadProducts() {
  return (await load(KEYS.PRODUCTS)) ?? [];
}

export async function saveProducts(products) {
  // نجيب آخر نسخة من القاعدة قبل الحفظ وندمج التغييرات عليها،
  // بدل استبدال كل شيء بالنسخة المحفوظة في الذاكرة (تحمي من تعارض تبويبات/أدوات مفتوحة بالتوازي،
  // مثل تغييرات كمية الصندوق في المستودع اللي تنمسح لو صفحة ثانية حفظت نسخة قديمة فوقها)
  let merged = products;
  try {
    const fresh = await loadProducts();
    if (fresh && fresh.length) {
      const freshMap = {};
      fresh.forEach(p => { freshMap[p.barcode] = p; });
      merged = products.map(p => {
        const f = freshMap[p.barcode];
        // نبدأ من أحدث نسخة محفوظة، ونطبّق فوقها تغييرات هذا الحفظ فقط —
        // أي حقل ما نعرفه هنا (مثل unitQty من المستودع) يبقى كما هو من أحدث نسخة
        return f ? { ...f, ...p } : p;
      });
    }
  } catch (e) { /* لو فشل الجلب، نكمل بالنسخة الحالية بدون دمج (سلوك قديم كاحتياط) */ }

  const ok = await save(KEYS.PRODUCTS, merged);
  if (ok) await save(KEYS.META, { version: VERSION, lastSave: new Date().toISOString() });
  return ok;
}

// ─── Periods ─────────────────────────────────────────────────

// ─── الفترات: كل فترة تنحفظ في خانتها الخاصة (مو كلهم مع بعض) ──
// هذا يمنع مشكلة إرسال كل التاريخ من جديد مع كل رفعة (كانت تسبب فشل/بطء
// مع تراكم الشهور، لأن الحفظ كان يعيد إرسال كل الفترات القديمة في كل مرة)
const PERIOD_PREFIX = "baro_period_v1_";

/** يبطّل كاش الفترات العادية بعد حذف أو تعديل */
function bustPeriodsCache() {
  try { idbSet("periods_meta", null); } catch {}
}

// يجيب كل الصفوف اللي مفتاحها يبدأ بالبادئة (كل فترة بصف مستقل)
async function sbGetByPrefix(prefix) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?key=like.${encodeURIComponent(prefix)}*&select=key,value`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) return [];
    const rows = await res.json();
    return rows
      .map(r => { try { return { key: r.key, value: JSON.parse(r.value) }; } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

// فحص خفيف جداً: بس مفاتيح الفترات وتواريخ آخر تحديث لكل وحدة (بدون بيانات المبيعات الثقيلة) —
// يستخدم قبل أي تحميل كامل، يوفّر Egress بشكل كبير للفترات المتراكمة
async function sbGetPeriodsMeta(prefix) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?key=like.${encodeURIComponent(prefix)}*&select=key,updated_at`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) return null;
    return await res.json(); // [{key, updated_at}, ...]
  } catch { return null; }
}
function sameMeta(a, b){
  if (!a || !b || a.length !== b.length) return false;
  const bMap = new Map(b.map(x => [x.key, x.updated_at]));
  return a.every(x => bMap.get(x.key) === x.updated_at);
}

// يحذف كل الصفوف اللي مفتاحها يبدأ بالبادئة (دفعة وحدة، للحذف الكامل)
async function sbDeleteByPrefix(prefix) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?key=like.${encodeURIComponent(prefix)}*`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
  } catch {}
}

// تهجير تلقائي لمرة وحدة: لو التخزين القديم (كل الفترات في خانة وحدة) لسه موجود،
// ننقلها لخانات مستقلة (كل فترة لحالها)، وحدة وحدة — كل نقلة صغيرة فما تفشل بسبب الحجم
async function migrateOldPeriodsBlob() {
  const oldBlob = await sbGet(KEYS.PERIODS);
  if (!Array.isArray(oldBlob) || oldBlob.length === 0) return [];
  const withIds = oldBlob.filter(Boolean).map((p, i) => {
    if (p.id == null || p.id === "") {
      return { ...p, id: `p_${i}_${p.uploadDate ?? ""}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}` };
    }
    return p;
  });
  for (const p of withIds) {
    await sbSet(PERIOD_PREFIX + p.id, p); // حفظ فردي صغير — ما يلمس حد الحجم/الوقت
  }
  // نمسح الخانة القديمة بعد نجاح النقل (يمنع إعادة التهجير، ويوقف مشكلة الحجم نهائياً)
  await sbDelete(KEYS.PERIODS);
  try { localStorage.removeItem(KEYS.PERIODS); } catch {}
  return withIds;
}

// يفكّ ضغط الفترات المضغوطة من نسخة قديمة (توافق للخلف)
function inflatePeriod(per) {
  if (!per || !per.sales || !per._c) return per;
  const sales = {};
  for (const branch in per.sales) {
    sales[branch] = {};
    for (const bc in per.sales[branch]) {
      const v = per.sales[branch][bc];
      if (Array.isArray(v)) sales[branch][bc] = { qty: v[0] || 0, totalPrice: v[1] || 0 };
      else sales[branch][bc] = v;
    }
  }
  const out = { ...per, sales };
  delete out._c;
  return out;
}

export async function loadPeriods() {
  // فحص خفيف أول: بس المفاتيح وتواريخ التحديث — لو ما تغيّر شي، نستخدم الكاش المحلي مباشرة
  const cached = await idbGet("periods_cache");
  const cachedMeta = await idbGet("periods_meta");
  if (cached && cachedMeta) {
    const remoteMeta = await sbGetPeriodsMeta(PERIOD_PREFIX);
    if (remoteMeta && sameMeta(cachedMeta, remoteMeta)) return cached; // ما تغيّر شي — صفر تحميل ثقيل
  }

  let rows = await sbGetByPrefix(PERIOD_PREFIX);
  let periods = rows.map(r => r.value);

  // لو ما فيه شي بالتخزين الجديد، نتحقق من التخزين القديم ونهجّره تلقائياً
  if (periods.length === 0) {
    periods = await migrateOldPeriodsBlob();
  }

  // نضمن id لكل فترة (احتياطي لفترات قديمة بدون id)
  let anyMissing = false;
  const fixed = periods.map((p, i) => {
    if (p && (p.id == null || p.id === "")) {
      anyMissing = true;
      return { ...p, id: `p_${i}_${p.uploadDate ?? ""}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}` };
    }
    return p;
  });
  if (anyMissing) {
    for (const p of fixed) { if (p && p.id) await sbSet(PERIOD_PREFIX + p.id, p); }
  }
  const result = fixed.map(inflatePeriod);

  // نحدّث الكاش المحلي (البيانات + بصمة المفاتيح/التواريخ) لخدمة الفحص الخفيف بالمرة الجاية
  idbSet("periods_cache", result);
  sbGetPeriodsMeta(PERIOD_PREFIX).then(meta => { if (meta) idbSet("periods_meta", meta); }).catch(()=>{});

  return result;
}

// توافق للخلف: لو مكان ما نعرفه يستدعيها بمصفوفة كاملة، نحفظ الفرق فقط
// (يحذف اللي انشال، ويحفظ كل فترة موجودة بخانتها الخاصة — صغير وسريع لكل وحدة)
export async function savePeriods(periods) {
  const desired = Array.isArray(periods) ? periods.filter(Boolean) : [];
  const existingRows = await sbGetByPrefix(PERIOD_PREFIX);
  const desiredIds = new Set(desired.filter(p => p.id).map(p => p.id));
  const toDelete = existingRows.filter(r => {
    const id = r.key.slice(PERIOD_PREFIX.length);
    return !desiredIds.has(id);
  });
  for (const r of toDelete) await sbDelete(r.key);
  let allOk = true;
  for (const p of desired) {
    if (!p || !p.id) continue;
    const ok = await sbSet(PERIOD_PREFIX + p.id, p);
    if (!ok) allOk = false;
  }
  return allOk;
}

export async function addPeriod(period) {
  if (period.id == null || period.id === "") {
    period = { ...period, id: `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}` };
  }
  // نجيب الفترات الموجودة (بس عشان فحص التكرار بالمعرّف/البصمة) — قراءة، مو كتابة، ما تسبب مشكلة الحجم
  const periods = await loadPeriods();

  // نفس المعرّف = استبدال (تحديث الشهر بدل تكراره) — نحفظ هذي الفترة بس
  const sameId = periods.findIndex(p => p.id === period.id);
  if (sameId !== -1) {
    const ok = await sbSet(PERIOD_PREFIX + period.id, period);
    return { ok, reason: ok ? "تم التحديث" : (getLastSbError() || "فشل التحديث") };
  }

  // منع رفع نفس الأرقام بمعرّف مختلف (ملف مكرر فعلاً)
  if (period.fingerprint && periods.find(p => p.fingerprint === period.fingerprint)) {
    return { ok: false, reason: "هذا الملف مرفوع مسبقاً — نفس الأرقام موجودة" };
  }

  // نحفظ الفترة الجديدة بس — خانتها الخاصة، صغيرة وسريعة بغض النظر عن كمية التاريخ المحفوظ
  const ok = await sbSet(PERIOD_PREFIX + period.id, period);
  return { ok, reason: ok ? undefined : (getLastSbError() || "فشل الحفظ لسبب غير معروف") };
}

export async function deleteAllPeriods() {
  await sbDeleteByPrefix(PERIOD_PREFIX);
  // احتياط: نمسح الخانة القديمة كمان لو لسه موجودة (نادر)
  await sbDelete(KEYS.PERIODS);
  try { localStorage.removeItem(KEYS.PERIODS); } catch {}
  return { ok: true };
}

export async function deletePeriod(periodId, periodLabel = null) {
  const periods = await loadPeriods();
  let target = periods.find(p => String(p?.id ?? "") === String(periodId));
  if (!target && periodLabel != null) {
    target = periods.find(p => String(p?.label ?? "") === String(periodLabel));
  }
  if (!target) return { ok: true, notFound: true };
  const ok = await sbDelete(PERIOD_PREFIX + target.id); // حذف خانة وحيدة — صغير وسريع
  if (ok) bustPeriodsCache();
  // نعيد تحميل الصفحة عشان الواجهة تعكس الحذف فوراً (تتجنب مشكلة الحالة القديمة)
  if (ok && typeof window !== "undefined") {
    setTimeout(() => window.location.reload(), 400);
  }
  return { ok };
}

// حذف فترة بالفهرس (احتياطي — لو الـid ناقص)
export async function deletePeriodByIndex(index) {
  const periods = await loadPeriods();
  if (index < 0 || index >= periods.length) return { ok: false };
  const target = periods[index];
  if (!target || !target.id) return { ok: false };
  const ok = await sbDelete(PERIOD_PREFIX + target.id);
  if (ok) bustPeriodsCache();
  return { ok };
}

// ─── Settings ────────────────────────────────────────────────

export async function loadSettings() {
  return (await load(KEYS.SETTINGS)) ?? defaultSettings();
}

export async function saveSettings(settings) {
  return await save(KEYS.SETTINGS, settings);
}

// ─── Images ──────────────────────────────────────────────────

export async function loadImages() {
  return (await load(KEYS.IMAGES)) ?? {};
}

// يحذف الملف الفعلي من Storage لو الرابط من النوع اللي يخزّن بمكان منفصل
// (الصور اللي رُفعت جماعياً من أداة استخراج الصور، مو الصور اليدوية المباشرة)
async function deleteStorageFileIfUrl(value){
  if (typeof value !== "string" || !value.includes("/storage/v1/object/public/")) return;
  try {
    const path = value.split("/storage/v1/object/public/")[1]; // bucket/filename
    if (!path) return;
    await fetch(`${SUPABASE_URL}/storage/v1/object/${path}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
  } catch { /* لو فشل الحذف، نكمل عادي — الرابط بأي حال بينشال من القائمة */ }
}

export async function saveImage(key, base64) {
  const bytes = Math.round((base64.length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) {
    return { ok: false, reason: `الصورة أكبر من 500KB (${Math.round(bytes/1024)}KB)` };
  }
  const images = await loadImages();
  const oldValue = images[key];
  images[key]  = base64;
  const result = { ok: await save(KEYS.IMAGES, images) };
  // لو كانت الصورة القديمة رابط تخزين منفصل، نمسح ملفها الفعلي بعد نجاح الاستبدال (يمنع تراكم ملفات يتيمة)
  if (result.ok && oldValue && oldValue !== base64) deleteStorageFileIfUrl(oldValue);
  return result;
}

export async function deleteImage(key) {
  const images = await loadImages();
  if (!images[key]) return { ok: false };
  const oldValue = images[key];
  delete images[key];
  const result = { ok: await save(KEYS.IMAGES, images) };
  if (result.ok) deleteStorageFileIfUrl(oldValue);
  return result;
}

// ─── Branch Counts (جرد الفروع) ──────────────────────────────

export async function loadBranchCounts() {
  return (await load(KEYS.COUNTS)) ?? {};
}

export async function saveBranchCounts(counts) {
  return await save(KEYS.COUNTS, counts);
}

// ─── Transfers (النقل بين المستودع والفروع) ──────────────────

export async function loadTransfers() {
  return (await load(KEYS.TRANSFERS)) ?? [];
}

export async function saveTransfers(transfers) {
  return await save(KEYS.TRANSFERS, transfers);
}

// ─── فترات الموسم (رمضان وغيره) ──────────────────────────────
// مخزن مستقل تمامًا عن المبيعات العادية: ترفع مبيعات الموسم هنا
// وتحللها لحالها، وتبقى فتراتك اليومية المعتادة كما هي ما تُمس.

const SEASON_PREFIX = "baro_season_v1_";
const SEASON_META   = "baro_season_meta_v1";

/** اسم الموسم الحالي + وصفه (مثلاً "رمضان 1447") */
export async function loadSeasonMeta() {
  const v = await load(SEASON_META);
  return (v && typeof v === "object") ? v : { name: "", note: "" };
}
export async function saveSeasonMeta(meta) {
  return await save(SEASON_META, meta ?? {});
}

/**
 * يضغط الفترة قبل الحفظ: {qty, totalPrice} → [qty, totalPrice]
 * يوفّر ~66% من الحجم. inflatePeriod يفكّها عند القراءة.
 */
function deflatePeriod(per) {
  if (!per?.sales) return per;
  const sales = {};
  for (const b in per.sales) {
    sales[b] = {};
    for (const bc in per.sales[b]) {
      const v = per.sales[b][bc];
      if (Array.isArray(v)) { sales[b][bc] = v; continue; }
      const q = Number(v?.qty) || 0;
      const t = Number(v?.totalPrice) || 0;
      sales[b][bc] = [q, Math.round(t * 100) / 100];
    }
  }
  return { ...per, sales, _c: 1 };
}

export async function loadSeasonPeriods() {
  // فحص خفيف أول: مفاتيح وتواريخ التحديث فقط (بايتات قليلة).
  // لو ما تغيّر شي نستخدم الكاش المحلي — بدون تحميل ميجابايتات كل مرة.
  const cached     = await idbGet("season_cache");
  const cachedMeta = await idbGet("season_meta");
  if (cached && cachedMeta) {
    const remote = await sbGetPeriodsMeta(SEASON_PREFIX);
    if (remote && sameMeta(cachedMeta, remote)) return cached;
  }

  const rows   = await sbGetByPrefix(SEASON_PREFIX);
  const result = rows.map(r => r.value).filter(Boolean).map(inflatePeriod);

  idbSet("season_cache", result);
  sbGetPeriodsMeta(SEASON_PREFIX).then(m => { if (m) idbSet("season_meta", m); }).catch(()=>{});
  return result;
}

/** يبطّل الكاش بعد أي تعديل عشان القراءة الجاية تجيب الجديد */
function bustSeasonCache() {
  idbSet("season_meta", null);
}

/** يضيف فترة موسم — يمنع رفع نفس الملف مرتين بالبصمة */
export async function addSeasonPeriod(period) {
  if (!period) return { ok: false, reason: "فترة فاضية" };
  if (period.id == null || period.id === "") {
    period = { ...period, id: `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}` };
  }
  const existing = await loadSeasonPeriods();

  // نفس التسمية = نفس اليوم مرفوع قبل → نستبدله بدل ما نكرره
  const sameLabel = existing.find(p => p.label && p.label === period.label);
  if (sameLabel) {
    const ok = await sbSet(SEASON_PREFIX + sameLabel.id,
                           deflatePeriod({ ...period, id: sameLabel.id }));
    if (ok) bustSeasonCache();
    return { ok, ok2: "replaced",
             reason: ok ? `حُدّثت «${period.label}»` : (getLastSbError() || "فشل التحديث") };
  }

  if (period.fingerprint && existing.find(p => p.fingerprint === period.fingerprint)) {
    return { ok: false, reason: `«${period.label}» مرفوعة مسبقًا — نفس الأرقام` };
  }

  const ok = await sbSet(SEASON_PREFIX + period.id, deflatePeriod(period));
  if (ok) bustSeasonCache();
  return { ok, reason: ok ? undefined : (getLastSbError() || "فشل الحفظ") };
}

export async function deleteSeasonPeriod(periodId) {
  if (!periodId) return { ok: false };
  const ok = await sbDelete(SEASON_PREFIX + periodId);
  if (ok) bustSeasonCache();
  return { ok };
}

export async function deleteAllSeasonPeriods() {
  await sbDeleteByPrefix(SEASON_PREFIX);
  bustSeasonCache();
  idbSet("season_cache", []);
  return { ok: true };
}

// ─── منتجات التكرار (مشتركة بين كل الأجهزة) ──────────────────
const REPEAT_BASKET_KEY = "baro_repeat_basket_v1";

export async function loadRepeatBasket() {
  const v = await load(REPEAT_BASKET_KEY);
  return Array.isArray(v) ? v : [];
}

/**
 * يعدّل سلة التكرار بمنطق دمج: يقرأ المحفوظ في السحابة أول،
 * ثم يضيف/يحذف عليه — فجوال ما يمسح اللي أضافه جوال ثاني.
 * يرجّع القائمة النهائية الموحّدة.
 */
export async function syncRepeatBasket({ add = [], remove = [], clear = false } = {}) {
  let cloud = [];
  try {
    const v = await sbGet(REPEAT_BASKET_KEY);
    if (Array.isArray(v)) cloud = v;
  } catch {}

  const next = clear
    ? []
    : [...new Set([...cloud, ...add])].filter(x => !remove.includes(x));

  await save(REPEAT_BASKET_KEY, next);
  return next;
}

// ─── جرد المستودع ────────────────────────────────────────────
export async function loadWhCounts() {
  return (await load("baro_wh_counts_v2")) ?? {};
}
export async function saveWhCounts(counts) {
  return await save("baro_wh_counts_v2", counts);
}

// ─── تحميل الكل ──────────────────────────────────────────────

export async function loadAll() {
  const [products, periods, settings, images] = await Promise.all([
    loadProducts(), loadPeriods(), loadSettings(), loadImages(),
  ]);
  return { products, periods, settings, images };
}

export async function clearAll() {
  cacheClear();
  await Promise.all(Object.values(KEYS).map(k => sbDelete(k)));
  await sbDeleteByPrefix(PERIOD_PREFIX); // الفترات المخزّنة كل وحدة بخانتها الخاصة
}

function defaultSettings() {
  return {
    brandName: "البارو",
    minStock:  12,
    factories: {},
  };
}
