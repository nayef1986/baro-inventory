// ============================================================
// Settings.jsx — الإعدادات
// ============================================================

import { useState, useMemo, memo } from "react";
import {
  Card, Btn, StatPill, EmptyState, SectionHeader,
  ConfirmModal, useToast, fmtN,
} from "../components/UI.jsx";
import { allContainers, allFactoryCodes, getFactoryCode } from "../lib/calc.js";

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
