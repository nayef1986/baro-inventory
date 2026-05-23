// ============================================================
// Compare.jsx — شاشة المقارنة
// ============================================================

import { useState, useMemo, memo } from "react";
import {
  Card, Btn, StatPill, EmptyState, ExportBar,
  FilterChips, SearchBar, SectionHeader,
  useToast, fmtN, fmtM, fmtPct,
} from "../components/UI.jsx";
import { comparePeriods, allBranches, arabicIncludes } from "../lib/calc.js";
import { ProductImage } from "../components/ProductImage.jsx";
import { exportTrendReport, printTrendReport } from "../lib/exporters.js";

export default function CompareScreen({ products, periods, settings, images, onSaveImage, onRemoveImage }) {
  const [mode,     setMode]     = useState("periods"); // periods | branches
  const [periodA,  setPeriodA]  = useState(periods.length >= 2 ? periods[periods.length - 2].id : "");
  const [periodB,  setPeriodB]  = useState(periods.length >= 1 ? periods[periods.length - 1].id  : "");
  const [trendFilter, setTrendFilter] = useState("all");
  const [sortBy,   setSortBy]   = useState("diff");
  const [search,   setSearch]   = useState("");
  const { show, ToastContainer } = useToast();

  const pA = periods.find(p => p.id === periodA) ?? null;
  const pB = periods.find(p => p.id === periodB) ?? null;

  const rows = useMemo(() => {
    if (!pA || !pB) return [];
    return comparePeriods(products, pA, pB);
  }, [products, pA, pB]);

  const filtered = useMemo(() => {
    let list = rows;
    if (trendFilter !== "all") list = list.filter(r => r.trend === trendFilter);
    if (search) list = list.filter(r => arabicIncludes(r.name, search) || r.barcode.includes(search));
    if (sortBy === "diff")  list = [...list].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    if (sortBy === "soldB") list = [...list].sort((a, b) => b.soldB - a.soldB);
    return list;
  }, [rows, trendFilter, search, sortBy]);

  const rising  = rows.filter(r => r.trend === "صاعد").length;
  const falling = rows.filter(r => r.trend === "هابط").length;
  const stable  = rows.filter(r => r.trend === "ثابت").length;
  const newP    = rows.filter(r => r.soldA === 0 && r.soldB > 0).length;

  const TREND_ICON = { صاعد: "📈", هابط: "📉", ثابت: "➡️", جديد: "⭐" };
  const TREND_COLOR = { صاعد: "text-emerald-400", هابط: "text-red-400", ثابت: "text-slate-400", جديد: "text-blue-400" };

  if (periods.length < 2) {
    return <EmptyState icon="⚖️" title="تحتاج فترتين على الأقل" subtitle="ارفع ملفين مبيعات للمقارنة" />;
  }

  return (
    <div className="space-y-4">
      <ToastContainer />

      {/* اختيار الفترات */}
      <Card>
        <SectionHeader icon="⚖️" title="مقارنة فترتين" />
        <div className="space-y-2">
          <div>
            <label className="text-xs text-slate-400 block mb-1">الفترة أ</label>
            <select value={periodA} onChange={e => setPeriodA(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
              {[...periods].reverse().map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">الفترة ب</label>
            <select value={periodB} onChange={e => setPeriodB(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
              {[...periods].reverse().map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* النتائج */}
      {pA && pB && pA.id !== pB.id && (
        <>
          <Card>
            <div className="grid grid-cols-4 gap-2 mb-3">
              <StatPill label="📈 صاعد" value={fmtN(rising)}  color="text-emerald-400" />
              <StatPill label="📉 هابط" value={fmtN(falling)} color="text-red-400" />
              <StatPill label="➡️ ثابت" value={fmtN(stable)}  color="text-slate-400" />
              <StatPill label="⭐ جديد" value={fmtN(newP)}    color="text-blue-400" />
            </div>
            <ExportBar
              onExcel={() => {
                const r = exportTrendReport(filtered, pA.label, pB.label);
                if (!r.ok) show(r.error, "error"); else show("تم التصدير ✓");
              }}
              onPrint={() => {
                const r = printTrendReport(filtered, pA.label, pB.label, settings?.brandName);
                if (!r.ok) show(r.error, "error");
              }}
            />
          </Card>

          <div className="space-y-2">
            <SearchBar value={search} onChange={e => setSearch(e.target.value)} />
            <FilterChips
              options={[
                { key: "all",  label: "الكل" },
                { key: "صاعد", label: `📈 صاعد (${rising})` },
                { key: "هابط", label: `📉 هابط (${falling})` },
                { key: "ثابت", label: `➡️ ثابت (${stable})` },
              ]}
              active={trendFilter} onChange={setTrendFilter}
            />
            <FilterChips
              label="ترتيب:"
              options={[{ key: "diff", label: "أكبر فرق" }, { key: "soldB", label: "الأكثر مبيعاً" }]}
              active={sortBy} onChange={setSortBy}
            />
            <div className="text-xs text-slate-500">{filtered.length} منتج</div>
          </div>

          <div className="space-y-2">
            {filtered.map(r => (
              <Card key={r.barcode} className="!p-3">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-100 text-sm">{r.name}</div>
                    <div className="text-xs text-slate-400 font-mono">{r.barcode}</div>
                    <div className="text-xs text-blue-400">📦 {r.container}</div>
                  </div>
                  <div className="text-center shrink-0 mr-2">
                    <div className="text-2xl">{TREND_ICON[r.trend] ?? "➡️"}</div>
                    <div className={`text-sm font-black tabular-nums ${TREND_COLOR[r.trend] ?? "text-slate-400"}`}>
                      {r.diff > 0 ? "+" : ""}{fmtN(r.diff)}
                    </div>
                    {r.diffPct != null && (
                      <div className={`text-xs tabular-nums ${TREND_COLOR[r.trend] ?? "text-slate-400"}`}>
                        {r.diff > 0 ? "+" : ""}{fmtPct(r.diffPct)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-700 rounded-xl p-2 text-center">
                    <div className="text-xs text-slate-400 truncate mb-1">{pA.label}</div>
                    <div className="text-lg font-black text-blue-400 tabular-nums">{fmtN(r.soldA)}</div>
                    <div className="text-xs text-emerald-400">{fmtM(r.revenueA)}</div>
                  </div>
                  <div className="bg-blue-900/30 border border-blue-800/40 rounded-xl p-2 text-center">
                    <div className="text-xs text-blue-300 truncate mb-1">{pB.label}</div>
                    <div className="text-lg font-black text-blue-300 tabular-nums">{fmtN(r.soldB)}</div>
                    <div className="text-xs text-emerald-400">{fmtM(r.revenueB)}</div>
                  </div>
                </div>
              </Card>
            ))}
            {filtered.length === 0 && <EmptyState icon="📭" title="لا توجد نتائج" />}
          </div>
        </>
      )}

      {pA && pB && pA.id === pB.id && (
        <EmptyState icon="⚠️" title="اختر فترتين مختلفتين" />
      )}
    </div>
  );
}
