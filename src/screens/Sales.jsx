// ============================================================
// Sales.jsx — شاشة المبيعات مع معاينة قبل الاعتماد
// ============================================================

import { useState, useMemo, memo } from "react";
import {
  Card, Btn, StatPill, EmptyState, SectionHeader,
  ConfirmModal, SearchBar, useToast, fmtN, fmtM,
} from "../components/UI.jsx";
import { parseSalesFile, parseMonthlyFile } from "../lib/parsers.js";
import { num } from "../lib/calc.js";

// ─── شاشة المراجعة قبل الاعتماد ─────────────────────────────

function PreviewScreen({ period, products = [], onConfirm, onCancel }) {
  const [search, setSearch] = useState("");

  const branches = Object.keys(period.sales ?? {});
  const totalUnits = branches.reduce((s, b) =>
    s + Object.values(period.sales[b]).reduce((ss, v) => ss + num(v.qty), 0), 0);
  const totalRev = branches.reduce((s, b) =>
    s + Object.values(period.sales[b]).reduce((ss, v) => ss + num(v.totalPrice), 0), 0);

  // نجمع كل المنتجات من كل الفروع
  const allProducts = useMemo(() => {
    const map = {};
    branches.forEach(branch => {
      Object.entries(period.sales[branch]).forEach(([barcode, data]) => {
        if (!map[barcode]) map[barcode] = { barcode, totalQty: 0, totalRev: 0, branches: {} };
        map[barcode].totalQty += num(data.qty);
        map[barcode].totalRev += num(data.totalPrice);
        map[barcode].branches[branch] = { qty: num(data.qty), price: num(data.totalPrice) };
      });
    });
    return Object.values(map).sort((a, b) => b.totalQty - a.totalQty);
  }, [period]);

  const filtered = allProducts.filter(p =>
    !search || p.barcode.toLowerCase().includes(search.toLowerCase())
  );

  // تنبيهات
  const warnings = [];
  if (allProducts.some(p => !p.barcode)) warnings.push("⚠️ يوجد منتجات بدون باركود");
  if (allProducts.some(p => p.totalQty > 1000)) warnings.push("⚠️ يوجد كميات غير منطقية (أكثر من 1000)");
  const unknownBarcodes = products.length > 0
    ? allProducts.filter(p => !products.some(pr => pr.barcode === p.barcode))
    : [];
  if (unknownBarcodes.length > 0)
    warnings.push(`⚠️ ${unknownBarcodes.length} باركود غير موجود في المخزون: ${unknownBarcodes.slice(0,3).map(p=>p.barcode).join(", ")}${unknownBarcodes.length>3?" ...":""}`);

  return (
    <div className="space-y-4">
      <SectionHeader icon="🔍" title="مراجعة الفاتورة" subtitle="تأكد من البيانات قبل الاعتماد" />

      {/* ملخص */}
      <Card>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <StatPill label="الفروع"    value={branches.length}     color="text-blue-400" />
          <StatPill label="المنتجات"  value={allProducts.length}  color="text-amber-400" />
          <StatPill label="إجمالي الوحدات" value={fmtN(totalUnits)} color="text-emerald-400" />
          <StatPill label="إجمالي الإيرادات" value={fmtM(totalRev)} color="text-purple-400" />
        </div>
        <div className="text-sm font-bold text-slate-100 mb-1">📅 الفترة: {period.label}</div>
        <div className="text-xs text-slate-400">{branches.length} فرع نشط</div>
      </Card>

      {/* تنبيهات */}
      {warnings.map((w, i) => (
        <div key={i} className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-4 py-3 text-amber-300 text-sm">{w}</div>
      ))}

      {/* قائمة المنتجات */}
      <SearchBar value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 بحث بالباركود…" />

      <div className="space-y-2">
        {filtered.slice(0, 50).map(p => (
          <Card key={p.barcode} className="!p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-mono text-blue-400 text-sm font-bold">{p.barcode}</div>
              <div className="text-right">
                <div className="font-black text-emerald-400 tabular-nums">{fmtN(p.totalQty)} وحدة</div>
                <div className="text-xs text-slate-400">{fmtM(p.totalRev)}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(p.branches).filter(([,v]) => v.qty > 0).map(([branch, v]) => (
                <span key={branch} className="text-xs bg-slate-700 text-slate-300 rounded-lg px-2 py-0.5">
                  {branch}: {fmtN(v.qty)}
                </span>
              ))}
            </div>
          </Card>
        ))}
        {filtered.length > 50 && (
          <div className="text-center text-slate-500 text-sm py-2">عرض أول 50 من {filtered.length}</div>
        )}
      </div>

      {/* أزرار */}
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
}

// ─── الشاشة الرئيسية ─────────────────────────────────────────

export default function SalesScreen({ periods, products = [], onAddPeriod, onDeletePeriod, onGetPeriods }) {
  const [loading,      setLoading]      = useState(false);
  const [label,        setLabel]        = useState("");
  const [log,          setLog]          = useState([]);
  const [preview,      setPreview]      = useState(null); // الفاتورة في انتظار المراجعة
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [uploadType,   setUploadType]   = useState("single"); // single | monthly
  const { show, ToastContainer } = useToast();

  const today = new Date().toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setLog([]);

    try {
      const buffer = await file.arrayBuffer();
      const { period, errors, warnings } = parseSalesFile(buffer, label);

      warnings.forEach(w => setLog(p => [...p, { type: "warning", text: w }]));

      if (errors.length > 0) {
        errors.forEach(err => setLog(p => [...p, { type: "error", text: err }]));
        setLoading(false);
        e.target.value = "";
        return;
      }

      // تحقق من التكرار قبل المراجعة
      const existingPeriods = onGetPeriods?.() ?? [];
      const isDuplicate = existingPeriods.some(p =>
        p.fingerprint && period.fingerprint && p.fingerprint === period.fingerprint
      );
      if (isDuplicate) {
        setLog(p => [...p, {
          type: "warning",
          text: "⚠️ هذا الملف مرفوع مسبقاً — نفس الأرقام موجودة في النظام"
        }]);
        setLoading(false);
        e.target.value = "";
        return;
      }

      // نعرض المراجعة بدل الحفظ المباشر
      setPreview(period);

    } catch (err) {
      setLog(p => [...p, { type: "error", text: `خطأ: ${err.message}` }]);
    }

    setLoading(false);
    e.target.value = "";
  };

  const handleConfirmMonthly = async () => {
    if (!preview || preview.type !== "monthly") return;
    setLoading(true);
    let saved = 0, skipped = 0;
    for (const period of preview.periods) {
      const result = await onAddPeriod(period);
      if (result.ok) saved++;
      else skipped++;
    }
    setLog(p => [...p,
      { type: "success", text: `✅ تم حفظ ${saved} فترة` },
      ...(skipped > 0 ? [{ type: "warning", text: `⚠️ ${skipped} فترة مكررة تم تجاهلها` }] : []),
    ]);
    setPreview(null);
    setLoading(false);
  };

  const handleMonthlyFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setLog([]);
    try {
      const buffer = await file.arrayBuffer();
      const { periods: newPeriods, errors, warnings } = parseMonthlyFile(buffer);
      if (errors.length > 0) {
        errors.forEach(err => setLog(p => [...p, { type:"error", text:err }]));
        setLoading(false); e.target.value = ""; return;
      }
      warnings.forEach(w => setLog(p => [...p, { type:"warning", text:w }]));
      if (newPeriods.length === 0) {
        setLog(p => [...p, { type:"error", text:"لم يُعثر على شهور في الملف" }]);
        setLoading(false); e.target.value = ""; return;
      }
      setPreview({ type:"monthly", periods: newPeriods });
    } catch (err) {
      setLog(p => [...p, { type:"error", text:`خطأ: ${err.message}` }]);
    }
    setLoading(false); e.target.value = "";
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setLoading(true);

    const result = await onAddPeriod(preview);

    if (!result.ok) {
      if (result.reason?.includes("مرفوعة") || result.reason?.includes("مكرر")) {
        setLog(p => [...p, { type: "warning", text: `⚠️ ${result.reason}` }]);
        show(result.reason, "warning");
      } else {
        setLog(p => [...p, { type: "error", text: `فشل الحفظ: ${result.reason}` }]);
      }
    } else {
      const branchCount = Object.keys(preview.sales ?? {}).length;
      const totalSold   = Object.values(preview.sales ?? {}).reduce((s, d) =>
        s + Object.values(d).reduce((ss, v) => ss + (v.qty || 0), 0), 0);

      setLog(p => [...p,
        { type: "success", text: `✅ تم حفظ الفترة "${preview.label}"` },
        { type: "info",    text: `${branchCount} فرع · ${fmtN(totalSold)} وحدة مباعة` },
      ]);
      show(`✅ تم حفظ "${preview.label}"`);
      setLabel("");
    }

    setPreview(null);
    setLoading(false);
  };

  const LOG_COLORS = {
    success: "text-emerald-400",
    error:   "text-red-400",
    warning: "text-amber-400",
    info:    "text-blue-400",
  };

  // لو في معاينة — نعرض شاشة المراجعة
  if (preview?.type === "monthly") {
    return (
      <div className="space-y-4">
        <div className="bg-purple-900/30 border border-purple-700/40 rounded-xl p-4">
          <div className="font-black text-slate-100 text-lg mb-1">📅 ملف شهري</div>
          <div className="text-sm text-purple-300">{preview.periods.length} فترة جاهزة للحفظ</div>
        </div>
        <div className="space-y-2">
          {preview.periods.map((p, i) => {
            const totalQty = Object.values(p.sales ?? {}).reduce((s,b) =>
              s + Object.values(b).reduce((ss,v) => ss + (v.qty ?? 0), 0), 0);
            const branchCount = Object.keys(p.sales ?? {}).length;
            return (
              <div key={p.id} className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-100">{p.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{branchCount} فرع · {Number(totalQty).toLocaleString()} وحدة</div>
                  </div>
                  <div className="text-purple-400 font-black">#{i+1}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={handleConfirmMonthly} disabled={loading}
            className="py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-50">
            ✅ حفظ {preview.periods.length} فترة
          </button>
          <button onClick={() => { setPreview(null); setLog([]); }}
            className="py-3 rounded-xl bg-slate-700 text-slate-200 font-bold text-sm">
            ✕ إلغاء
          </button>
        </div>
      </div>
    );
  }

  if (preview) {
    return (
      <PreviewScreen
        period={preview}
        products={products}
        onConfirm={handleConfirm}
        onCancel={() => { setPreview(null); setLog([]); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <ToastContainer />

      {deleteTarget === "all" && (
        <ConfirmModal
          title="حذف كل الفترات"
          message={`هل تريد حذف جميع الفترات (${periods.length})؟ لا يمكن التراجع.`}
          onConfirm={async () => {
            setLoading(true);
            for (const p of periods) { await onDeletePeriod(p.id); }
            setDeleteTarget(null);
            setLoading(false);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {deleteTarget && deleteTarget !== "all" && (
        <ConfirmModal
          title="حذف فترة المبيعات"
          message={`هل تريد حذف "${deleteTarget.label}"؟`}
          onConfirm={async () => {
            const r = await onDeletePeriod(deleteTarget.id);
            setDeleteTarget(null);
            if (r?.ok) show("تم الحذف");
            else show(r?.error ?? "فشل الحذف", "error");
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <SectionHeader icon="📊" title="المبيعات" subtitle={today} />

      {/* رفع ملف */}
      <Card>
        <SectionHeader icon="📤" title="رفع ملف مبيعات" />
        <div className="space-y-3">
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="اسم الفترة (اختياري)"
            className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
          />
          <label className="w-full border-2 border-dashed border-slate-600 hover:border-blue-500 rounded-2xl p-5 flex flex-col items-center gap-2 cursor-pointer transition-colors">
            {loading ? (
              <div className="text-blue-400 font-bold text-sm animate-pulse">⏳ جاري القراءة…</div>
            ) : (
              <>
                <span className="text-3xl">📊</span>
                <span className="text-slate-300 font-bold text-sm">اختر ملف Excel للمبيعات</span>
                <span className="text-slate-500 text-xs">سيُعرض للمراجعة قبل الحفظ</span>
              </>
            )}
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={uploadType === "monthly" ? handleMonthlyFile : handleFile}
              disabled={loading} />
          </label>

          {/* toggle نوع الرفع */}
          <div className="flex gap-2 mt-2">
            <button onClick={() => setUploadType("single")}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors
                ${uploadType==="single" ? "bg-blue-600 text-white border-blue-500" : "bg-slate-700 text-slate-400 border-slate-600"}`}>
              📊 فترة واحدة
            </button>
            <button onClick={() => setUploadType("monthly")}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors
                ${uploadType==="monthly" ? "bg-purple-600 text-white border-purple-500" : "bg-slate-700 text-slate-400 border-slate-600"}`}>
              📅 شهري (1-12 شهر)
            </button>
          </div>
          {uploadType === "monthly" && (
            <div className="text-xs text-purple-300/70 text-center mt-1">
              يقرأ جميع الشهور والفروع دفعة واحدة
            </div>
          )}
        </div>

        {log.length > 0 && (
          <div className="mt-3 space-y-1 bg-slate-800/50 rounded-xl p-3">
            {log.map((l, i) => (
              <div key={i} className={`text-xs font-mono ${LOG_COLORS[l.type]}`}>{l.text}</div>
            ))}
          </div>
        )}
      </Card>

      {/* الفترات */}
      <div className="flex items-center justify-between">
        <SectionHeader icon="📅" title={`الفترات (${periods.length})`} />
        {periods.length > 0 && (
          <button onClick={() => setDeleteTarget("all")}
            className="px-3 py-1.5 rounded-xl border border-red-700/50 bg-red-900/20 text-red-400 text-xs font-bold">
            🗑️ حذف الكل
          </button>
        )}
      </div>

      {periods.length === 0 ? (
        <EmptyState icon="📅" title="لا توجد فترات" subtitle="ارفع ملف مبيعات للبداية" />
      ) : (
        <div className="space-y-2">
          {[...periods].reverse().map(period => {
            const branchCount  = Object.keys(period.sales ?? {}).length;
            const productCount = new Set(
              Object.values(period.sales ?? {}).flatMap(d => Object.keys(d))
            ).size;
            const totalSold = Object.values(period.sales ?? {}).reduce((s, d) =>
              s + Object.values(d).reduce((ss, v) => ss + num(v.qty), 0), 0);
            const totalRev = Object.values(period.sales ?? {}).reduce((s, d) =>
              s + Object.values(d).reduce((ss, v) => ss + num(v.totalPrice), 0), 0);

            return (
              <Card key={period.id} className="!p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-black text-slate-100 text-sm">{period.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">📅 {period.uploadDate} · {branchCount} فرع نشط</div>
                  </div>
                  <button onClick={() => setDeleteTarget(period)}
                    className="text-red-400 hover:text-red-300 text-lg shrink-0">🗑</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <StatPill label="المنتجات"  value={fmtN(productCount)} color="text-blue-400" />
                  <StatPill label="مباع"       value={fmtN(totalSold)}    color="text-amber-400" />
                  <StatPill label="الإيرادات"  value={fmtM(totalRev)}     color="text-emerald-400" />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
