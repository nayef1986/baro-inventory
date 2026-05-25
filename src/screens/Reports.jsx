// ============================================================
// Reports.jsx — شاشة التقارير
// ============================================================

import { useState, useMemo, memo } from "react";
import {
  Card, Btn, StatPill, EmptyState, ExportBar,
  FilterChips, SearchBar, SectionHeader, BackBtn,
  NumberInput, useToast, fmtN, fmtM, fmtPct,
} from "../components/UI.jsx";
import { ProductImage } from "../components/ProductImage.jsx";
import {
  factoryReport, containerSummary, allContainers,
  allFactoryCodes, getFactoryCode, arabicIncludes,
  comparePeriods, num,
} from "../lib/calc.js";
import {
  exportFactoryReport, printContainerReport,
  exportContainerReport, exportTrendReport, printTrendReport,
} from "../lib/exporters.js";

// ─── تقرير المصنع ────────────────────────────────────────────

const FactoryReportView = memo(({ products, periods, settings, images, onSaveImage, onRemoveImage, onBack }) => {
  const [selectedFactory, setSelectedFactory] = useState("");
  const [threshold,       setThreshold]       = useState(60);
  const [search,          setSearch]          = useState("");
  const [openCont,        setOpenCont]        = useState({});
  const [productSearch,   setProductSearch]   = useState("");
  const { show, ToastContainer } = useToast();

  const containerFactories = useMemo(() => {
    const containers = allContainers(products);
    return containers.map(cont => {
      const contProds = products.filter(p => p.container === cont);
      const codes = [...new Set(contProds.map(p => getFactoryCode(p.barcode)).filter(Boolean))].sort();
      return { cont, codes };
    }).filter(c => c.codes.length > 0);
  }, [products]);

  // فلترة بالبحث
  const filteredContainers = useMemo(() => {
    if (!search) return containerFactories;
    const s = search.toLowerCase();
    return containerFactories.map(({ cont, codes }) => ({
      cont,
      codes: codes.filter(code =>
        code.toLowerCase().includes(s) ||
        (settings?.factories?.[code] ?? "").toLowerCase().includes(s) ||
        cont.toLowerCase().includes(s)
      )
    })).filter(c => c.codes.length > 0);
  }, [containerFactories, search, settings]);

  const report = useMemo(() => {
    if (!selectedFactory) return null;
    return factoryReport(products, periods, selectedFactory);
  }, [products, periods, selectedFactory]);

  const factoryName = settings?.factories?.[selectedFactory] ?? "";

  const filteredProducts = useMemo(() => {
    if (!report) return [];
    let list = [...report.products].sort((a,b) => b.soldPct - a.soldPct);
    if (productSearch) {
      const s = productSearch.toLowerCase();
      list = list.filter(p => p.barcode.toLowerCase().includes(s) || p.name.toLowerCase().includes(s));
    }
    return list;
  }, [report, productSearch]);

  const STATUS_COLOR = { جيد: "text-emerald-400", منخفض: "text-amber-400", نفد: "text-red-400" };

  return (
    <div className="space-y-4">
      <ToastContainer />
      <BackBtn onClick={onBack} />

      <Card>
        <SectionHeader icon="🏭" title="تقرير المصنع" />

        {/* بحث */}
        <div className="relative mb-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 بحث برقم أو اسم المصنع…"
            className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
          />
          {search && <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400 text-sm">✕</button>}
        </div>

        {/* كونتينرات قابلة للطي */}
        <div className="space-y-2">
          {filteredContainers.map(({ cont, codes }) => (
            <div key={cont} className="bg-slate-700/30 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenCont(p => ({ ...p, [cont]: !p[cont] }))}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-blue-400 text-xs font-bold">📦 {cont}</span>
                  <span className="text-slate-500 text-xs">({codes.length} مصنع)</span>
                </div>
                <span className="text-slate-400 text-sm">{openCont[cont] ? "▲" : "▼"}</span>
              </button>
              {(openCont[cont] || search) && (
                <div className="grid grid-cols-2 gap-1.5 px-3 pb-3">
                  {codes.map(code => (
                    <button key={code}
                      onClick={() => { setSelectedFactory(code); setProductSearch(""); }}
                      className={`text-right px-3 py-2 rounded-xl text-xs transition-colors
                        ${selectedFactory === code ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>
                      <div className="font-bold font-mono">{code}</div>
                      {settings?.factories?.[code] && <div className="text-slate-400 truncate">{settings.factories[code]}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {selectedFactory && (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs text-slate-400">نسبة النجاح:</span>
            <NumberInput value={threshold} onChange={setThreshold} min={0} max={100} className="w-16" />
            <span className="text-xs text-slate-400">%</span>
          </div>
        )}
      </Card>

      {report && (
        <>
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-black text-slate-100 text-lg">{selectedFactory}</div>
                {factoryName && <div className="text-xs text-slate-400">{factoryName}</div>}
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-blue-400">{report.productCount}</div>
                <div className="text-xs text-slate-500">منتج</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <StatPill label={`✓ ناجح ≥${threshold}%`} value={fmtN(report.successful.length)} color="text-emerald-400" />
              <StatPill label={`✗ ضعيف <${threshold}%`} value={fmtN(report.weak.length)}       color="text-red-400" />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <button onClick={() => {
                const r = exportFactoryReport(report, factoryName, threshold);
                if (!r.ok) show(r.error, "error"); else show("تم التصدير ✓");
              }} className="flex flex-col items-center gap-1 bg-emerald-700 hover:bg-emerald-600 text-white py-3 rounded-2xl font-black transition-colors">
                <span className="text-2xl">📊</span><span className="text-sm">Excel</span>
              </button>
              <button onClick={() => show("الطباعة قريباً", "info")}
                className="flex flex-col items-center gap-1 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 py-3 rounded-2xl font-black transition-colors">
                <span className="text-2xl">🖨️</span><span className="text-sm">طباعة</span>
              </button>
            </div>
          </Card>

          {/* بحث في المنتجات */}
          <div className="relative">
            <input
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder="🔍 بحث بالباركود أو اسم المنتج…"
              className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
            />
            {productSearch && <button onClick={() => setProductSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400 text-sm">✕</button>}
          </div>

          <div className="space-y-2">
            {filteredProducts.map(p => (
              <Card key={p.barcode} className="!p-3">
                <div className="flex items-start gap-3 mb-2">
                  <ProductImage barcode={p.barcode} images={images} onSave={onSaveImage} onRemove={onRemoveImage} size="md" name={p.name} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-100 text-sm leading-tight">{p.name}</div>
                    <div className="text-xs text-slate-400 font-mono">{p.barcode}</div>
                    <div className="text-xs text-blue-400">📦 {p.container}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-xl font-black tabular-nums ${p.soldPct >= threshold ? "text-emerald-400" : "text-red-400"}`}>
                      {fmtPct(p.soldPct)}
                    </div>
                    <div className={`text-xs font-bold ${STATUS_COLOR[p.status] ?? "text-slate-400"}`}>{p.status}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <StatPill label="مشتريات" value={fmtN(p.bought)}  color="text-blue-400" />
                  <StatPill label="مباع"    value={fmtN(p.sold)}    color="text-amber-400" />
                  <StatPill label="متبقي"   value={fmtN(p.closing)} color={p.closing === 0 ? "text-red-400" : "text-slate-300"} />
                </div>
              </Card>
            ))}
            {filteredProducts.length === 0 && report && (
              <div className="text-center text-slate-500 text-sm py-4">لا توجد نتائج</div>
            )}
          </div>
        </>
      )}
    </div>
  );
});

// ─── تقرير الترند ────────────────────────────────────────────

const TrendReportView = memo(({ products, periods, settings, onBack }) => {
  const [trendF, setTrendF] = useState("all");
  const [sortBy, setSortBy] = useState("diff");
  const [search, setSearch] = useState("");
  const { show, ToastContainer } = useToast();

  const pA = periods[periods.length - 2] ?? null;
  const pB = periods[periods.length - 1] ?? null;

  const rows = useMemo(() => {
    if (!pA || !pB) return [];
    return comparePeriods(products, pA, pB);
  }, [products, pA, pB]);

  const filtered = useMemo(() => {
    let list = rows.filter(r => r.soldA > 0 || r.soldB > 0);
    if (search)           list = list.filter(r => arabicIncludes(r.name, search) || r.barcode.includes(search));
    if (trendF !== "all") list = list.filter(r => r.trend === trendF);
    if (sortBy === "diff")  list = [...list].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    if (sortBy === "soldB") list = [...list].sort((a, b) => b.soldB - a.soldB);
    return list;
  }, [rows, search, trendF, sortBy]);

  const rising  = rows.filter(r => r.trend === "صاعد").length;
  const falling = rows.filter(r => r.trend === "هابط").length;
  const stable  = rows.filter(r => r.trend === "ثابت").length;
  const newP    = rows.filter(r => r.soldA === 0 && r.soldB > 0).length;

  if (periods.length < 2) {
    return (
      <div className="space-y-4">
        <BackBtn onClick={onBack} />
        <EmptyState icon="📊" title="تحتاج فترتين على الأقل" subtitle="ارفع ملفين مبيعات" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ToastContainer />
      <BackBtn onClick={onBack} />

      <Card>
        <SectionHeader icon="📈" title="تقرير الترند" subtitle={`${pA?.label} → ${pB?.label}`} />
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
            { key: "صاعد", label: `📈 (${rising})` },
            { key: "هابط", label: `📉 (${falling})` },
            { key: "ثابت", label: `➡️ (${stable})` },
          ]}
          active={trendF} onChange={setTrendF}
        />
        <FilterChips
          label="ترتيب:"
          options={[{ key: "diff", label: "أكبر فرق" }, { key: "soldB", label: "الأكثر مبيعاً" }]}
          active={sortBy} onChange={setSortBy}
        />
        <div className="text-xs text-slate-500">{filtered.length} منتج</div>
      </div>

      <div className="space-y-2">
        {filtered.map(r => {
          const trendColor = r.trend === "صاعد" ? "text-emerald-400" : r.trend === "هابط" ? "text-red-400" : "text-slate-400";
          const trendIcon  = r.trend === "صاعد" ? "📈" : r.trend === "هابط" ? "📉" : "➡️";
          return (
            <Card key={r.barcode} className="!p-3">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-100 text-sm">{r.name}</div>
                  <div className="text-xs text-slate-400 font-mono">{r.barcode}</div>
                  <div className="text-xs text-blue-400">📦 {r.container}</div>
                </div>
                <div className="text-center shrink-0 mr-2">
                  <div className="text-2xl">{trendIcon}</div>
                  <div className={`text-sm font-black tabular-nums ${trendColor}`}>
                    {r.diff > 0 ? "+" : ""}{fmtN(r.diff)}
                  </div>
                  {r.diffPct != null && (
                    <div className={`text-xs ${trendColor}`}>{r.diff > 0 ? "+" : ""}{fmtPct(r.diffPct)}</div>
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
          );
        })}
        {filtered.length === 0 && <EmptyState icon="📭" title="لا توجد نتائج" />}
      </div>
    </div>
  );
});

// ─── تقرير الكونتينر ─────────────────────────────────────────

const ContainerReportView = memo(({ products, periods, settings, images, onSaveImage, onRemoveImage, onBack }) => {
  const [selected,  setSelected]  = useState(allContainers(products)[0] ?? "");
  const [threshold, setThreshold] = useState(60);
  const { show, ToastContainer } = useToast();

  const containers = useMemo(() => allContainers(products), [products]);
  const summary = useMemo(
    () => selected ? containerSummary(products, periods, selected) : null,
    [products, periods, selected]
  );

  return (
    <div className="space-y-4">
      <ToastContainer />
      <BackBtn onClick={onBack} />

      <Card>
        <SectionHeader icon="📦" title="تقرير الكونتينر" />
        <select value={selected} onChange={e => setSelected(e.target.value)}
          className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
          {containers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-slate-400">نسبة النجاح:</span>
          <NumberInput value={threshold} onChange={setThreshold} min={0} max={100} className="w-16" />
          <span className="text-xs text-slate-400">%</span>
        </div>
      </Card>

      {summary && (
        <>
          <Card>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <StatPill label="المنتجات"      value={fmtN(summary.productCount)}  color="text-blue-400" />
              <StatPill label="نسبة المبيعات" value={fmtPct(summary.soldPct)}     color="text-amber-400" />
              <StatPill label="الربح"         value={fmtM(summary.totalProfit)}   color="text-emerald-400" />
            </div>
            <ExportBar
              onExcel={() => {
                const r = exportContainerReport(summary);
                if (!r.ok) show(r.error, "error"); else show("تم التصدير ✓");
              }}
              onPrint={() => {
                const r = printContainerReport(summary, settings?.brandName, images);
                if (!r.ok) show(r.error, "error");
              }}
            />
          </Card>
        </>
      )}
    </div>
  );
});

// ─── الشاشة الرئيسية ─────────────────────────────────────────

export default function ReportsScreen({ products, periods, settings, images, onSaveImage, onRemoveImage }) {
  const [view, setView] = useState(null);

  if (view === "trend") {
    return <TrendReportView products={products} periods={periods} settings={settings} onBack={() => setView(null)} />;
  }
  if (view === "factory") {
    return <FactoryReportView products={products} periods={periods} settings={settings}
      images={images} onSaveImage={onSaveImage} onRemoveImage={onRemoveImage} onBack={() => setView(null)} />;
  }


  const ReportCard = ({ icon, title, subtitle, onClick }) => (
    <Card onClick={onClick} className="!p-4">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{icon}</span>
        <div className="flex-1">
          <div className="font-black text-slate-100 text-base">{title}</div>
          <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>
        </div>
        <span className="text-slate-500 text-lg">←</span>
      </div>
    </Card>
  );

  return (
    <div className="space-y-3">
      <SectionHeader icon="📋" title="التقارير" />

      <ReportCard
        icon="📈"
        title="تقرير الترند"
        subtitle="مقارنة آخر فترتين · صاعد / هابط / ثابت / جديد"
        onClick={() => setView("trend")}
      />
      <ReportCard
        icon="🏭"
        title="تقرير المصنع"
        subtitle="أداء كل مصنع مع نسبة النجاح"
        onClick={() => setView("factory")}
      />

    </div>
  );
}
