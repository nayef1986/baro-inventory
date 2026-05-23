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

async function load(key) {
  const remote = await sbGet(key);
  if (remote !== null) { cacheSet(key, remote); return remote; }
  return cacheGet(key);
}

async function save(key, value) {
  cacheSet(key, value);
  return await sbSet(key, value);
}

// ─── تهيئة ───────────────────────────────────────────────────

export async function initStorage() {
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
  return (await load(KEYS.PERIODS)) ?? [];
}

export async function savePeriods(periods) {
  const trimmed = periods.slice(-52);
  return await save(KEYS.PERIODS, trimmed);
}

export async function addPeriod(period) {
  const periods = await loadPeriods();

  // منع التكرار بالـ ID
  if (periods.find(p => p.id === period.id)) {
    return { ok: false, reason: "مكرر" };
  }

  // منع التكرار بالبصمة
  if (period.fingerprint && periods.find(p => p.fingerprint === period.fingerprint)) {
    return { ok: false, reason: "هذا الملف مرفوع مسبقاً — نفس الأرقام موجودة" };
  }

  periods.push(period);
  const ok = await savePeriods(periods);
  return { ok };
}

export async function deletePeriod(periodId) {
  const periods  = await loadPeriods();
  const filtered = periods.filter(p => p.id !== periodId);
  if (filtered.length === periods.length) return { ok: false };
  return { ok: await savePeriods(filtered) };
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
