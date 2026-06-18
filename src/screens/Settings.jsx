// ============================================================
// Settings.jsx — الإعدادات
// ============================================================

import { useState, useMemo, memo } from "react";
import {
  Card, Btn, StatPill, EmptyState, SectionHeader,
  ConfirmModal, useToast, fmtN,
} from "../components/UI.jsx";
import { allContainers, allFactoryCodes, getFactoryCode, allBranches } from "../lib/calc.js";

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
          // نحافظ على دقة كافية لقراءة الأرقام (JPEG أصغر بكثير من PNG)
          const MAX = 1200;
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
          // JPEG واضح للقراءة (أصغر من PNG، ما يرفضه الـ API) + نسخة مضغوطة للحفظ
          const pngForOcr = canvas.toDataURL("image/jpeg", 0.85);
          // نسخة صغيرة للتخزين (أقصى عرض 600 وجودة 0.6 لتكون تحت 500KB)
          const SAVE_MAX = 600;
          let sw = width, sh = height;
          if (sw > SAVE_MAX || sh > SAVE_MAX) {
            if (sw > sh) { sh = Math.round(sh * SAVE_MAX / sw); sw = SAVE_MAX; }
            else { sw = Math.round(sw * SAVE_MAX / sh); sh = SAVE_MAX; }
          }
          const c2 = document.createElement("canvas");
          c2.width = sw; c2.height = sh;
          const ctx2 = c2.getContext("2d");
          ctx2.imageSmoothingEnabled = true;
          ctx2.imageSmoothingQuality = "high";
          ctx2.drawImage(img, 0, 0, sw, sh);
          const jpegForSave = c2.toDataURL("image/jpeg", 0.6);
          resolve({ ocr: pngForOcr, save: jpegForSave });
        };
        img.onerror = reject;
        img.src = url;
      });

      try {
        // نرسل النسخة الواضحة لـ Gemini للقراءة — مع إعادة محاولة لو فشل
        let data = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          const response = await fetch("/api/scan-barcode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: base64.ocr }),
          });
          data = await response.json();
          // لو لقى أكواد، نوقف. لو فاضي، ننتظر ونعيد مرة وحدة
          const found = data.candidates?.length || data.barcode;
          if (found) break;
          if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
        }

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
            await onBulkSaveImage(matched.barcode, base64.save);
          }
          newResults.push({ file: file.name, barcode: matched.barcode, product: matched.name, status: "success" });
        } else if (candidates.length > 0) {
          // قرأ كوداً لكن ما طابق منتجاً — نعرضه ليطابقه المستخدم يدوياً
          newResults.push({ file: file.name, barcode: candidates[0], product: null, status: "not_found" });
        } else {
          newResults.push({ file: file.name, barcode: null, product: null, status: "no_barcode", message: data.message, debug: data.debug });
        }
      } catch (e) {
        newResults.push({ file: file.name, barcode: null, product: null, status: "error", message: e.message });
      }

      setResults([...newResults]);

      // تأخير بسيط بين الصور حتى ما نضغط على Gemini (يمنع رفض الباقي)
      await new Promise(r => setTimeout(r, 1500));
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
              {r.debug && <div className="text-slate-500 mt-0.5 text-[10px] break-all">خطأ: {r.debug.lastErr} · رد: {r.debug.geminiText}</div>}
              {r.status === "error" && <div className="text-red-400 mt-0.5">❌ خطأ: {r.message}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsScreen({ products, periods, settings, onSaveSettings, onClearAll, onBulkSaveImage, onUpdateProducts }) {
  const [brandName, setBrandName] = useState(settings?.brandName ?? "البارو");
  const [minStock,  setMinStock]  = useState(settings?.minStock ?? 12);
  const [localFac,  setLocalFac]  = useState({ ...settings?.factories ?? {} });
  const [closedBranches, setClosedBranches] = useState(settings?.closedBranches ?? []);
  const [newBranches, setNewBranches] = useState(settings?.newBranches ?? []);
  // حذف منتج محمي برقم سري
  const [delSearch, setDelSearch]   = useState("");
  const [delPin,    setDelPin]      = useState("");
  const [delTarget, setDelTarget]   = useState(null);
  const [delSelected, setDelSelected] = useState([]);
  const [showDelConfirm, setShowDelConfirm] = useState(false);
  const [newPin,    setNewPin]      = useState("");
  const SECRET = settings?.deletePin ?? "0000";
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
    const ok = await onSaveSettings({ ...settings, brandName, minStock, factories: localFac, closedBranches, newBranches });
    if (ok) show("تم الحفظ ✓"); else show("فشل الحفظ", "error");
  };

  const branches = useMemo(() => allBranches(periods), [periods]);
  const toggleBranch = (b) => {
    setClosedBranches(prev => prev.includes(b) ? prev.filter(x=>x!==b) : [...prev, b]);
  };
  const toggleNewBranch = (b) => {
    setNewBranches(prev => prev.includes(b) ? prev.filter(x=>x!==b) : [...prev, b]);
  };

  // نتائج بحث الحذف
  const delResults = useMemo(() => {
    if (!delSearch || delPin !== SECRET) return [];
    const s = delSearch.toLowerCase();
    return products.filter(p =>
      p.barcode?.toLowerCase().includes(s) || getFactoryCode(p.barcode).includes(s) ||
      (p.name && p.name.toLowerCase().includes(s))
    ).slice(0, 20);
  }, [delSearch, delPin, products, SECRET]);

  const confirmDelete = async () => {
    if (delSelected.length === 0 || !onUpdateProducts) return;
    const sel = new Set(delSelected);
    const updated = products.filter(p => !sel.has(p.barcode));
    await onUpdateProducts(updated);
    show(`تم حذف ${delSelected.length} منتج`, "success");
    setDelSelected([]);
    setShowDelConfirm(false);
    setDelSearch("");
  };

  const toggleSelect = (barcode) => {
    setDelSelected(prev => prev.includes(barcode) ? prev.filter(b=>b!==barcode) : [...prev, barcode]);
  };

  const changePin = async () => {
    if (delPin !== SECRET) { show("الرقم الحالي غير صحيح", "error"); return; }
    if (!newPin || newPin.length < 4) { show("الرقم الجديد 4 خانات على الأقل", "error"); return; }
    const ok = await onSaveSettings({ ...settings, brandName, minStock, factories: localFac, closedBranches, newBranches, deletePin: newPin });
    if (ok) { show("تم تغيير الرقم السري ✓"); setNewPin(""); setDelPin(newPin); }
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

      {/* الفروع — فتح/غلق (المغلق يختفي من الطباعة) */}
      {branches.length > 0 && (
        <Card>
          <SectionHeader icon="🏪" title="الفروع" subtitle="الفرع المغلق لا يظهر في تقارير الطباعة" />
          <div className="space-y-2">
            {branches.map(b => {
              const isClosed = closedBranches.includes(b);
              return (
                <div key={b} className="flex items-center justify-between bg-slate-700/40 rounded-xl px-3 py-2.5">
                  <span className={`text-sm font-bold ${isClosed ? "text-slate-500 line-through" : "text-slate-100"}`}>{b}</span>
                  <button onClick={()=>{ toggleBranch(b); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${isClosed ? "bg-red-900/40 text-red-300" : "bg-emerald-900/40 text-emerald-300"}`}>
                    {isClosed ? "🔴 مغلق" : "🟢 مفتوح"}
                  </button>
                </div>
              );
            })}
          </div>
          <Btn color="green" onClick={handleSave} className="w-full mt-3">💾 حفظ حالة الفروع</Btn>
        </Card>
      )}

      {/* الفروع الجديدة — تُستثنى من الراكد والسحب في النقل */}
      {branches.length > 0 && (
        <Card>
          <SectionHeader icon="🆕" title="الفروع الجديدة" subtitle="الفرع الجديد لا يُحسب راكداً ولا يُسحب منه — يستقبل فقط" />
          <div className="text-xs text-slate-500 bg-slate-700/50 rounded-xl p-3 mb-3">
            🆕 الفرع الجديد مبيعاته قليلة طبيعياً (لسه بادئ). فعّله هنا حتى لا يظهر "راكد" ولا يسحب منه النقل الذكي — بس يستقبل البضاعة ويتعبّى.
          </div>
          <div className="space-y-2">
            {branches.map(b => {
              const isNew = newBranches.includes(b);
              return (
                <div key={b} className="flex items-center justify-between bg-slate-700/40 rounded-xl px-3 py-2.5">
                  <span className={`text-sm font-bold ${isNew ? "text-amber-300" : "text-slate-100"}`}>{isNew ? "🆕 " : ""}{b}</span>
                  <button onClick={()=>{ toggleNewBranch(b); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${isNew ? "bg-amber-900/40 text-amber-300" : "bg-slate-600/40 text-slate-400"}`}>
                    {isNew ? "🆕 جديد" : "عادي"}
                  </button>
                </div>
              );
            })}
          </div>
          <Btn color="green" onClick={handleSave} className="w-full mt-3">💾 حفظ الفروع الجديدة</Btn>
        </Card>
      )}

      {/* أداة استخراج الصور من Excel */}
      <Card>
        <SectionHeader icon="📷" title="استخراج صور من Excel" subtitle="ترفع ملف الفاتورة بالصور · تربط تلقائياً" />
        <div className="text-xs text-slate-500 bg-slate-700/50 rounded-xl p-3 mb-3">
          ترفع ملف Excel (نفس فاتورة المشتريات + عمود الصور)، تستخرج الصور وتربطها بالباركود تلقائياً
        </div>
        <a href="https://baro-inventory-qmpp.vercel.app/image-extractor.html" target="_blank" rel="noopener noreferrer"
          className="block w-full text-center bg-purple-600 hover:bg-purple-500 text-white py-3 rounded-xl font-bold text-sm">
          📷 افتح أداة استخراج الصور
        </a>
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

      {/* 🔒 حذف منتج (محمي برقم سري) */}
      <Card>
        <SectionHeader icon="🔒" title="حذف منتج" subtitle="محمي برقم سري — للأشياء الشخصية والأخطاء" />

        {/* الرقم السري */}
        <div className="mb-3">
          <label className="text-xs text-slate-400 block mb-1">الرقم السري</label>
          <input type="password" value={delPin} onChange={e=>setDelPin(e.target.value)} placeholder="••••"
            className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm text-center tracking-widest focus:outline-none focus:border-blue-500" />
        </div>

        {delPin === SECRET ? (
          <>
            {/* بحث المنتج */}
            <input value={delSearch} onChange={e=>setDelSearch(e.target.value)} placeholder="🔍 ابحث بالاسم أو الباركود…"
              className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 mb-2" />

            {delSearch && (
              <div className="space-y-2 mb-3">
                {delResults.length === 0 ? (
                  <div className="text-center text-slate-500 text-sm py-3">لا نتائج</div>
                ) : delResults.map(p => {
                  const sel = delSelected.includes(p.barcode);
                  return (
                    <div key={p.barcode} onClick={()=>toggleSelect(p.barcode)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer ${sel ? "bg-red-900/30 border border-red-700/40" : "bg-slate-700/40 border border-transparent"}`}>
                      <span className={`w-5 h-5 rounded flex items-center justify-center text-xs shrink-0 ${sel ? "bg-red-500 text-white" : "bg-slate-600 text-transparent"}`}>✓</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-slate-100 truncate">{p.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{p.barcode}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* زر حذف المحدد */}
            {delSelected.length > 0 && (
              <button onClick={()=>setShowDelConfirm(true)}
                className="w-full bg-red-600 text-white py-3 rounded-xl text-sm font-black mb-3">
                🗑️ احذف المحدد ({delSelected.length})
              </button>
            )}

            {/* تغيير الرقم السري */}
            <div className="border-t border-slate-700 pt-3 mt-3">
              <label className="text-xs text-slate-400 block mb-1">تغيير الرقم السري</label>
              <div className="flex gap-2">
                <input type="text" value={newPin} onChange={e=>setNewPin(e.target.value)} placeholder="رقم جديد (4 خانات)"
                  className="flex-1 bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                <button onClick={changePin} className="bg-blue-600 text-white px-4 rounded-xl text-sm font-bold">حفظ</button>
              </div>
            </div>
          </>
        ) : (
          delPin && <div className="text-xs text-red-400 text-center py-2">الرقم السري غير صحيح</div>
        )}
      </Card>

      {/* تأكيد حذف المنتجات المحددة */}
      {showDelConfirm && (
        <ConfirmModal
          title="حذف منتجات نهائياً"
          message={`سيُحذف ${delSelected.length} منتج من كل النظام. لا يمكن التراجع.`}
          confirmLabel="احذف الكل"
          confirmColor="red"
          onConfirm={confirmDelete}
          onCancel={()=>setShowDelConfirm(false)}
        />
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
