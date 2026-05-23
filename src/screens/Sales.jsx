// ============================================================
// Sales.jsx — شاشة المبيعات
// ============================================================

import { useState, memo } from "react";
import {
  Card, Btn, StatPill, EmptyState, SectionHeader,
  ConfirmModal, useToast, fmtN, fmtM,
} from "../components/UI.jsx";
import { parseSalesFile } from "../lib/parsers.js";

export default function SalesScreen({ periods, onAddPeriod, onDeletePeriod }) {
  const [loading,      setLoading]      = useState(false);
  const [label,        setLabel]        = useState("");
  const [log,          setLog]          = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
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

      const result = await onAddPeriod(period);

      if (!result.ok) {
        if (result.reason?.includes("مرفوعة") || result.reason?.includes("مكرر")) {
          setLog(p => [...p, { type: "warning", text: `⚠️ ${result.reason}` }]);
          show(result.reason, "warning");
        } else {
          setLog(p => [...p, { type: "error", text: `فشل الحفظ: ${result.reason}` }]);
        }
      } else {
        const branchCount = Object.keys(period.sales ?? {}).length;
        const totalSold   = Object.values(period.sales ?? {}).reduce((s, d) =>
          s + Object.values(d).reduce((ss, v) => ss + (v.qty || 0), 0), 0);

        setLog(p => [...p,
          { type: "success", text: `✅ تم حفظ الفترة "${period.label}"` },
          { type: "info",    text: `${branchCount} فرع · ${fmtN(totalSold)} وحدة مباعة` },
        ]);
        show(`✅ تم حفظ "${period.label}"`);
        setLabel("");
      }
    } catch (err) {
      setLog(p => [...p, { type: "error", text: `خطأ: ${err.message}` }]);
    }

    setLoading(false);
    e.target.value = "";
  };

  const LOG_COLORS = {
    success: "text-emerald-400",
    error:   "text-red-400",
    warning: "text-amber-400",
    info:    "text-blue-400",
  };

  return (
    <div className="space-y-4">
      <ToastContainer />

      {deleteTarget && (
        <ConfirmModal
          title="حذف الفترة"
          message={`هل تريد حذف فترة "${deleteTarget.label}"؟ لا يمكن التراجع.`}
          onConfirm={async () => {
            await onDeletePeriod(deleteTarget.id);
            setDeleteTarget(null);
            show("تم الحذف");
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* رفع */}
      <Card>
        <SectionHeader icon="📊" title="رفع ملف مبيعات" />

        <div className="text-xs text-slate-500 space-y-0.5 mb-3 bg-slate-700/50 rounded-xl p-3">
          <div>📌 صف 2: أسماء الفروع (كل فرع 4 أعمدة)</div>
          <div>📌 صف 5+: [باركود] اسم المنتج</div>
          <div className="text-slate-600">الأعمدة: طلبات | كمية | إجمالي | cost</div>
        </div>

        {/* تسمية */}
        <div className="mb-3">
          <label className="text-xs text-slate-400 block mb-1">تسمية الفترة (اختياري)</label>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder={`أسبوع ${today}`}
            className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
          />
        </div>

        <label className={`w-full border-2 border-dashed rounded-2xl p-6 flex flex-col items-center gap-2
          cursor-pointer transition-colors ${loading ? "border-blue-500 bg-blue-900/10" : "border-slate-600 hover:border-blue-500"}`}>
          <span className="text-4xl">{loading ? "⏳" : "📊"}</span>
          <span className="text-slate-300 font-bold text-sm">{loading ? "جاري المعالجة…" : "اسحب ملف المبيعات هنا"}</span>
          <span className="text-slate-500 text-xs">Excel (.xlsx) — تقرير المبيعات</span>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} disabled={loading} className="hidden" />
          {!loading && (
            <span className="bg-green-600 text-white px-6 py-2 rounded-xl font-bold text-sm">اختر ملف</span>
          )}
        </label>

        {log.length > 0 && (
          <div className="mt-3 bg-slate-900 rounded-xl p-3 space-y-1 max-h-32 overflow-y-auto">
            {log.map((l, i) => (
              <div key={i} className={`text-xs ${LOG_COLORS[l.type] ?? "text-slate-400"}`}>{l.text}</div>
            ))}
          </div>
        )}
      </Card>

      {/* الفترات */}
      {periods.length > 0 && (
        <div>
          <SectionHeader icon="📅" title="الفترات المحفوظة" subtitle={`${periods.length} فترة · الأحدث أولاً`} />
          <div className="space-y-3">
            {[...periods].reverse().map(period => {
              const branchCount = Object.keys(period.sales ?? {}).length;
              const totalSold   = Object.values(period.sales ?? {}).reduce((s, d) =>
                s + Object.values(d).reduce((ss, v) => ss + (v.qty || 0), 0), 0);
              const totalRev = Object.values(period.sales ?? {}).reduce((s, d) =>
                s + Object.values(d).reduce((ss, v) => ss + (v.totalPrice || 0), 0), 0);

              const branches = Object.keys(period.sales ?? {});

              return (
                <Card key={period.id}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-black text-slate-100 text-base">{period.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        📅 {period.uploadDate} · {branchCount} فرع نشط
                      </div>
                    </div>
                    <button
                      onClick={() => setDeleteTarget(period)}
                      className="text-slate-500 hover:text-red-400 text-xl w-8 h-8 flex items-center justify-center"
                    >✕</button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <StatPill label="إجمالي إيرادات" value={fmtM(totalRev)}   color="text-emerald-400" />
                    <StatPill label="إجمالي مباع"    value={fmtN(totalSold)}  color="text-amber-400" />
                  </div>

                  {/* الفروع */}
                  <div className="flex flex-wrap gap-1.5">
                    {branches.slice(0, 5).map(b => (
                      <span key={b} className="bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded-lg">{b}</span>
                    ))}
                    {branches.length > 5 && (
                      <span className="bg-blue-900/50 text-blue-300 text-xs px-2 py-1 rounded-lg font-bold">
                        {branches.length - 5}+
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {periods.length === 0 && (
        <EmptyState icon="📊" title="لا توجد فترات مبيعات" subtitle="ارفع ملف مبيعات للبدء" />
      )}
    </div>
  );
}
