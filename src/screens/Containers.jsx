// ============================================================
// Containers.jsx — شاشة الكونتينرات مع تبويبات
// ============================================================

import { useState, useMemo, memo, useCallback } from "react";
import {
  Card, Btn, Badge, StatPill, EmptyState, ExportBar,
  FilterChips, SearchBar, SectionHeader, BackBtn,
  ProgressBar, useToast, fmtN, fmtM, fmtPct,
} from "../components/UI.jsx";
import { ProductImage } from "../components/ProductImage.jsx";
import { parsePurchaseFile, applyPurchases, reversePurchases } from "../lib/parsers.js";
import {
  containerSummary, allContainers, allFactoryCodes,
  getFactoryCode, arabicIncludes, calcProduct,
  branchNeed, allBranches, num, findOrphanBarcodes,
} from "../lib/calc.js";
import { exportContainerReport, printContainerReport } from "../lib/exporters.js";

// ─── نافذة تعديل منتج ────────────────────────────────────────

const ProductEditModal = memo(({ product, products, container, onSave, onClose }) => {
  const [barcode,   setBarcode]   = useState(product.barcode);
  const [name,      setName]      = useState(product.name);
  const [sellPrice, setSellPrice] = useState(product.sellPrice ?? 0);
  const [disabled,  setDisabled]  = useState(!!product.disabled);
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState("");

  const handleSave = async () => {
    const newBc = String(barcode).trim();
    if (!newBc) { setErr("الباركود مطلوب"); return; }
    if (!name.trim()) { setErr("الاسم مطلوب"); return; }
    // لو الباركود تغيّر، نتأكد ما يتعارض مع منتج آخر
    if (newBc !== product.barcode && products.some(p => p.barcode === newBc)) {
      setErr("الباركود موجود مسبقاً لمنتج آخر");
      return;
    }
    setSaving(true);
    const updated = products.map(p => {
      if (p.barcode !== product.barcode) return p;
      return { ...p, barcode: newBc, name: name.trim(), sellPrice: num(sellPrice), disabled };
    });
    await onSave(updated);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="font-black text-slate-100 text-lg mb-4">✏️ تعديل المنتج</div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 font-bold block mb-1">الباركود</label>
            <input value={barcode} onChange={e => setBarcode(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-xs text-slate-400 font-bold block mb-1">الاسm</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-xs text-slate-400 font-bold block mb-1">سعر البيع</label>
            <input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
          </div>

          {/* إطفاء/تشغيل */}
          <button onClick={() => setDisabled(d => !d)}
            className={`w-full py-3 rounded-xl text-sm font-bold border transition-colors flex items-center justify-center gap-2
              ${disabled
                ? "bg-amber-900/30 border-amber-700/50 text-amber-300"
                : "bg-emerald-900/30 border-emerald-700/50 text-emerald-300"}`}>
            {disabled ? "⏸️ المنتج مطفي (اضغط للتشغيل)" : "✅ المنتج شغّال (اضغط للإطفاء)"}
          </button>
          <div className="text-xs text-slate-500 text-center -mt-1">
            المطفي يبقى محفوظاً لكن يُستبعد من الحسابات والعرض
          </div>
        </div>

        {err && <div className="text-red-400 text-xs mt-3 text-center">{err}</div>}

        <div className="grid grid-cols-2 gap-2 mt-5">
          <button onClick={onClose}
            className="py-3 rounded-xl border border-slate-600 bg-slate-700 text-slate-200 font-bold text-sm">إلغاء</button>
          <button onClick={handleSave} disabled={saving}
            className="py-3 rounded-xl bg-blue-600 text-white font-black text-sm disabled:opacity-50">
            {saving ? "⏳ حفظ…" : "💾 حفظ"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ─── نافذة إضافة منتج جديد ───────────────────────────────────

const AddProductModal = memo(({ products, container, onSave, onClose }) => {
  const [barcode,   setBarcode]   = useState("");
  const [name,      setName]      = useState("");
  const [qty,       setQty]       = useState("");
  const [buyPrice,  setBuyPrice]  = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState("");

  const handleSave = async () => {
    const bc = String(barcode).trim();
    if (!bc) { setErr("الباركود مطلوب"); return; }
    if (!name.trim()) { setErr("الاسم مطلوب"); return; }
    if (products.some(p => p.barcode === bc)) {
      setErr("الباركود موجود مسبقاً");
      return;
    }
    setSaving(true);
    const date = new Date().toISOString().slice(0, 10);
    const newProduct = {
      barcode: bc,
      name: name.trim(),
      sellPrice: num(sellPrice),
      container,
      purchases: [{ container, qty: num(qty), buyPrice: num(buyPrice), date }],
    };
    await onSave([...products, newProduct]);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="font-black text-slate-100 text-lg mb-1">➕ إضافة منتج جديد</div>
        <div className="text-xs text-slate-400 mb-4">للكونتينر: {container}</div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 font-bold block mb-1">الباركود *</label>
            <input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="مثال: 26068616B005"
              className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-xs text-slate-400 font-bold block mb-1">الاسم *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="اسم المنتج"
              className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-slate-400 font-bold block mb-1">الكمية</label>
              <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="0"
                className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-2 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-bold block mb-1">شراء</label>
              <input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder="0"
                className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-2 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-bold block mb-1">بيع</label>
              <input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="0"
                className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-2 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>
        </div>

        {err && <div className="text-red-400 text-xs mt-3 text-center">{err}</div>}

        <div className="grid grid-cols-2 gap-2 mt-5">
          <button onClick={onClose}
            className="py-3 rounded-xl border border-slate-600 bg-slate-700 text-slate-200 font-bold text-sm">إلغاء</button>
          <button onClick={handleSave} disabled={saving}
            className="py-3 rounded-xl bg-emerald-600 text-white font-black text-sm disabled:opacity-50">
            {saving ? "⏳ حفظ…" : "➕ إضافة"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ─── معاينة فاتورة الشراء ────────────────────────────────────

const PurchasePreview = memo(({ items, container, products, onConfirm, onCancel }) => {
  const [search, setSearch] = useState("");

  const filtered = items.filter(p =>
    !search || p.barcode.includes(search) || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalQty  = items.reduce((s, p) => s + p.qty, 0);
  const totalCost = items.reduce((s, p) => s + p.qty * p.buyPrice, 0);

  // تنبيهات
  const warnings = [];
  const existing = items.filter(p => products.some(ep => ep.barcode === p.barcode));
  const newProds  = items.filter(p => !products.some(ep => ep.barcode === p.barcode));
  if (newProds.length > 0) warnings.push(`✨ ${newProds.length} منتج جديد سيُضاف`);
  if (existing.length > 0) warnings.push(`🔄 ${existing.length} منتج موجود سيُجمع`);
  if (items.some(p => p.buyPrice === 0)) warnings.push("⚠️ يوجد منتجات بسعر شراء صفر");

  return (
    <div className="space-y-4">
      <SectionHeader icon="🔍" title="مراجعة فاتورة الشراء" subtitle="تأكد من البيانات قبل الاعتماد" />

      <Card>
        <div className="font-black text-slate-100 text-base mb-3">📦 {container}</div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <StatPill label="المنتجات"  value={fmtN(items.length)} color="text-blue-400" />
          <StatPill label="إجمالي الكميات" value={fmtN(totalQty)} color="text-amber-400" />
          <StatPill label="التكلفة الكلية" value={fmtM(totalCost)} color="text-red-400" />
        </div>
        {warnings.map((w, i) => (
          <div key={i} className="text-xs text-amber-300 bg-amber-900/20 rounded-lg px-3 py-1.5 mb-1">{w}</div>
        ))}
      </Card>

      <SearchBar value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 بحث بالباركود أو الاسم…" />

      <div className="space-y-2">
        {filtered.slice(0, 100).map((p, i) => (
          <Card key={i} className="!p-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-100 text-sm truncate">{p.name}</div>
                <div className="font-mono text-blue-400 text-xs mt-0.5">{p.barcode}</div>
                <div className="text-xs text-slate-400 mt-0.5">📦 {p.container}</div>
              </div>
              <div className="text-right shrink-0 mr-3">
                <div className="font-black text-emerald-400 tabular-nums">{fmtN(p.qty)} قطعة</div>
                <div className="text-xs text-red-300">شراء: {fmtM(p.buyPrice)}</div>
                <div className="text-xs text-blue-300">بيع: {fmtM(p.sellPrice)}</div>
              </div>
            </div>
          </Card>
        ))}
        {filtered.length > 100 && (
          <div className="text-center text-slate-500 text-sm py-2">عرض أول 100 من {filtered.length}</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sticky bottom-20 bg-slate-900 pb-2 pt-2">
        <button onClick={onCancel}
          className="py-3 rounded-2xl border border-slate-600 bg-slate-700 text-slate-200 font-bold text-sm">
          ← تراجع
        </button>
        <button onClick={onConfirm}
          className="py-3 rounded-2xl bg-emerald-600 text-white font-black text-sm">
          ✅ اعتماد الفاتورة
        </button>
      </div>
    </div>
  );
});

const UploadSection = memo(({ products, onUpdate }) => {
  const [loading,  setLoading]  = useState(false);
  const [log,      setLog]      = useState([]);
  const [preview,  setPreview]  = useState(null);
  const { show, ToastContainer } = useToast();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setLog([]);
    try {
      const buffer = await file.arrayBuffer();
      const { items, container, errors, warnings } = parsePurchaseFile(buffer);
      if (errors.length > 0) {
        errors.forEach(err => setLog(p => [...p, { type: "error", text: err }]));
        setLoading(false);
        e.target.value = "";
        return;
      }
      warnings.forEach(w => setLog(p => [...p, { type: "warning", text: w }]));
      // تحقق من تكرار الكونتينر
      const existingContainers = products.map(p => p.container).filter(Boolean);
      const containerExists = products.some(p =>
        p.container === container &&
        p.purchases?.some(pur => pur.container === container)
      );
      if (containerExists) {
        setLog(p => [...p, {
          type: "warning",
          text: `⚠️ الكونتينر ${container} مرفوع مسبقاً — ستُضاف الكميات للموجود`
        }]);
      }

      // نعرض المراجعة بدل الحفظ المباشر
      setPreview({ items, container, isDuplicate: containerExists });
    } catch (err) {
      setLog(p => [...p, { type: "error", text: `خطأ: ${err.message}` }]);
    }
    setLoading(false);
    e.target.value = "";
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const updated  = applyPurchases(products, preview.items, preview.container);
      const newCount = updated.filter(p => !products.some(ep => ep.barcode === p.barcode)).length;
      await onUpdate(updated);
      setLog(p => [...p,
        { type: "success", text: `✅ ${preview.container} — ${preview.items.length} منتج` },
        { type: "info",    text: `${newCount} جديد · ${preview.items.length - newCount} تم الجمع` },
      ]);
      show(`✅ ${preview.container} — ${preview.items.length} منتج`);
    } catch (err) {
      setLog(p => [...p, { type: "error", text: `خطأ: ${err.message}` }]);
    }
    setPreview(null);
    setLoading(false);
  };

  const LOG_COLORS = { success: "text-emerald-400", error: "text-red-400", warning: "text-amber-400", info: "text-blue-400" };

  if (preview) {
    return (
      <PurchasePreview
        items={preview.items}
        container={preview.container}
        products={products}
        onConfirm={handleConfirm}
        onCancel={() => { setPreview(null); setLog([]); }}
      />
    );
  }

  return (
    <div>
      <ToastContainer />
      <Card>
        <SectionHeader icon="📦" title="رفع فاتورة شراء" />
        <div className="text-xs text-slate-500 space-y-0.5 mb-3 bg-slate-700/50 rounded-xl p-3">
          <div>📌 صف 1: رقم الكونتينر (BARXXXXX)</div>
          <div>📌 صف 2: رؤوس الأعمدة</div>
          <div className="text-slate-600">A=سعر البيع · B=الباركود · C=الاسم · D=الكمية · E=سعر الشراء</div>
        </div>
        <label className={`w-full border-2 border-dashed rounded-2xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors ${loading ? "border-blue-500 bg-blue-900/10" : "border-slate-600 hover:border-blue-500"}`}>
          <span className="text-4xl">{loading ? "⏳" : "📤"}</span>
          <span className="text-slate-300 font-bold text-sm">{loading ? "جاري المعالجة…" : "اسحب ملف الفاتورة هنا"}</span>
          <span className="text-slate-500 text-xs">Excel (.xlsx) — سيُعرض للمراجعة قبل الحفظ</span>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} disabled={loading} className="hidden" />
          {!loading && <span className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-sm">اختر ملف</span>}
        </label>
        {log.length > 0 && (
          <div className="mt-3 bg-slate-900 rounded-xl p-3 space-y-1 max-h-32 overflow-y-auto">
            {log.map((l, i) => <div key={i} className={`text-xs ${LOG_COLORS[l.type]}`}>{l.text}</div>)}
          </div>
        )}
      </Card>
    </div>
  );
});

// ─── تبويب الملخص ────────────────────────────────────────────

const SummaryTab = memo(({ summary, images, onSaveImage, onRemoveImage, settings, products, container, onUpdateProducts }) => {
  const [search,    setSearch]    = useState("");
  const [sortBy,    setSortBy]    = useState("invoice");
  const [filterFac, setFilterFac] = useState("");
  const [editProd,  setEditProd]  = useState(null);
  const [showAdd,   setShowAdd]   = useState(false);
  const { show, ToastContainer } = useToast();

  const factories = useMemo(
    () => [...new Set(summary.products.map(p => getFactoryCode(p.barcode)).filter(Boolean))].sort(),
    [summary.products]
  );

  const sorted = useMemo(() => {
    let list = [...summary.products];
    // نستبعد المطفي من العرض (يبقى محفوظاً)
    const disabledSet = new Set((products ?? []).filter(p => p.disabled).map(p => p.barcode));
    list = list.filter(p => !disabledSet.has(p.barcode));
    if (filterFac) list = list.filter(p => getFactoryCode(p.barcode) === filterFac);
    if (search)    list = list.filter(p => arabicIncludes(p.name, search) || p.barcode.includes(search));
    if (sortBy === "sold")    return list.sort((a,b) => b.sold - a.sold);
    if (sortBy === "margin")  return list.sort((a,b) => b.marginPct - a.marginPct);
    if (sortBy === "closing") return list.sort((a,b) => a.closing - b.closing);
    return list;
  }, [summary.products, sortBy, filterFac, search, products]);

  // المنتجات المطفية (لعرضها منفصلة مع زر تشغيل)
  const disabledProducts = useMemo(
    () => (products ?? []).filter(p => p.disabled && p.container === container),
    [products, container]
  );

  const cost = summary.products.reduce((s,p) => s + p.bought * p.buyPrice, 0);
  const closingVal = summary.products.reduce((s,p) => s + p.closing * p.buyPrice, 0);

  const STATUS_COLOR = { جيد: "text-emerald-400", منخفض: "text-amber-400", نفد: "text-red-400" };

  // المنتج الأصلي (مع disabled) للتعديل
  const rawProduct = (barcode) => products?.find(p => p.barcode === barcode) ?? null;

  return (
    <div className="space-y-4">
      <ToastContainer />

      {/* نوافذ التعديل والإضافة */}
      {editProd && (
        <ProductEditModal
          product={editProd}
          products={products}
          container={container}
          onSave={async (updated) => { await onUpdateProducts(updated); show("✅ تم الحفظ"); }}
          onClose={() => setEditProd(null)}
        />
      )}
      {showAdd && (
        <AddProductModal
          products={products}
          container={container}
          onSave={async (updated) => { await onUpdateProducts(updated); show("✅ تمت الإضافة"); }}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* الأرقام */}
      <div className="space-y-2">
        <div className="bg-blue-900/20 border border-blue-800/40 rounded-xl p-3">
          <div className="text-xs text-blue-300 font-bold mb-2">📦 المشتريات</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center"><div className="text-xl font-black text-blue-400 tabular-nums">{fmtN(summary.totalBought)}</div><div className="text-xs text-slate-500">قطعة</div></div>
            <div className="text-center"><div className="text-xl font-black text-blue-300 tabular-nums">{fmtM(cost)}</div><div className="text-xs text-slate-500">التكلفة</div></div>
          </div>
        </div>
        <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl p-3">
          <div className="flex justify-between mb-2"><span className="text-xs text-amber-300 font-bold">✅ المباع</span><span className="text-xs font-black text-amber-400">{fmtPct(summary.soldPct)}</span></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center"><div className="text-xl font-black text-amber-400 tabular-nums">{fmtN(summary.totalSold)}</div><div className="text-xs text-slate-500">قطعة</div></div>
            <div className="text-center"><div className="text-xl font-black text-emerald-400 tabular-nums">{fmtM(summary.totalRevenue)}</div><div className="text-xs text-slate-500">الإيرادات</div></div>
          </div>
        </div>
        <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-3">
          <div className="text-xs text-slate-300 font-bold mb-2">📋 المتبقي</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center"><div className="text-xl font-black text-slate-300 tabular-nums">{fmtN(summary.totalClosing)}</div><div className="text-xs text-slate-500">قطعة</div></div>
            <div className="text-center"><div className="text-xl font-black text-slate-300 tabular-nums">{fmtM(closingVal)}</div><div className="text-xs text-slate-500">القيمة</div></div>
          </div>
        </div>
        <div className="bg-emerald-900/20 border border-emerald-800/40 rounded-xl p-3 flex justify-between items-center">
          <span className="font-black text-emerald-300 text-sm">💰 الربح الصافي</span>
          <span className="text-2xl font-black text-emerald-400 tabular-nums">{fmtM(summary.totalProfit)}</span>
        </div>
      </div>

      {/* أزرار: إضافة منتج + Excel + طباعة */}
      <button onClick={() => setShowAdd(true)}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2">
        ➕ إضافة منتج جديد للكونتينر
      </button>
      <div className="flex gap-2">
        <button onClick={() => { const r = exportContainerReport(summary); if (!r.ok) show(r.error, "error"); else show("تم التصدير ✓"); }}
          className="flex-1 bg-emerald-600 text-white py-2 rounded-xl text-sm font-bold">📊 Excel</button>
        <button onClick={() => { const r = printContainerReport(summary, settings?.brandName, images); if (!r.ok) show(r.error, "error"); }}
          className="flex-1 bg-slate-700 border border-slate-600 text-slate-200 py-2 rounded-xl text-sm font-bold">🖨️ طباعة</button>
      </div>

      {/* فلاتر */}
      <div className="space-y-2">
        <SearchBar value={search} onChange={e => setSearch(e.target.value)} />
        {factories.length > 1 && (
          <select value={filterFac} onChange={e => setFilterFac(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
            <option value="">كل المصانع</option>
            {factories.map(f => <option key={f} value={f}>{f}{settings?.factories?.[f] ? ` · ${settings.factories[f]}` : ""}</option>)}
          </select>
        )}
        <FilterChips
          label="ترتيب:"
          options={[{key:"invoice",label:"الفاتورة"},{key:"sold",label:"الأكثر مبيعاً"},{key:"margin",label:"الأعلى هامشاً"},{key:"closing",label:"الأقل متبقياً"}]}
          active={sortBy} onChange={setSortBy}
        />
        <div className="text-xs text-slate-500">{sorted.length} منتج</div>
      </div>

      {/* المنتجات المطفية */}
      {disabledProducts.length > 0 && (
        <div className="bg-amber-900/10 border border-amber-800/30 rounded-xl p-3">
          <div className="text-xs text-amber-300 font-bold mb-2">⏸️ منتجات مطفية ({disabledProducts.length})</div>
          <div className="space-y-1.5">
            {disabledProducts.map(p => (
              <div key={p.barcode} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-300 truncate">{p.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{p.barcode}</div>
                </div>
                <button onClick={async () => {
                  const updated = products.map(x => x.barcode === p.barcode ? { ...x, disabled: false } : x);
                  await onUpdateProducts(updated);
                  show("✅ تم التشغيل");
                }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold shrink-0">
                  ▶️ تشغيل
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* المنتجات */}
      <div className="space-y-2">
        {sorted.map(p => {
          const raw = rawProduct(p.barcode);
          return (
          <Card key={p.barcode} className="!p-3">
            <div className="flex items-start gap-3 mb-2">
              <ProductImage barcode={p.barcode} images={images} onSave={onSaveImage} onRemove={onRemoveImage} size="lg" name={p.name} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-100 leading-tight">{p.name}</div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">{p.barcode}</div>
                <div className="text-xs text-blue-400 mt-0.5">🏭 {getFactoryCode(p.barcode)}{settings?.factories?.[getFactoryCode(p.barcode)] ? ` · ${settings.factories[getFactoryCode(p.barcode)]}` : ""}</div>
                <div className="flex gap-2 text-xs mt-1">
                  <span className="text-red-300">شراء: {fmtM(p.buyPrice)}</span>
                  <span className="text-emerald-300">بيع: {fmtM(p.sellPrice)}</span>
                  <span className="text-amber-300">هامش: {fmtPct(p.marginPct)}</span>
                </div>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end gap-1">
                <div className={`text-xl font-black tabular-nums ${STATUS_COLOR[p.status] ?? "text-slate-300"}`}>{fmtPct(p.soldPct)}</div>
                <div className={`text-xs font-bold ${STATUS_COLOR[p.status] ?? "text-slate-400"}`}>{p.status}</div>
                <button onClick={() => raw && setEditProd(raw)}
                  className="mt-1 px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-blue-600 border border-slate-600 text-slate-300 text-xs font-bold">
                  ✏️ تعديل
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <StatPill label="مشتريات" value={fmtN(p.bought)}  color="text-blue-400" />
              <StatPill label="مباع"    value={fmtN(p.sold)}    color="text-amber-400" />
              <StatPill label="متبقي"   value={fmtN(p.closing)} color={p.closing===0?"text-red-400":p.closing<12?"text-amber-400":"text-slate-300"} />
            </div>
          </Card>
          );
        })}
        {sorted.length === 0 && <EmptyState icon="📭" title="لا توجد نتائج" />}
      </div>
    </div>
  );
});

// ─── تبويب المصانع ────────────────────────────────────────────

const FactoriesTab = memo(({ summary, images, onSaveImage, onRemoveImage, settings }) => {
  const [selFac, setSelFac] = useState(null);

  const factories = useMemo(() => {
    const codes = [...new Set(summary.products.map(p => getFactoryCode(p.barcode)).filter(Boolean))].sort();
    return codes.map(code => {
      const prods = summary.products.filter(p => getFactoryCode(p.barcode) === code);
      const bought = prods.reduce((s,p) => s + p.bought, 0);
      const sold   = prods.reduce((s,p) => s + p.sold, 0);
      const soldPct = bought > 0 ? (sold/bought)*100 : 0;
      return { code, name: settings?.factories?.[code] ?? "", prods, bought, sold, soldPct };
    }).sort((a,b) => b.soldPct - a.soldPct);
  }, [summary.products, settings]);

  const STATUS_COLOR = { جيد: "text-emerald-400", منخفض: "text-amber-400", نفد: "text-red-400" };

  if (selFac) {
    const fac = factories.find(f => f.code === selFac);
    return (
      <div className="space-y-3">
        <BackBtn onClick={() => setSelFac(null)} label="رجوع للمصانع" />
        <Card>
          <div className="flex justify-between items-center mb-3">
            <div>
              <div className="font-black text-slate-100 text-lg">{fac.code}</div>
              {fac.name && <div className="text-xs text-slate-400">{fac.name}</div>}
            </div>
            <div className={`text-2xl font-black ${fac.soldPct>=60?"text-emerald-400":fac.soldPct>=30?"text-amber-400":"text-red-400"}`}>{fmtPct(fac.soldPct)}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <StatPill label="المنتجات"  value={fac.prods.length} color="text-blue-400" />
            <StatPill label="مباع"      value={fmtN(fac.sold)}   color="text-amber-400" />
            <StatPill label="المتبقي"   value={fmtN(fac.bought - fac.sold)} color="text-slate-300" />
          </div>
          <div className="flex gap-2">
            <Btn sm color="green" onClick={() => {
              import("../lib/exporters.js").then(({exportGeneric}) => exportGeneric(fac.prods.map(p=>({الباركود:p.barcode,الاسم:p.name,مشتريات:p.bought,مباع:p.sold,متبقي:p.closing,"نسبة%":p.soldPct.toFixed(1)})),`مصنع ${fac.code}`,`مصنع_${fac.code}`));
            }}>📊 Excel</Btn>
            <Btn sm color="ghost" onClick={() => window.print()}>🖨️ طباعة</Btn>
          </div>
        </Card>
        <div className="space-y-2">
          {fac.prods.sort((a,b) => b.soldPct - a.soldPct).map(p => (
            <Card key={p.barcode} className="!p-3">
              <div className="flex items-start gap-3 mb-2">
                <ProductImage barcode={p.barcode} images={images} onSave={onSaveImage} onRemove={onRemoveImage} size="lg" name={p.name} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-100 text-sm">{p.name}</div>
                  <div className="text-xs text-slate-400 font-mono">{p.barcode}</div>
                  <div className="flex gap-2 text-xs mt-1">
                    <span className="text-red-300">شراء: {fmtM(p.buyPrice)}</span>
                    <span className="text-emerald-300">بيع: {fmtM(p.sellPrice)}</span>
                  </div>
                </div>
                <div className={`text-xl font-black tabular-nums ${STATUS_COLOR[p.status]??""}`}>{fmtPct(p.soldPct)}</div>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <StatPill label="مشتريات" value={fmtN(p.bought)}  color="text-blue-400" />
                <StatPill label="مباع"    value={fmtN(p.sold)}    color="text-amber-400" />
                <StatPill label="متبقي"   value={fmtN(p.closing)} color={p.closing===0?"text-red-400":p.closing<12?"text-amber-400":"text-slate-300"} />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {factories.map((fac, i) => (
        <Card key={fac.code} onClick={() => setSelFac(fac.code)} className="!p-3">
          <div className="flex items-center gap-3 mb-2">
            <span className={`w-8 h-8 rounded-full text-xs flex items-center justify-center font-black shrink-0
              ${i===0?"bg-amber-500 text-black":i===1?"bg-slate-400 text-black":i===2?"bg-amber-700 text-white":"bg-slate-700 text-slate-400"}`}>
              {i+1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-slate-100 text-sm">{fac.code}</span>
                {fac.name && <span className="text-xs text-slate-400 truncate">· {fac.name}</span>}
              </div>
              <div className="text-xs text-slate-500">{fac.prods.length} منتج · {fmtN(fac.sold)} وحدة مباعة</div>
            </div>
            <div className={`text-xl font-black tabular-nums shrink-0 ${fac.soldPct>=60?"text-emerald-400":fac.soldPct>=30?"text-amber-400":"text-red-400"}`}>
              {fmtPct(fac.soldPct)}
            </div>
          </div>
          <ProgressBar value={fac.sold} max={fac.bought} color={fac.soldPct>=60?"bg-emerald-500":fac.soldPct>=30?"bg-amber-500":"bg-red-500"} />
        </Card>
      ))}
      {factories.length === 0 && <EmptyState icon="🏭" title="لا توجد مصانع" />}
    </div>
  );
});

// ─── تبويب نسبة البيع ────────────────────────────────────────

const SalesRateTab = memo(({ summary, images, onSaveImage, onRemoveImage, settings }) => {
  const [threshold,  setThreshold]  = useState(60);
  const [mode,       setMode]       = useState("below"); // below | above | all
  const [search,     setSearch]     = useState("");
  const { show, ToastContainer } = useToast();

  const filtered = useMemo(() => {
    let list = [...summary.products];
    if (mode === "above") list = list.filter(p => p.soldPct >= threshold);
    if (mode === "below") list = list.filter(p => p.soldPct < threshold);
    if (search) list = list.filter(p => arabicIncludes(p.name, search) || p.barcode.includes(search));
    return list.sort((a,b) => mode === "above" ? b.soldPct - a.soldPct : a.soldPct - b.soldPct);
  }, [summary.products, threshold, mode, search]);

  const STATUS_COLOR = { جيد: "text-emerald-400", منخفض: "text-amber-400", نفد: "text-red-400" };

  return (
    <div className="space-y-3">
      <ToastContainer />

      {/* تحديد النسبة */}
      <Card>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm text-slate-400 font-bold">نسبة البيع:</span>
          <input
            type="number"
            value={threshold}
            onChange={e => setThreshold(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            className="w-20 bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2 text-sm font-black text-center focus:outline-none focus:border-blue-500"
          />
          <span className="text-sm text-slate-400 font-bold">%</span>
        </div>
        <div className="flex bg-slate-700/50 rounded-xl p-1 gap-1">
          {[["below","أقل من","text-red-400"],["above","أكثر من","text-emerald-400"],["all","الكل","text-slate-300"]].map(([k,l,c]) => (
            <button key={k} onClick={() => setMode(k)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${mode===k ? `bg-slate-800 ${c}` : "text-slate-500"}`}>
              {l} {k !== "all" ? `${threshold}%` : ""}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <StatPill label="النتائج" value={fmtN(filtered.length)} color="text-blue-400" />
          <StatPill label="متوسط النسبة" value={fmtPct(filtered.length > 0 ? filtered.reduce((s,p)=>s+p.soldPct,0)/filtered.length : 0)} color="text-amber-400" />
        </div>
      </Card>

      {/* Excel وطباعة */}
      <div className="flex gap-2">
        <Btn color="green" onClick={() => {
          const data = filtered.map(p => ({
            "الباركود": p.barcode, "الاسم": p.name,
            "المصنع": getFactoryCode(p.barcode),
            "مشتريات": p.bought, "مباع": p.sold, "متبقي": p.closing,
            "نسبة البيع%": p.soldPct.toFixed(1), "الحالة": p.status,
          }));
          import("../lib/exporters.js").then(({ exportGeneric }) =>
            exportGeneric(data, `نسبة البيع: ${summary.container}`, `نسبة_البيع_${summary.container}`)
          );
        }} className="flex-1">📊 Excel</Btn>
        <Btn color="ghost" onClick={() => {
          import("../lib/exporters.js").then(({ printContainerReport }) =>
            printContainerReport(summary, settings?.brandName, images)
          );
        }} className="flex-1">🖨️ طباعة</Btn>
      </div>

      <SearchBar value={search} onChange={e => setSearch(e.target.value)} />

      <div className="space-y-2">
        {filtered.map(p => (
          <Card key={p.barcode} className="!p-3">
            <div className="flex items-start gap-3 mb-2">
              <ProductImage barcode={p.barcode} images={images} onSave={onSaveImage} onRemove={onRemoveImage} size="lg" name={p.name} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-100 text-sm">{p.name}</div>
                <div className="text-xs text-slate-400 font-mono">{p.barcode}</div>
                <div className="text-xs text-blue-400">🏭 {getFactoryCode(p.barcode)}{settings?.factories?.[getFactoryCode(p.barcode)] ? ` · ${settings.factories[getFactoryCode(p.barcode)]}` : ""}</div>
                <div className="flex gap-2 text-xs mt-1">
                  <span className="text-red-300">شراء: {fmtM(p.buyPrice)}</span>
                  <span className="text-emerald-300">بيع: {fmtM(p.sellPrice)}</span>
                  <span className="text-amber-300">هامش: {fmtPct(p.marginPct)}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-2xl font-black tabular-nums ${p.soldPct >= threshold ? "text-emerald-400" : p.soldPct >= threshold*0.5 ? "text-amber-400" : "text-red-400"}`}>
                  {fmtPct(p.soldPct)}
                </div>
                <div className={`text-xs font-bold ${STATUS_COLOR[p.status] ?? "text-slate-400"}`}>{p.status}</div>
              </div>
            </div>
            <ProgressBar value={p.sold} max={p.bought}
              color={p.soldPct >= threshold ? "bg-emerald-500" : p.soldPct >= threshold*0.5 ? "bg-amber-500" : "bg-red-500"} />
            <div className="grid grid-cols-3 gap-1 mt-2">
              <StatPill label="مشتريات" value={fmtN(p.bought)}  color="text-blue-400" />
              <StatPill label="مباع"    value={fmtN(p.sold)}    color="text-amber-400" />
              <StatPill label="متبقي"   value={fmtN(p.closing)} color={p.closing===0?"text-red-400":p.closing<12?"text-amber-400":"text-slate-300"} />
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <EmptyState icon="📭" title="لا توجد نتائج" subtitle={`لا يوجد منتجات ${mode === "above" ? "فوق" : "تحت"} ${threshold}%`} />}
      </div>
    </div>
  );
});

// ─── تفاصيل الكونتينر ────────────────────────────────────────

const ContainerDetail = memo(({ container, products, periods, images, onSaveImage, onRemoveImage, settings, onBack, onUpdateProducts }) => {
  const [tab, setTab] = useState("summary");

  const summary = useMemo(
    () => containerSummary(products, periods, container),
    [products, periods, container]
  );

  const TABS = [
    { key: "summary",   label: "📊 ملخص" },
    { key: "factories", label: "🏭 مصانع" },
    { key: "need",      label: "🔴 احتياج" },
  ];

  const handleDelete = async () => {
    if (!window.confirm(`حذف كونتينر ${container}؟\nسيتم عكس جميع الكميات من المخزون.`)) return;
    const { products: updated } = reversePurchases(products, container);
    await onUpdateProducts(updated);
    onBack();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <BackBtn onClick={onBack} label="رجوع للكونتينرات" />
        <button onClick={handleDelete}
          className="px-3 py-2 rounded-xl border border-red-700/50 bg-red-900/20 text-red-400 text-xs font-bold">
          🗑️ حذف الكونتينر
        </button>
      </div>

      {/* عنوان */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-black text-slate-100 text-xl">{container}</div>
          <div className="text-xs text-slate-500">{summary.productCount} منتج</div>
        </div>
        <div className={`text-3xl font-black tabular-nums ${summary.soldPct>=70?"text-orange-400":summary.soldPct>=40?"text-amber-400":"text-blue-400"}`}>
          {fmtPct(summary.soldPct)}
        </div>
      </div>

      {/* شريط التقدم */}
      <ProgressBar value={summary.totalSold} max={summary.totalBought}
        color="bg-gradient-to-r from-blue-500 to-emerald-500" />

      {/* التبويبات */}
      <div className="flex bg-slate-800 border border-slate-700 rounded-2xl p-1 gap-1">
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors
              ${tab===key ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* المحتوى */}
      {tab === "summary"   && <SummaryTab   summary={summary} images={images} onSaveImage={onSaveImage} onRemoveImage={onRemoveImage} settings={settings} products={products} container={container} onUpdateProducts={onUpdateProducts} />}
      {tab === "factories" && <FactoriesTab summary={summary} images={images} onSaveImage={onSaveImage} onRemoveImage={onRemoveImage} settings={settings} />}
      {tab === "need"      && <SalesRateTab summary={summary} images={images} onSaveImage={onSaveImage} onRemoveImage={onRemoveImage} settings={settings} />}
    </div>
  );
});

// ─── قائمة الكونتينرات ───────────────────────────────────────

const ContainerList = memo(({ products, periods, onSelect }) => {
  const summaries = useMemo(() =>
    allContainers(products)
      .map(c => containerSummary(products, periods, c))
      .sort((a,b) => b.soldPct - a.soldPct),
    [products, periods]
  );

  return (
    <div className="space-y-2">
      {summaries.map(s => (
        <Card key={s.container} onClick={() => onSelect(s.container)} className="!p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-black text-slate-100">{s.container}</div>
              <div className="text-xs text-slate-500">{s.productCount} منتج</div>
            </div>
            <div className={`text-2xl font-black tabular-nums ${s.soldPct>=70?"text-orange-400":s.soldPct>=40?"text-amber-400":"text-blue-400"}`}>
              {fmtPct(s.soldPct)}
            </div>
          </div>
          <ProgressBar value={s.totalSold} max={s.totalBought}
            color={s.soldPct>=70?"bg-orange-500":s.soldPct>=40?"bg-amber-500":"bg-blue-500"} />
          <div className="grid grid-cols-3 gap-2 mt-2">
            <StatPill label="الإيرادات" value={fmtM(s.totalRevenue)} color="text-emerald-400" />
            <StatPill label="المباع"    value={fmtN(s.totalSold)}    color="text-amber-400" />
            <StatPill label="الربح"     value={fmtM(s.totalProfit)}  color="text-emerald-300" />
          </div>
        </Card>
      ))}
      {summaries.length === 0 && <EmptyState icon="📦" title="لا توجد كونتينرات" subtitle="ارفع فاتورة شراء أولاً" />}
    </div>
  );
});

// ─── الشاشة الرئيسية ─────────────────────────────────────────

export default function ContainersScreen({ products, periods, settings, images, onUpdateProducts, onSaveImage, onRemoveImage, onDeleteContainer }) {
  const [selected, setSelected] = useState(null);
  const [showOrphans, setShowOrphans] = useState(false);

  // الباركودات اللي لها مبيعات بس ما لها فاتورة مشتريات
  const orphans = useMemo(() => findOrphanBarcodes(products, periods), [products, periods]);

  if (showOrphans) {
    return (
      <OrphansScreen
        orphans={orphans}
        products={products}
        periods={periods}
        onUpdateProducts={onUpdateProducts}
        onBack={() => setShowOrphans(false)}
      />
    );
  }

  if (selected) {
    return (
      <ContainerDetail
        container={selected}
        products={products}
        periods={periods}
        images={images}
        onSaveImage={onSaveImage}
        onRemoveImage={onRemoveImage}
        settings={settings}
        onUpdateProducts={onUpdateProducts}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <UploadSection products={products} onUpdate={onUpdateProducts} />

      {/* فاتورة يتيمة: باركودات لها مبيعات بلا فاتورة مشتريات */}
      {orphans.length > 0 && (
        <button onClick={() => setShowOrphans(true)} className="w-full text-right">
          <div style={{
            background:"linear-gradient(135deg, rgba(245,158,11,0.15), rgba(217,119,6,0.06))",
            border:"1px solid rgba(245,158,11,0.35)", borderRadius:"16px", padding:"16px",
            display:"flex", alignItems:"center", gap:"14px",
          }}>
            <div style={{fontSize:"32px"}}>📋</div>
            <div style={{flex:1}}>
              <div style={{fontSize:"16px", fontWeight:900, color:"#fff"}}>بلا فاتورة مشتريات</div>
              <div style={{fontSize:"12px", color:"#fcd34d", marginTop:"2px"}}>
                {orphans.length} باركود له مبيعات — اضغط لضمّها لكونتينر
              </div>
            </div>
            <div style={{fontSize:"20px", color:"#f59e0b"}}>←</div>
          </div>
        </button>
      )}

      {products.length > 0 && (
        <div>
          <SectionHeader icon="📦" title="الكونتينرات" subtitle="اضغط للتفاصيل" />
          <ContainerList products={products} periods={periods} onSelect={setSelected} />
        </div>
      )}
    </div>
  );
}

// ─── شاشة الباركودات اليتيمة ─────────────────────────────────
function OrphansScreen({ orphans, products, periods, onUpdateProducts, onBack }) {
  const [search, setSearch] = useState("");
  const [moving, setMoving] = useState(null);   // الباركود قيد النقل
  const [msg, setMsg] = useState("");

  const containers = useMemo(() => allContainers(products), [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orphans;
    return orphans.filter(o => o.barcode.toLowerCase().includes(q) || arabicIncludes(o.name || "", q));
  }, [orphans, search]);

  // ننقل الباركود لكونتينر مختار (كمية شراء 0 مبدئياً)
  const moveToContainer = useCallback(async (orphan, container) => {
    // كمية الشراء = المباع + 20% (تطلع موجبة وتظهر في النواقص صح — تعدّلها لاحقاً)
    const buyQty = Math.ceil(num(orphan.sold) * 1.2);
    const newProduct = {
      barcode: orphan.barcode,
      name: orphan.name || orphan.barcode,
      container,
      purchases: [{ qty: buyQty, buyPrice: 0, sellPrice: 0, date: new Date().toISOString().slice(0,10), container }],
    };
    await onUpdateProducts([...products, newProduct]);
    setMoving(null);
    setMsg(`✅ ${orphan.barcode} → ${container} · شراء: ${buyQty} (مباع ${num(orphan.sold)} +20%)`);
    setTimeout(() => setMsg(""), 4000);
  }, [products, onUpdateProducts]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-blue-400 font-bold text-sm">← رجوع</button>
        <div className="font-black text-slate-100">📋 بلا فاتورة مشتريات</div>
        <div className="w-12" />
      </div>

      <div style={{background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:"12px", padding:"12px", fontSize:"12px", color:"#fcd34d", lineHeight:1.7}}>
        هذي الباركودات لها مبيعات لكن ما لها فاتورة مشتريات. اختر كونتينر لكل وحد لتضمّها — كمية الشراء تُحسب تلقائياً (المباع + 20%)، عدّلها من الكونتينر بعدين.
      </div>

      {msg && <div style={{background:"rgba(16,185,129,0.15)", border:"1px solid rgba(16,185,129,0.3)", borderRadius:"10px", padding:"10px", fontSize:"13px", color:"#6ee7b7", fontWeight:700}}>{msg}</div>}

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 بحث بالباركود أو الاسم…"
        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm" />

      <div className="text-xs text-slate-500">{filtered.length} باركود</div>

      <div className="space-y-2">
        {filtered.map(o => (
          <div key={o.barcode} style={{background:"#1e293b", border:"1px solid #334155", borderRadius:"12px", padding:"12px"}}>
            <div className="flex items-start justify-between gap-2">
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontFamily:"monospace", fontSize:"15px", fontWeight:900, color:"#fff", letterSpacing:"1px"}}>{o.barcode}</div>
                {o.name && <div style={{fontSize:"12px", color:"#94a3b8", marginTop:"2px", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{o.name}</div>}
                <div style={{display:"flex", gap:"10px", marginTop:"6px", fontSize:"11px"}}>
                  <span style={{color:"#fbbf24"}}>مباع: <b>{fmtN(o.sold)}</b></span>
                  <span style={{color:"#64748b"}}>·</span>
                  <span style={{color:"#60a5fa"}}>{o.branchCount} فرع</span>
                </div>
              </div>
            </div>

            {moving === o.barcode ? (
              <div style={{marginTop:"10px"}}>
                <div style={{fontSize:"11px", color:"#94a3b8", marginBottom:"6px"}}>اختر الكونتينر:</div>
                <div style={{display:"flex", flexWrap:"wrap", gap:"6px"}}>
                  {containers.map(c => (
                    <button key={c} onClick={() => moveToContainer(o, c)}
                      style={{background:"#2563eb", color:"#fff", border:"none", borderRadius:"8px", padding:"7px 12px", fontSize:"12px", fontWeight:700, cursor:"pointer"}}>
                      {c}
                    </button>
                  ))}
                  {containers.length === 0 && <div style={{fontSize:"12px", color:"#f87171"}}>لا توجد كونتينرات — ارفع فاتورة شراء أولاً</div>}
                </div>
                <button onClick={() => setMoving(null)} style={{marginTop:"8px", fontSize:"12px", color:"#94a3b8", background:"none", border:"none", cursor:"pointer"}}>إلغاء</button>
              </div>
            ) : (
              <button onClick={() => setMoving(o.barcode)}
                style={{width:"100%", marginTop:"10px", background:"rgba(37,99,235,0.15)", border:"1px solid rgba(37,99,235,0.3)", color:"#60a5fa", borderRadius:"9px", padding:"9px", fontSize:"13px", fontWeight:700, cursor:"pointer"}}>
                📦 نقل لكونتينر
              </button>
            )}
          </div>
        ))}
        {filtered.length === 0 && <EmptyState icon="✅" title="ما فيه باركودات يتيمة" subtitle="كل الباركودات لها فاتورة مشتريات" />}
      </div>
    </div>
  );
}
