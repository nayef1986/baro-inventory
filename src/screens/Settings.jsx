// ============================================================
// Settings.jsx — الإعدادات
// ============================================================

import { useState, useMemo, memo } from "react";
import {
  Card, Btn, StatPill, EmptyState, SectionHeader,
  ConfirmModal, useToast, fmtN,
} from "../components/UI.jsx";
import { allContainers, allFactoryCodes, getFactoryCode } from "../lib/calc.js";

// ─── رفع ذكي مع قراءة باركود ──────────────────────────────────

function SmartScanUpload({ products, onBulkSaveImage }) {
  const [scanning,  setScanning]  = useState(false);
  const [results,   setResults]   = useState([]);
  const [error,     setError]     = useState("");

  const handleFiles = async (files) => {
    setScanning(true);
    setResults([]);
    setError("");

    const fileArr = Array.from(files);
    const newResults = [];

    for (const file of fileArr) {
      // نضغط الصورة
      const base64 = await new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          // نحافظ على دقة عالية لقراءة الأرقام
          const MAX = 1600;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
            else { width = Math.round(width * MAX / height); height = MAX; }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext("2d");
          // نحسّن وضوح النص
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/png")); // PNG أوضح للأرقام
        };
        img.onerror = reject;
        img.src = url;
      });

      try {
        // نرسل لـ Gemini للقراءة
        const response = await fetch("/api/scan-barcode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64 }),
        });
        const data = await response.json();

        // نجمع كل المرشحين من OCR
        const candidates = data.candidates?.length ? data.candidates : (data.barcode ? [data.barcode] : []);

        // مطابقة ذكية: تامة أولاً (تغطي الباركود الداخلي والتجاري الطويل)
        let matched = null;

        // 1) مطابقة تامة — أي رقم مقروء يطابق باركود منتج بالضبط
        for (const cand of candidates) {
          const exact = products.find(p => p.barcode.toUpperCase() === cand.toUpperCase());
          if (exact) { matched = exact; break; }
        }

        // 2) مطابقة جزئية آمنة لتجاوز خطأ OCR بسيط (خانة أو خانتين)
        if (!matched) {
          for (const cand of candidates) {
            if (cand.length < 8) continue; // أكواد قصيرة خطرة
            const partial = products.find(p => {
              const b = p.barcode.toUpperCase();
              const c = cand.toUpperCase();
              if (b.length < 8) return false;
              // الأطول يبدأ بالأقصر، والفرق خانتين كحد أقصى
              const longer  = b.length >= c.length ? b : c;
              const shorter = b.length >= c.length ? c : b;
              return longer.startsWith(shorter) && (longer.length - shorter.length) <= 2;
            });
            if (partial) { matched = partial; break; }
          }
        }

        if (matched) {
          if (onBulkSaveImage) {
            await onBulkSaveImage(matched.barcode, base64);
          }
          newResults.push({ file: file.name, barcode: matched.barcode, product: matched.name, status: "success" });
        } else if (candidates.length > 0) {
          // قرأ كوداً لكن ما طابق منتجاً — نعرضه ليطابقه المستخدم يدوياً
          newResults.push({ file: file.name, barcode: candidates[0], product: null, status: "not_found" });
        } else {
          newResults.push({ file: file.name, barcode: null, product: null, status: "no_barcode", message: data.message });
        }
      } catch (e) {
        newResults.push({ file: file.name, barcode: null, product: null, status: "error", message: e.message });
      }

      setResults([...newResults]);
    }

    setScanning(false);
  };

  return (
    <div className="space-y-3">
      <label
        className="w-full border-2 border-dashed border-slate-600 hover:border-purple-500 rounded-2xl p-5 flex flex-col items-center gap-2 cursor-pointer transition-colors"
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        <span className="text-3xl">{scanning ? "⏳" : "🤖"}</span>
        <span className="text-slate-300 font-bold text-sm">{scanning ? "جاري القراءة…" : "ارفع صورة منتج أو كرتون"}</span>
        <span className="text-slate-500 text-xs">Gemini يقرأ الباركود تلقائياً · يدعم السحب والإفلات</span>
        <input type="file" accept="image/*" multiple className="hidden"
          onChange={e => handleFiles(e.target.files)} disabled={scanning} />
      </label>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={i} className={`rounded-xl px-3 py-2.5 text-xs ${
              r.status === "success"   ? "bg-emerald-900/20 border border-emerald-700/40" :
              r.status === "not_found" ? "bg-amber-900/20 border border-amber-700/40" :
              "bg-red-900/20 border border-red-700/40"
            }`}>
              <div className="font-bold text-slate-100 truncate">{r.file}</div>
              {r.barcode && <div className="font-mono text-blue-400 mt-0.5">{r.barcode}</div>}
              {r.product  && <div className="text-emerald-400 mt-0.5">✅ {r.product}</div>}
              {r.status === "not_found" && <div className="text-amber-400 mt-0.5">⚠️ الباركود غير موجود في النظام</div>}
              {r.status === "no_barcode" && <div className="text-red-400 mt-0.5">❌ لم يُعثر على باركود</div>}
              {r.status === "error" && <div className="text-red-400 mt-0.5">❌ خطأ: {r.message}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsScreen({ products, periods, settings, onSaveSettings, onClearAll, onBulkSaveImage }) {
  const [brandName, setBrandName] = useState(settings?.brandName ?? "البارو");
  const [minStock,  setMinStock]  = useState(settings?.minStock ?? 12);
  const [localFac,  setLocalFac]  = useState({ ...settings?.factories ?? {} });
  const [facSearch, setFacSearch] = useState("");
  const [showClear,  setShowClear]  = useState(false);
  const [bulkStatus, setBulkStatus] = useState({ loading: false, done: false, success: 0, failed: 0, total: 0, current: 0 });
  const { show, ToastContainer } = useToast();

  // مصانع مجمّعة تحت الكونتينر
  const containerFactories = useMemo(() => {
    const containers = allContainers(products);
    return containers.map(cont => {
      const contProds = products.filter(p => p.container === cont);
      const codes = [...new Set(contProds.map(p => getFactoryCode(p.barcode)).filter(Boolean))].sort();
      return { cont, codes };
    }).filter(c => c.codes.length > 0);
  }, [products]);

  const handleSave = async () => {
    const ok = await onSaveSettings({ ...settings, brandName, minStock, factories: localFac });
    if (ok) show("تم الحفظ ✓"); else show("فشل الحفظ", "error");
  };

  const handleFacChange = (code, value) => {
    setLocalFac(prev => ({ ...prev, [code]: value }));
  };

  const filteredContainerFacs = useMemo(() => {
    if (!facSearch) return containerFactories;
    return containerFactories.map(cf => ({
      ...cf,
      codes: cf.codes.filter(c =>
        c.includes(facSearch) || (localFac[c] ?? "").includes(facSearch)
      )
    })).filter(cf => cf.codes.length > 0 || cf.cont.includes(facSearch));
  }, [containerFactories, facSearch, localFac]);

  return (
    <div className="space-y-4">
      <ToastContainer />

      {showClear && (
        <ConfirmModal
          title="حذف كل البيانات"
          message="سيتم حذف جميع المنتجات والفترات والإعدادات. لا يمكن التراجع."
          confirmLabel="احذف كل شيء"
          onConfirm={async () => { await onClearAll(); setShowClear(false); show("تم الحذف"); }}
          onCancel={() => setShowClear(false)}
        />
      )}

      {/* الإعدادات العامة */}
      <Card>
        <SectionHeader icon="🏪" title="الإعدادات العامة" />

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">اسم العلامة التجارية</label>
            <input
              value={brandName}
              onChange={e => setBrandName(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">الحد الأدنى للمخزون (وحدة)</label>
            <input
              type="number"
              value={minStock}
              onChange={e => setMinStock(Math.max(1, parseInt(e.target.value) || 12))}
              className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <Btn color="green" onClick={handleSave} className="w-full mt-3">💾 حفظ الإعدادات</Btn>
      </Card>

      {/* إحصاءات */}
      <Card>
        <SectionHeader icon="📊" title="إحصاءات النظام" />
        <div className="grid grid-cols-3 gap-2">
          <StatPill label="المنتجات" value={fmtN(products.length)} color="text-blue-400" />
          <StatPill label="الفترات"  value={fmtN(periods.length)}  color="text-amber-400" />
          <StatPill label="الكونتينرات" value={fmtN(allContainers(products).length)} color="text-emerald-400" />
        </div>
      </Card>

      {/* رفع صور مجمّع */}
      <Card>
        <SectionHeader icon="📷" title="رفع صور مجمّعة" subtitle="أسماء الملفات = الباركود" />
        <div className="text-xs text-slate-500 bg-slate-700/50 rounded-xl p-3 mb-3 space-y-1">
          <div>📌 سمّي كل صورة بنفس الباركود</div>
          <div className="text-slate-600">مثال: 26052611B001.jpg</div>
          <div className="text-slate-600">يدعم: jpg, jpeg, png, webp</div>
        </div>

      {/* قراءة الباركود تلقائياً من الصورة */}
      <Card>
        <SectionHeader icon="🤖" title="قراءة الباركود من الصورة" subtitle="Gemini يقرأ الباركود تلقائياً" />
        <div className="text-xs text-slate-500 bg-slate-700/50 rounded-xl p-3 mb-3">
          ارفع صورة منتج أو كرتون — سيقرأ الباركود ويربط الصورة بالمنتج تلقائياً
        </div>
        <SmartScanUpload products={products} onBulkSaveImage={onBulkSaveImage} />
      </Card>

        <label className="w-full border-2 border-dashed border-slate-600 hover:border-blue-500 rounded-2xl p-5 flex flex-col items-center gap-2 cursor-pointer transition-colors">
          <span className="text-3xl">🖼️</span>
          <span className="text-slate-300 font-bold text-sm">اختر صور متعددة</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length === 0) return;

              let success = 0, failed = 0, notFound = 0;
              setBulkStatus({ loading: true, done: false, success: 0, failed: 0, notFound: 0, total: files.length, current: 0 });

              for (let i = 0; i < files.length; i++) {
                const file = files[i];
                setBulkStatus(p => ({ ...p, current: i + 1 }));

                // استخراج الباركود من اسم الملف
                const barcode = file.name.replace(/\.[^.]+$/, "").trim();

                // ضغط الصورة
                try {
                  const compressed = await new Promise((resolve, reject) => {
                    const img = new Image();
                    const url = URL.createObjectURL(file);
                    img.onload = () => {
                      URL.revokeObjectURL(url);
                      const MAX = 400;
                      let { width, height } = img;
                      if (width > MAX || height > MAX) {
                        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
                        else { width = Math.round(width * MAX / height); height = MAX; }
                      }
                      const canvas = document.createElement("canvas");
                      canvas.width = width; canvas.height = height;
                      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
                      resolve(canvas.toDataURL("image/jpeg", 0.75));
                    };
                    img.onerror = reject;
                    img.src = url;
                  });

                  const result = await onSaveSettings && onBulkSaveImage?.(barcode, compressed);
                  if (result?.ok) success++;
                  else { failed++; }
                } catch {
                  failed++;
                }
              }

              setBulkStatus({ loading: false, done: true, success, failed, notFound, total: files.length, current: files.length });
              e.target.value = "";
            }}
          />
        </label>

        {bulkStatus.loading && (
          <div className="mt-3 space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>جاري المعالجة…</span>
              <span>{bulkStatus.current} / {bulkStatus.total}</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${bulkStatus.total > 0 ? (bulkStatus.current/bulkStatus.total)*100 : 0}%` }} />
            </div>
          </div>
        )}

        {bulkStatus.done && (
          <div className="mt-3 bg-slate-900 rounded-xl p-3 space-y-1">
            <div className="text-xs text-emerald-400">✅ تم: {bulkStatus.success} صورة</div>
            {bulkStatus.failed > 0 && <div className="text-xs text-red-400">❌ فشل: {bulkStatus.failed}</div>}
          </div>
        )}
      </Card>

      {/* المصانع */}
      {containerFactories.length > 0 && (
        <Card>
          <SectionHeader icon="🏭" title="أسماء المصانع" subtitle="مجمّعة تحت الكونتينر" />

          <input
            value={facSearch}
            onChange={e => setFacSearch(e.target.value)}
            placeholder="🔍 بحث بالكود أو الاسم…"
            className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500 mb-3"
          />

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredContainerFacs.map(({ cont, codes }) => (
              <div key={cont} className="bg-slate-700/50 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-slate-600">
                  <span className="text-base">📦</span>
                  <div className="font-black text-slate-100 text-sm">{cont}</div>
                  <div className="text-xs text-slate-500 mr-auto">{codes.length} مصنع</div>
                </div>
                <div className="space-y-2">
                  {codes.map(code => {
                    const count = products.filter(p => getFactoryCode(p.barcode) === code && p.container === cont).length;
                    return (
                      <div key={code} className="bg-slate-800 rounded-xl p-2">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="bg-blue-900/60 text-blue-300 font-mono text-xs px-2 py-0.5 rounded-lg">{code}</span>
                          <span className="text-xs text-slate-500">{count} منتج</span>
                        </div>
                        <input
                          value={localFac[code] ?? ""}
                          onChange={e => handleFacChange(code, e.target.value)}
                          onBlur={handleSave}
                          placeholder="اكتب اسم المصنع…"
                          className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <Btn color="green" onClick={handleSave} className="w-full mt-3">💾 حفظ الكل</Btn>
        </Card>
      )}

      {/* حذف */}
      <Card>
        <SectionHeader icon="⚠️" title="خطر" />
        <Btn color="red" onClick={() => setShowClear(true)} className="w-full">
          🗑️ حذف كل البيانات
        </Btn>
      </Card>
    </div>
  );
}
