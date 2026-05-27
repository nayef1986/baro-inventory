// ============================================================
// Reports.jsx — شاشة التقارير
// ============================================================

import { useState, useMemo, memo } from "react";
import { OperationsRoom } from "./OperationsRoom.jsx";
import { MonthlyIntelligence } from "./MonthlyIntelligence.jsx";
import {
  Card, Btn, StatPill, EmptyState, ExportBar,
  FilterChips, SearchBar, SectionHeader, BackBtn,
  NumberInput, useToast, fmtN, fmtM, fmtPct,
} from "../components/UI.jsx";
import { ProductImage } from "../components/ProductImage.jsx";
import {
  factoryReport, containerSummary, allContainers,
  allFactoryCodes, getFactoryCode, arabicIncludes, analyzeReorder,
  getSmartAlerts, branchTrendAnalysis, topProductsAnalysis,
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

// ─── التنبيهات الذكية ────────────────────────────────────────

const SmartAlertsView = memo(({ products, periods, onBack }) => {
  const alerts = useMemo(() => getSmartAlerts(products, periods), [products, periods]);
  const C = { green:"text-emerald-400 bg-emerald-900/20 border-emerald-700/40", red:"text-red-400 bg-red-900/20 border-red-700/40", amber:"text-amber-400 bg-amber-900/20 border-amber-700/40" };

  return (
    <div className="space-y-4">
      <BackBtn onClick={onBack} />
      <SectionHeader icon="🧠" title="التنبيهات الذكية" />
      {alerts.length === 0 && <EmptyState icon="✅" title="لا توجد تنبيهات" subtitle="ارفع فترتين أو أكثر" />}
      <div className="space-y-2">
        {alerts.map((a, i) => (
          <div key={i} className={`rounded-xl border p-3 ${C[a.color].split(" ").slice(1).join(" ")}`}>
            <div className="flex items-start gap-2 mb-1">
              <span className="text-xl shrink-0">{a.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-100 text-sm truncate">{a.title}</div>
                <div className="text-xs text-slate-500 font-mono">{a.barcode}</div>
              </div>
            </div>
            <div className={`text-sm font-bold ${C[a.color].split(" ")[0]}`}>{a.message}</div>
            <div className="text-xs text-slate-400 mt-0.5">{a.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ─── أفضل المنتجات ────────────────────────────────────────────

const TopProductsView = memo(({ products, periods, onBack }) => {
  const [tab, setTab] = useState("profitable");
  const data = useMemo(() => topProductsAnalysis(products, periods), [products, periods]);
  const branchData = useMemo(() => branchTrendAnalysis(products, periods), [products, periods]);

  const list = tab === "profitable" ? data.profitable : tab === "fastest" ? data.fastest : branchData;

  return (
    <div className="space-y-4">
      <BackBtn onClick={onBack} />
      <SectionHeader icon="🏆" title="أفضل المنتجات والفروع" />

      <div className="flex gap-2">
        {[["profitable","💰 الأرباح"],["fastest","⚡ الدوران"],["branches","🏪 الفروع"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors
              ${tab===k?"bg-blue-600 text-white border-blue-500":"bg-slate-700 text-slate-400 border-slate-600"}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {tab !== "branches" && list.map((p, i) => (
          <Card key={p.barcode} className="!p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-7 h-7 rounded-full text-xs flex items-center justify-center font-black shrink-0
                ${i===0?"bg-amber-500 text-black":i===1?"bg-slate-400 text-black":i===2?"bg-amber-700 text-white":"bg-slate-700 text-slate-400"}`}>
                {i+1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-100 text-sm truncate">{p.name}</div>
                <div className="text-xs text-slate-500 font-mono">{p.barcode}</div>
              </div>
            </div>
            {tab === "profitable" && (
              <div className="grid grid-cols-3 gap-1">
                <StatPill label="ربح" value={fmtM(p.profit)} color="text-emerald-400" />
                <StatPill label="إيراد" value={fmtM(p.rev)} color="text-blue-400" />
                <StatPill label="هامش" value={fmtPct(p.margin)} color="text-amber-400" />
              </div>
            )}
            {tab === "fastest" && (
              <div className="grid grid-cols-3 gap-1">
                <StatPill label="دوران" value={fmtPct(p.turnover)} color="text-emerald-400" />
                <StatPill label="مباع" value={fmtN(p.sold)} color="text-blue-400" />
                <StatPill label="مشتريات" value={fmtN(p.bought)} color="text-slate-400" />
              </div>
            )}
          </Card>
        ))}

        {tab === "branches" && list.map((b, i) => (
          <Card key={b.branch} className="!p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-bold text-slate-100 text-sm">{b.branch}</div>
                <div className={`text-xs font-bold ${b.growth>0?"text-emerald-400":b.growth<0?"text-red-400":"text-slate-400"}`}>
                  {b.growth>0?"+":""}{Math.round(b.growth)}% ترند
                </div>
              </div>
              <div className="text-right">
                <div className="font-black text-emerald-400 text-sm">{fmtM(b.totalRev)}</div>
              </div>
            </div>
            {b.topProducts.length > 0 && (
              <div className="text-xs text-slate-500">
                🏆 {b.topProducts[0]?.name}
              </div>
            )}
          </Card>
        ))}

        {list.length === 0 && <EmptyState icon="📊" title="لا توجد بيانات" subtitle="ارفع فترات مبيعات أولاً" />}
      </div>
    </div>
  );
});

// ─── تحليل إعادة الطلب ──────────────────────────────────────

const ReorderView = memo(({ products, periods, onBack }) => {
  const [filter, setFilter] = useState("urgent");
  const [search, setSearch] = useState("");

  const analyzed = useMemo(() => {
    return products.map(p => {
      const analysis = analyzeReorder(p, periods);
      return analysis ? { ...p, analysis } : null;
    }).filter(Boolean);
  }, [products, periods]);

  const filtered = useMemo(() => {
    let list = analyzed;
    if (filter === "urgent") list = list.filter(p => p.analysis.status === "urgent" || p.analysis.status === "empty");
    if (filter === "soon")   list = list.filter(p => p.analysis.status === "soon");
    if (filter === "rising") list = list.filter(p => p.analysis.trend === "rising");
    if (search) list = list.filter(p => arabicIncludes(p.name, search) || p.barcode.includes(search));
    return list.sort((a,b) => a.analysis.daysToEmpty - b.analysis.daysToEmpty);
  }, [analyzed, filter, search]);

  const urgent = analyzed.filter(p => p.analysis.status === "urgent" || p.analysis.status === "empty").length;
  const soon   = analyzed.filter(p => p.analysis.status === "soon").length;
  const rising = analyzed.filter(p => p.analysis.trend === "rising").length;

  return (
    <div className="space-y-4">
      <BackBtn onClick={onBack} />
      <SectionHeader icon="🔔" title="تحليل إعادة الطلب" />

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-red-900/30 border border-red-700/40 rounded-xl p-3 text-center">
          <div className="text-2xl font-black text-red-400">{urgent}</div>
          <div className="text-xs text-red-300/70">عاجل</div>
        </div>
        <div className="bg-amber-900/30 border border-amber-700/40 rounded-xl p-3 text-center">
          <div className="text-2xl font-black text-amber-400">{soon}</div>
          <div className="text-xs text-amber-300/70">قريباً</div>
        </div>
        <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-xl p-3 text-center">
          <div className="text-2xl font-black text-emerald-400">{rising}</div>
          <div className="text-xs text-emerald-300/70">صاعد</div>
        </div>
      </div>

      <FilterChips label="عرض:" options={[
        {key:"urgent", label:"🔴 عاجل"},
        {key:"soon",   label:"🟡 قريباً"},
        {key:"rising", label:"📈 صاعد"},
        {key:"all",    label:"الكل"},
      ]} active={filter} onChange={setFilter} />

      <SearchBar value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 بحث…" />

      <div className="space-y-2">
        {filtered.map(p => {
          const a = p.analysis;
          const color = a.status==="urgent"||a.status==="empty" ? "red" : a.status==="soon" ? "amber" : "slate";
          const C = {red:"text-red-400 border-red-700/40 bg-red-900/20", amber:"text-amber-400 border-amber-700/40 bg-amber-900/20", slate:"text-slate-400 border-slate-700 bg-slate-800"};
          return (
            <div key={p.barcode} className={`rounded-xl border p-3 ${C[color].split(" ").slice(1).join(" ")}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-100 text-sm truncate">{p.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{p.barcode}</div>
                </div>
                {a.daysToEmpty < 999 && (
                  <div className={`text-xs font-black shrink-0 ${C[color].split(" ")[0]}`}>
                    {a.daysToEmpty} يوم
                  </div>
                )}
              </div>
              {a.message && (
                <div className={`text-xs font-bold mb-1 ${C[color].split(" ")[0]}`}>{a.message}</div>
              )}
              {a.trendMsg && (
                <div className="text-xs text-slate-400">{a.trendMsg}</div>
              )}
              <div className="grid grid-cols-3 gap-1 mt-2">
                <StatPill label="متبقي"    value={fmtN(a.closing)}   color="text-slate-300" />
                <StatPill label="متوسط/شهر" value={fmtN(Math.round(a.avgSales))} color="text-blue-400" />
                <StatPill label="آخر فترة"  value={fmtN(a.lastSales)} color={a.lastSales > a.avgSales ? "text-emerald-400" : "text-red-400"} />
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <EmptyState icon="✅" title="لا توجد تنبيهات" subtitle="كل المنتجات بخير" />}
      </div>
    </div>
  );
});

const TrendReportView = memo(({ products, periods, settings, onBack }) => {
  const [trendF,  setTrendF]  = useState("all");
  const [sortBy,  setSortBy]  = useState("diff");
  const [search,  setSearch]  = useState("");
  const [view,    setView]    = useState("compare"); // compare | multi
  const [selA,    setSelA]    = useState("");
  const [selB,    setSelB]    = useState("");
  const { show, ToastContainer } = useToast();

  // نرتب الفترات من الأقدم للأحدث
  const sorted = [...periods].sort((a,b) => (a.uploadDate??a.label) > (b.uploadDate??b.label) ? 1 : -1);

  const pA = selA ? periods.find(p=>p.id===selA) : sorted[sorted.length-2] ?? null;
  const pB = selB ? periods.find(p=>p.id===selB) : sorted[sorted.length-1] ?? null;

  const rows = useMemo(() => {
    if (!pA || !pB) return [];
    return comparePeriods(products, pA, pB);
  }, [products, pA, pB]);

  const filtered = useMemo(() => {
    let list = rows;
    if (trendF !== "all") list = list.filter(r => r.trend === trendF);
    if (search) list = list.filter(r => arabicIncludes(r.name, search) || r.barcode.includes(search));
    return [...list].sort((a,b) => {
      if (sortBy === "diff")    return b.diff - a.diff;
      if (sortBy === "soldB")   return b.soldB - a.soldB;
      if (sortBy === "growth")  return (b.soldA>0?(b.diff/b.soldA):0) - (a.soldA>0?(a.diff/a.soldA):0);
      return b.diff - a.diff;
    });
  }, [rows, trendF, search, sortBy]);

  const rising  = rows.filter(r => r.trend === "صاعد").length;
  const falling = rows.filter(r => r.trend === "هابط").length;
  const stable  = rows.filter(r => r.trend === "ثابت").length;
  const newProd = rows.filter(r => r.trend === "جديد").length;

  const TREND_COLOR = { "صاعد":"text-emerald-400", "هابط":"text-red-400", "ثابت":"text-slate-400", "جديد":"text-blue-400" };
  const TREND_ICON  = { "صاعد":"📈", "هابط":"📉", "ثابت":"➡️", "جديد":"✨" };

  // تحليل متعدد الفترات
  const multiData = useMemo(() => {
    if (sorted.length < 2) return [];
    return products.slice(0, 50).map(p => {
      const monthly = sorted.map(per => ({
        label: per.label,
        qty: Object.values(per.sales ?? {}).reduce((s,b) => s + num(b[p.barcode]?.qty ?? 0), 0),
      }));
      const total = monthly.reduce((s,m) => s+m.qty, 0);
      if (total === 0) return null;
      const first = monthly.find(m=>m.qty>0)?.qty ?? 1;
      const last  = [...monthly].reverse().find(m=>m.qty>0)?.qty ?? 0;
      const growth = first > 0 ? ((last-first)/first)*100 : 0;
      return { ...p, monthly, total, growth };
    }).filter(Boolean).sort((a,b) => Math.abs(b.growth)-Math.abs(a.growth)).slice(0,30);
  }, [products, sorted]);

  return (
    <div className="space-y-4">
      <ToastContainer />
      <BackBtn onClick={onBack} />

      {/* تبويب نوع العرض */}
      <div className="flex gap-2">
        <button onClick={() => setView("compare")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors
            ${view==="compare" ? "bg-blue-600 text-white border-blue-500" : "bg-slate-700 text-slate-400 border-slate-600"}`}>
          ⚖️ مقارنة فترتين
        </button>
        <button onClick={() => setView("multi")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors
            ${view==="multi" ? "bg-purple-600 text-white border-purple-500" : "bg-slate-700 text-slate-400 border-slate-600"}`}>
          📊 ترند شهري
        </button>
      </div>

      {view === "compare" && (
        <>
          {/* اختيار الفترتين */}
          <Card>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-slate-400 mb-1">الفترة الأولى</div>
                <select value={selA} onChange={e=>setSelA(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-2 py-2 text-xs focus:outline-none">
                  <option value="">آخر فترة ثانية</option>
                  {periods.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">الفترة الثانية</div>
                <select value={selB} onChange={e=>setSelB(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-2 py-2 text-xs focus:outline-none">
                  <option value="">آخر فترة</option>
                  {periods.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            </div>
          </Card>

          <Card>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[["صاعد",rising,"text-emerald-400"],["هابط",falling,"text-red-400"],["ثابت",stable,"text-slate-400"],["جديد",newProd,"text-blue-400"]].map(([l,v,c])=>(
                <div key={l} className="text-center">
                  <div className={`text-xl font-black ${c}`}>{v}</div>
                  <div className="text-xs text-slate-500">{l}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => {
                const r = exportTrendReport(filtered, pA?.label, pB?.label);
                if (!r.ok) show(r.error, "error"); else show("تم التصدير ✓");
              }} className="flex flex-col items-center gap-1 bg-emerald-700 text-white py-3 rounded-2xl font-black">
                <span className="text-2xl">📊</span><span className="text-sm">Excel</span>
              </button>
              <button onClick={() => {
                const r = printTrendReport(filtered, pA?.label, pB?.label, settings?.brandName);
                if (!r.ok) show(r.error, "error");
              }} className="flex flex-col items-center gap-1 bg-slate-700 border border-slate-600 text-slate-200 py-3 rounded-2xl font-black">
                <span className="text-2xl">🖨️</span><span className="text-sm">طباعة</span>
              </button>
            </div>
          </Card>

          <FilterChips label="الترند:" options={[
            {key:"all",label:"الكل"},{key:"صاعد",label:"📈 صاعد"},
            {key:"هابط",label:"📉 هابط"},{key:"ثابت",label:"➡️ ثابت"},{key:"جديد",label:"✨ جديد"}
          ]} active={trendF} onChange={setTrendF} />

          <FilterChips label="ترتيب:" options={[
            {key:"diff",label:"الفرق"},{key:"soldB",label:"الأعلى مبيعاً"},{key:"growth",label:"الأسرع نمواً"}
          ]} active={sortBy} onChange={setSortBy} />

          <SearchBar value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 بحث…" />

          <div className="space-y-2">
            {filtered.map(r => (
              <Card key={r.barcode} className="!p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{TREND_ICON[r.trend]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-100 text-sm truncate">{r.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{r.barcode}</div>
                  </div>
                  <div className={`font-black text-sm ${r.diff>0?"text-emerald-400":r.diff<0?"text-red-400":"text-slate-400"}`}>
                    {r.diff>0?"+":""}{fmtN(r.diff)}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <StatPill label={pA?.label ?? "الأولى"} value={fmtN(r.soldA)} color="text-slate-400" />
                  <StatPill label={pB?.label ?? "الثانية"} value={fmtN(r.soldB)} color="text-blue-400" />
                  <StatPill label="النمو" value={r.soldA>0?`${r.diff>0?"+":""}${Math.round((r.diff/r.soldA)*100)}%`:"جديد"}
                    color={r.diff>0?"text-emerald-400":r.diff<0?"text-red-400":"text-slate-400"} />
                </div>
              </Card>
            ))}
            {filtered.length === 0 && <EmptyState icon="📊" title="لا توجد بيانات" subtitle="ارفع فترتين على الأقل" />}
          </div>
        </>
      )}

      {view === "multi" && (
        <div className="space-y-3">
          {multiData.length === 0 && <EmptyState icon="📊" title="لا توجد بيانات كافية" subtitle="ارفع 2+ فترات" />}
          {multiData.map(p => {
            const max = Math.max(...p.monthly.map(m=>m.qty), 1);
            const isRising = p.growth > 20;
            const isFalling = p.growth < -20;
            return (
              <Card key={p.barcode} className="!p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-100 text-sm truncate">{p.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{p.barcode}</div>
                  </div>
                  <div className={`text-sm font-black shrink-0 ${isRising?"text-emerald-400":isFalling?"text-red-400":"text-slate-400"}`}>
                    {p.growth>0?"+":""}{Math.round(p.growth)}%
                  </div>
                </div>
                {/* رسم بياني بسيط */}
                <div className="flex items-end gap-0.5 h-10 mt-2">
                  {p.monthly.map((m,i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className={`w-full rounded-t transition-all ${
                        i===p.monthly.length-1?"bg-blue-500":isRising?"bg-emerald-600":isFalling?"bg-red-600":"bg-slate-600"
                      }`} style={{height: `${max>0?(m.qty/max)*100:0}%`, minHeight: m.qty>0?"2px":"0"}} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-1">
                  <div className="text-xs text-slate-500">{sorted[0]?.label}</div>
                  <div className="text-xs text-slate-500">{sorted[sorted.length-1]?.label}</div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
});


export default function ReportsScreen({ products, periods, settings, images, onSaveImage, onRemoveImage }) {
  const [view, setView] = useState(null);

  if (view === "monthly") {
    return <MonthlyIntelligence
      products={products} periods={periods} images={images}
      onBack={() => setView(null)}
    />;
  }

  if (view === "ops") {
    return (
      <div>
        <button onClick={() => setView(null)}
          className="mb-4 px-4 py-2 rounded-xl border border-slate-600 bg-slate-800 text-slate-300 text-sm font-bold">
          ← رجوع
        </button>
        <OperationsRoom
          products={products} periods={periods}
          images={images} settings={settings}
          onBuildCard={() => {}}
        />
      </div>
    );
  }

  if (view === "reorder") {
    return <ReorderView products={products} periods={periods} onBack={() => setView(null)} />;
  }

  if (view === "alerts") {
    return <SmartAlertsView products={products} periods={periods} onBack={() => setView(null)} />;
  }

  if (view === "top") {
    return <TopProductsView products={products} periods={periods} onBack={() => setView(null)} />;
  }

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

      <div onClick={() => setView("ops")} style={{
        background:"linear-gradient(135deg,rgba(212,168,83,0.12),rgba(212,168,83,0.04))",
        border:"1px solid rgba(212,168,83,0.3)",borderRadius:"18px",padding:"18px",
        cursor:"pointer",marginBottom:"10px",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <span style={{fontSize:"28px"}}>⚡</span>
          <div>
            <div style={{fontSize:"16px",fontWeight:"900",color:"#ffffff"}}>غرفة العمليات</div>
            <div style={{fontSize:"12px",color:"rgba(212,168,83,0.7)",marginTop:"3px"}}>القرارات + الصور + الأرقام + الترند</div>
          </div>
          <div style={{marginRight:"auto",fontSize:"18px",color:"rgba(212,168,83,0.5)"}}>←</div>
        </div>
      </div>

      <div onClick={() => setView("monthly")} style={{
        background:"linear-gradient(135deg,rgba(99,102,241,0.1),rgba(99,102,241,0.04))",
        border:"1px solid rgba(99,102,241,0.3)",borderRadius:"18px",padding:"18px",
        cursor:"pointer",marginBottom:"10px",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <span style={{fontSize:"28px"}}>📅</span>
          <div>
            <div style={{fontSize:"16px",fontWeight:"900",color:"#ffffff"}}>الذكاء الشهري</div>
            <div style={{fontSize:"12px",color:"rgba(99,102,241,0.8)",marginTop:"3px"}}>أفضل المنتجات · كرّره · تجنّبه</div>
          </div>
          <div style={{marginRight:"auto",fontSize:"18px",color:"rgba(99,102,241,0.5)"}}>←</div>
        </div>
      </div>

      <ReportCard
        icon="📈"
        title="تقرير الترند"
        subtitle="مقارنة الفترات · صاعد / هابط / ثابت / رسوم بيانية"
        onClick={() => setView("trend")}
      />
      <ReportCard
        icon="🏭"
        title="تقرير المصنع"
        subtitle="أداء كل مصنع مع نسبة النجاح"
        onClick={() => setView("factory")}
      />
      <ReportCard
        icon="🔔"
        title="تحليل إعادة الطلب"
        subtitle="المنتجات التي تحتاج إعادة طلب قريباً"
        onClick={() => setView("reorder")}
      />
      <ReportCard
        icon="🧠"
        title="التنبيهات الذكية"
        subtitle="صاعد قوي · هابط · يحتاج إعادة طلب"
        onClick={() => setView("alerts")}
      />
      <ReportCard
        icon="🏆"
        title="أفضل المنتجات"
        subtitle="الأكثر ربحاً · الأسرع دوراناً · الفروع"
        onClick={() => setView("top")}
      />

    </div>
  );
}
