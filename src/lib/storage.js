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

// ─── Supabase REST ───────────────────────────────────────────

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

async function sbSet(key, value) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch { return false; }
}

async function sbDelete(key) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
  } catch {}
}

// ─── Cache ───────────────────────────────────────────────────

function cacheGet(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function cacheSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
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
  // الصور: كاش IndexedDB أولاً (فوري + بدون egress)، ثم تحديث بالخلفية
  if (key === KEYS.IMAGES) {
    const cached = await idbGet("images");
    if (cached) {
      // حدّث بالخلفية بدون انتظار (عشان أي صورة جديدة توصل لاحقاً)
      sbGet(key).then(fresh => { if (fresh) idbSet("images", fresh); }).catch(()=>{});
      return cached;
    }
    const remote = await sbGet(key);
    if (remote !== null) { idbSet("images", remote); return remote; }
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
    return await sbSet(key, value);
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
  const ok = await save(KEYS.PRODUCTS, products);
  if (ok) await save(KEYS.META, { version: VERSION, lastSave: new Date().toISOString() });
  return ok;
}

// ─── Periods ─────────────────────────────────────────────────

export async function loadPeriods() {
  const periods = (await load(KEYS.PERIODS)) ?? [];
  // نضمن id لكل فترة (الفترات القديمة قد تكون بدون id → الحذف الفردي يفشل)
  let changed = false;
  const fixed = periods.map((p, i) => {
    if (p && (p.id == null || p.id === "")) {
      changed = true;
      return { ...p, id: `p_${i}_${p.uploadDate ?? ""}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}` };
    }
    return p;
  });
  // لو أصلحنا id ناقص، نحفظ النسخة المصلّحة (مرة وحدة)
  if (changed) { sbSet(KEYS.PERIODS, fixed).catch(()=>{}); cacheSet(KEYS.PERIODS, fixed); }
  return fixed;
}

export async function savePeriods(periods) {
  return await save(KEYS.PERIODS, periods);
}

export async function addPeriod(period) {
  const periods = await loadPeriods();

  // نفس المعرّف = استبدال (تحديث الشهر بدل تكراره)
  const sameId = periods.findIndex(p => p.id === period.id);
  if (sameId !== -1) {
    periods[sameId] = period;
    const ok = await savePeriods(periods);
    return { ok, reason: "تم التحديث" };
  }

  // منع رفع نفس الأرقام بمعرّف مختلف (ملف مكرر فعلاً)
  if (period.fingerprint && periods.find(p => p.fingerprint === period.fingerprint)) {
    return { ok: false, reason: "هذا الملف مرفوع مسبقاً — نفس الأرقام موجودة" };
  }

  periods.push(period);
  const ok = await savePeriods(periods);
  return { ok };
}

export async function deleteAllPeriods() {
  // حذف سريع مباشر من Supabase + مسح الكاش (نفس طريقة الزر السريع)
  try { localStorage.removeItem(KEYS.PERIODS); } catch {}
  await sbDelete(KEYS.PERIODS);
  return { ok: true };
}

export async function deletePeriod(periodId, periodLabel = null) {
  // نجيب أحدث نسخة (نتجاوز الكاش) عشان الحذف يشتغل بدقة
  let periods = await sbGet(KEYS.PERIODS);
  if (!Array.isArray(periods)) periods = await loadPeriods();
  periods = Array.isArray(periods) ? periods : [];
  // نطابق بالـid أولاً
  let filtered = periods.filter(p => String(p?.id ?? "") !== String(periodId));
  // لو ما انحذف شي والـid فاضي/قديم → نجرّب بالتسمية (احتياطي)
  if (filtered.length === periods.length && periodLabel != null) {
    let removedOne = false;
    filtered = periods.filter(p => {
      if (!removedOne && String(p?.label ?? "") === String(periodLabel)) { removedOne = true; return false; }
      return true;
    });
  }
  if (filtered.length === periods.length) {
    cacheSet(KEYS.PERIODS, filtered);
    return { ok: true, notFound: true };
  }
  const trimmed = filtered.slice(-MAX_PERIODS);
  const ok = await sbSet(KEYS.PERIODS, trimmed);
  cacheSet(KEYS.PERIODS, trimmed);
  try { await updateMeta(); } catch {}
  return { ok };
}

// حذف فترة بالفهرس (احتياطي — لو الـid ناقص)
export async function deletePeriodByIndex(index) {
  let periods = await sbGet(KEYS.PERIODS);
  if (!Array.isArray(periods)) periods = await loadPeriods();
  periods = Array.isArray(periods) ? periods : [];
  if (index < 0 || index >= periods.length) return { ok: false };
  const filtered = periods.filter((_, i) => i !== index);
  const ok = await sbSet(KEYS.PERIODS, filtered.slice(-MAX_PERIODS));
  cacheSet(KEYS.PERIODS, filtered.slice(-MAX_PERIODS));
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
}

function defaultSettings() {
  return {
    brandName: "البارو",
    minStock:  12,
    factories: {},
  };
}
