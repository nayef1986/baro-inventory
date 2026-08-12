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
  return fixed.map(inflatePeriod);
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
  try { await updateMeta(); } catch {}
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
  try { await updateMeta(); } catch {}
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

export async function saveImage(key, base64) {
  const bytes = Math.round((base64.length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) {
    return { ok: false, reason: `الصورة أكبر من 500KB (${Math.round(bytes/1024)}KB)` };
  }
  const images = await loadImages();
  images[key]  = base64;
  return { ok: await save(KEYS.IMAGES, images) };
}

export async function deleteImage(key) {
  const images = await loadImages();
  if (!images[key]) return { ok: false };
  delete images[key];
  return { ok: await save(KEYS.IMAGES, images) };
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
