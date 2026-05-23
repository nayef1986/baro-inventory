// ============================================================
// Branches.jsx — شاشة الفروع
// ============================================================

import { useState, useMemo, memo } from "react";
import {
  Card, Btn, StatPill, EmptyState, ExportBar,
  FilterChips, SearchBar, SectionHeader, BackBtn,
  useToast, fmtN, fmtM, fmtPct,
} from "../components/UI.jsx";
import { ProductImage } from "../components/ProductImage.jsx";
import {
  allBranches, getFactoryCode, arabicIncludes,
  allContainers, allFactoryCodes, totalPurchases,
  soldAllPeriods, num,
} from "../lib/calc.js";
import {
  exportBranchNeedReport, printBranchNeedReport,
  exportGeneric, printTrendReport,
} from "../lib/exporters.js";

// ─── قائمة فلترة مجمّعة (كونتينر ← مصانع) ──────────────────

function GroupedFilter({ products, settings, value, onChange }) {
  const [search, setSearch] = useState("");

  const containers = useMemo(() => allContainers(products), [products]);

  const groups = useMemo(() => {
    return containers.map(cont => {
      const facs = [...new Set(
        products.filter(p => p.container === cont).map(p => getFactoryCode(p.barcode)).filter(Boolean)
      )].sort();
      return { cont, facs };
    });
  }, [containers, products]);

  const filtered = useMemo(() => {
    if (!search) return groups;
    const s = search.toLowerCase();
    return groups.map(g => ({
      ...g,
      facs: g.facs.filter(f =>
        f.includes(s) ||
        (settings?.factories?.[f] ?? "").toLowerCase().includes(s) ||
        g.cont.toLowerCase().includes(s)
      )
    })).filter(g => g.facs.length > 0 || g.cont.toLowerCase().includes(s));
  }, [groups, search, settings]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 بحث بالمصنع أو الكونتينر…"
          className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400 text-sm">✕</button>
        )}
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
      >
        <option value="">الكل</option>
        {filtered.map(({ cont, facs }) => [
          <option key={`c-${cont}`} value={`container:${cont}`}>📦 {cont} — الكل</option>,
          ...facs.map(f => (
            <option key={`f-${f}`} value={`factory:${f}`}>
              　🏭 {f}{settings?.factories?.[f] ? ` · ${settings.factories[f]}` : ""}
            </option>
          ))
        ])}
      </select>
    </div>
  );
}

// ─── كرت المنتج المفصل في الاحتياج ──────────────────────────

function NeedProductCard({ item, images, onSaveImage, onRemoveImage, settings, allPeriods }) {
  const totalSoldAll = allPeriods.reduce((s, per) =>
    s + Object.values(per.sales ?? {}).reduce((ss, d) => ss + num(d[item.barcode]?.qty ?? 0), 0), 0);

  const bought = totalPurchases(item);
  const closingAll = Math.max(0, bought - totalSoldAll);

  return (
    <Card className="!p-0 overflow-hidden">
      {/* هيدر المنتج */}
      <div className="flex items-center gap-3 p-3 border-b border-slate-700">
        <ProductImage barcode={item.barcode} images={images} onSave={onSaveImage} onRemove={onRemoveImage} size="lg" name={item.name} />
        <div className="flex-1 min-w-0">
          <div className="font-black text-slate-100 text-sm leading-tight">{item.name}</div>
          <div className="text-xs text-slate-400 font-mono mt-0.5">{item.barcode}</div>
          <div className="text-xs text-blue-400 mt-0.5">📦 {item.container} · 🏭 {getFactoryCode(item.barcode)}{settings?.factories?.[getFactoryCode(item.barcode)] ? ` · ${settings.factories[getFactoryCode(item.barcode)]}` : ""}</div>
          <div className="flex gap-2 text-xs mt-1">
            <span className="text-red-300">شراء: {fmtM(item.buyPrice)}</span>
            <span className="text-emerald-300">بيع: {fmtM(item.sellPrice ?? 0)}</span>
          </div>
        </div>
      </div>

      {/* المستودع الكلي */}
      <div className="bg-blue-900/10 px-3 py-2 border-b border-slate-700">
        <div className="text-xs text-blue-400 font-bold mb-1.5">📦 المستودع الكلي</div>
        <div className="grid grid-cols-2 gap-2">
          <StatPill label="إجمالي المشتريات" value={fmtN(bought)}      color="text-blue-400" />
          <StatPill label="المتبقي الكلي"     value={fmtN(closingAll)}  color={closingAll < 20 ? "text-red-400" : "text-slate-300"} />
        </div>
      </div>

      {/* بيانات الفرع */}
      <div className="bg-amber-900/10 px-3 py-2 border-b border-slate-700">
        <div className="text-xs text-amber-400 font-bold mb-1.5">🏪 هذا الفرع</div>
        <div className="grid grid-cols-3 gap-1">
          <StatPill label="أُعطي أول المدة"  value={fmtN(item.given)}     color="text-blue-400" />
          <StatPill label="باع الفرع"        value={fmtN(item.sold)}      color="text-amber-400" />
          <StatPill label="متبقي عنده"       value={fmtN(item.remaining)} color={item.remaining === 0 ? "text-red-400" : "text-slate-300"} />
        </div>
      </div>

      {/* المبيعات الكلية */}
      <div className="bg-emerald-900/10 px-3 py-2 border-b border-slate-700">
        <div className="text-xs text-emerald-400 font-bold mb-1.5">📊 المبيعات الكلية</div>
        <div className="grid grid-cols-2 gap-2">
          <StatPill label="مباع ككل"   value={fmtN(totalSoldAll)}                                    color="text-emerald-400" />
          <StatPill label="نسبة البيع" value={fmtPct(bought > 0 ? (totalSoldAll/bought)*100 : 0)} color="text-amber-400" />
        </div>
      </div>

      {/* الاحتياج */}
      <div className="bg-red-900/20 px-3 py-2.5 flex items-center justify-between">
        <div className="text-sm font-black text-red-300">🔴 الاحتياج</div>
        <div className="text-3xl font-black text-red-400 tabular-nums">{fmtN(item.needQty)} <span className="text-sm">وحدة</span></div>
      </div>
    </Card>
  );
}

// ─── شاشة الاحتياج ───────────────────────────────────────────

const NeedSection = memo(({ branch, products, periods, images, onSaveImage, onRemoveImage, settings }) => {
  const [periodId,    setPeriodId]    = useState(periods[periods.length-1]?.id ?? "");
  const [filterVal,   setFilterVal]   = useState("");
  const [minStock,    setMinStock]    = useState(settings?.minStock ?? 12);
  const { show, ToastContainer } = useToast();

  const period = periods.find(p => p.id === periodId) ?? null;

  const allNeedItems = useMemo(() => {
    if (!period) return [];
    const branchData = period.sales?.[branch] ?? {};
    return products
      .filter(p => (branchData[p.barcode]?.qty ?? 0) > 0)
      .map(p => {
        const sold      = num(branchData[p.barcode]?.qty ?? 0);
        // عدد الدزينات = سقف(مباع / الحد الأدنى)
        const dozens    = Math.ceil(sold / minStock);
        const given     = dozens * minStock;
        const remaining = Math.max(0, given - sold);
        const needQty   = Math.max(0, minStock - remaining);
        const bought    = totalPurchases(p);
        const closingAll = Math.max(0, bought - soldAllPeriods(p.barcode, periods));
        return {
          ...p, sold, given, remaining, needQty,
          closingAll,
          buyPrice:  num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0),
          sellPrice: num(p.sellPrice),
        };
      })
      .filter(i => i.needQty > 0)
      .sort((a,b) => b.needQty - a.needQty);
  }, [products, period, branch, minStock, periods]);

  const filtered = useMemo(() => {
    if (!filterVal) return allNeedItems;
    const [type, val] = filterVal.split(":");
    if (type === "container") return allNeedItems.filter(i => i.container === val);
    if (type === "factory")   return allNeedItems.filter(i => getFactoryCode(i.barcode) === val);
    return allNeedItems;
  }, [allNeedItems, filterVal]);

  const filterLabel = !filterVal ? "الكل" : filterVal.split(":")[1];
  const totalNeed = filtered.reduce((s,i) => s + i.needQty, 0);
  const totalCost = filtered.reduce((s,i) => s + i.needQty * i.buyPrice, 0);

  return (
    <div className="space-y-3">
      <ToastContainer />

      {/* الفترة */}
      <select value={periodId} onChange={e => setPeriodId(e.target.value)}
        className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
        {[...periods].reverse().map(p => <option key={p.id} value={p.id}>{p.label} · {p.uploadDate}</option>)}
      </select>

      {/* الحد الأدنى */}
      <div className="flex items-center gap-3 bg-slate-700/50 rounded-xl px-3 py-2.5">
        <span className="text-xs text-slate-400 font-bold">الحد الأدنى للفرع:</span>
        <input type="number" value={minStock} min={1} max={100}
          onChange={e => setMinStock(Math.max(1, Number(e.target.value) || 12))}
          className="w-16 bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-2 py-1.5 text-sm font-black text-center focus:outline-none focus:border-blue-500" />
        <span className="text-xs text-slate-400">قطعة</span>
      </div>

      {/* الفلتر */}
      <GroupedFilter products={products} settings={settings} value={filterVal} onChange={setFilterVal} />

      {/* ملخص */}
      {period && (
        <Card>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <StatPill label="المنتجات"       value={fmtN(filtered.length)} color="text-blue-400" />
            <StatPill label="إجمالي الوحدات" value={fmtN(totalNeed)}       color="text-red-400" />
            <StatPill label="التكلفة"        value={fmtM(totalCost)}       color="text-amber-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => {
              const r = exportBranchNeedReport(branch, filtered, settings?.brandName, filterLabel);
              if (!r.ok) show(r.error, "error"); else show("تم التصدير ✓");
            }} className="flex flex-col items-center gap-1 bg-emerald-700 hover:bg-emerald-600 text-white py-3 rounded-2xl font-black transition-colors">
              <span className="text-2xl">📊</span>
              <span className="text-sm">Excel</span>
            </button>
            <button onClick={() => {
              const r = printBranchNeedReport(branch, filtered, settings?.brandName, filterLabel, images);
              if (!r.ok) show(r.error, "error");
            }} className="flex flex-col items-center gap-1 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 py-3 rounded-2xl font-black transition-colors">
              <span className="text-2xl">🖨️</span>
              <span className="text-sm">طباعة</span>
            </button>
          </div>
        </Card>
      )}

      {/* المنتجات */}
      <div className="space-y-3">
        {filtered.map(item => (
          <NeedProductCard
            key={item.barcode}
            item={item}
            images={images}
            onSaveImage={onSaveImage}
            onRemoveImage={onRemoveImage}
            settings={settings}
            allPeriods={periods}
          />
        ))}
        {filtered.length === 0 && period && <EmptyState icon="✅" title="لا يوجد احتياج" />}
        {!period && <EmptyState icon="📅" title="اختر فترة" />}
      </div>
    </div>
  );
});

// ─── شاشة قوي/ضعيف ───────────────────────────────────────────

const TopBottomSection = memo(({ branch, products, periods, images, onSaveImage, onRemoveImage, settings }) => {
  const [periodId,  setPeriodId]  = useState(periods[periods.length-1]?.id ?? "");
  const [sortBy,    setSortBy]    = useState("sold");
  const [topN,      setTopN]      = useState(10);
  const [filterVal, setFilterVal] = useState("");
  const { show, ToastContainer } = useToast();

  const period = periods.find(p => p.id === periodId) ?? null;

  const items = useMemo(() => {
    if (!period) return [];
    const branchData = period.sales?.[branch] ?? {};
    return products
      .filter(p => branchData[p.barcode])
      .map(p => {
        const sold    = num(branchData[p.barcode]?.qty ?? 0);
        const rev     = num(branchData[p.barcode]?.totalPrice ?? 0);
        const bought  = totalPurchases(p);
        const soldPct = bought > 0 ? (sold/bought)*100 : 0;
        return { ...p, sold, rev, soldPct };
      });
  }, [products, period, branch]);

  const filterItems = (list) => {
    if (!filterVal) return list;
    const [type, val] = filterVal.split(":");
    if (type === "container") return list.filter(p => p.container === val);
    if (type === "factory")   return list.filter(p => getFactoryCode(p.barcode) === val);
    return list;
  };

  const sorted = [...filterItems(items)].sort((a,b) =>
    sortBy === "sold" ? b.sold - a.sold : b.soldPct - a.soldPct
  );

  const top    = sorted.slice(0, topN);
  const bottom = [...sorted].reverse().slice(0, topN);

  const exportTop = () => {
    const data = top.map((p,i) => ({ "الترتيب": i+1, "الباركود": p.barcode, "الاسم": p.name, "الكونتينر": p.container, "مباع": fmtN(p.sold), "إيرادات": fmtM(p.rev), "نسبة%": fmtPct(p.soldPct) }));
    exportGeneric(data, `أقوى منتجات: ${branch}`, `أقوى_${branch}`);
  };

  const exportBottom = () => {
    const data = bottom.map((p,i) => ({ "الترتيب": i+1, "الباركود": p.barcode, "الاسم": p.name, "الكونتينر": p.container, "مباع": fmtN(p.sold), "إيرادات": fmtM(p.rev), "نسبة%": fmtPct(p.soldPct) }));
    exportGeneric(data, `أضعف منتجات: ${branch}`, `أضعف_${branch}`);
  };

  const ProductRow = ({ p, rank, mode }) => (
    <div className={`rounded-xl p-3 border ${mode === "top" ? "bg-emerald-900/10 border-emerald-800/40" : "bg-red-900/10 border-red-800/40"}`}>
      <div className="flex items-center gap-2">
        <span className={`w-7 h-7 rounded-full text-xs flex items-center justify-center font-black shrink-0 ${rank===1?"bg-amber-500 text-black":rank===2?"bg-slate-400 text-black":rank===3?"bg-amber-700 text-white":"bg-slate-700 text-slate-400"}`}>{rank}</span>
        <ProductImage barcode={p.barcode} images={images} onSave={onSaveImage} onRemove={onRemoveImage} size="sm" name={p.name} />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-100 text-sm truncate">{p.name}</div>
          <div className="text-xs text-slate-400 font-mono">{p.barcode}</div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-lg font-black tabular-nums ${mode==="top"?"text-emerald-400":"text-red-400"}`}>{fmtN(p.sold)}</div>
          <div className="text-xs text-amber-400">{fmtPct(p.soldPct)}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <ToastContainer />

      <select value={periodId} onChange={e => setPeriodId(e.target.value)}
        className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
        {[...periods].reverse().map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>

      <GroupedFilter products={products} settings={settings} value={filterVal} onChange={setFilterVal} />

      <div className="flex items-center gap-3 flex-wrap">
        <FilterChips
          label="قياس:"
          options={[{key:"sold",label:"الأكثر مبيعاً"},{key:"pct",label:"الأعلى نسبة"}]}
          active={sortBy} onChange={setSortBy}
        />
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500">أفضل</span>
          <input type="number" min={3} max={50} value={topN}
            onChange={e => setTopN(Math.min(50, Math.max(3, Number(e.target.value)||10)))}
            className="w-12 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-1 py-1 text-sm font-black text-center focus:outline-none" />
        </div>
      </div>

      {period ? (
        <>
          <Card>
            <div className="flex justify-between items-center mb-2">
              <SectionHeader icon="🔥" title={`الأقوى (${top.length})`} />
              <div className="flex gap-2">
                <button onClick={exportTop} className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-sm transition-colors">
                  <span>📊</span><span>Excel</span>
                </button>
                <button onClick={() => show("الطباعة قريباً", "info")} className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 px-4 py-2 rounded-xl font-bold text-sm transition-colors">
                  <span>🖨️</span><span>طباعة</span>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {top.map((p,i) => <ProductRow key={p.barcode} p={p} rank={i+1} mode="top" />)}
              {top.length === 0 && <div className="text-center text-slate-500 text-sm py-3">لا توجد بيانات</div>}
            </div>
          </Card>

          <Card>
            <div className="flex justify-between items-center mb-2">
              <SectionHeader icon="⚠️" title={`الأضعف (${bottom.length})`} />
              <div className="flex gap-2">
                <button onClick={exportBottom} className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-sm transition-colors">
                  <span>📊</span><span>Excel</span>
                </button>
                <button onClick={() => show("الطباعة قريباً", "info")} className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 px-4 py-2 rounded-xl font-bold text-sm transition-colors">
                  <span>🖨️</span><span>طباعة</span>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {bottom.map((p,i) => <ProductRow key={p.barcode} p={p} rank={i+1} mode="bottom" />)}
              {bottom.length === 0 && <div className="text-center text-slate-500 text-sm py-3">لا توجد بيانات</div>}
            </div>
          </Card>
        </>
      ) : (
        <EmptyState icon="📅" title="اختر فترة" />
      )}
    </div>
  );
});

// ─── تفاصيل الفرع ────────────────────────────────────────────

const BranchDetail = memo(({ branch, products, periods, images, onSaveImage, onRemoveImage, settings, onBack }) => {
  const [view, setView] = useState("need");
  return (
    <div className="space-y-4">
      <BackBtn onClick={onBack} label="رجوع للفروع" />
      <div className="font-black text-slate-100 text-lg">🏪 {branch}</div>
      <div className="flex bg-slate-800 border border-slate-700 rounded-2xl p-1 gap-1">
        {[["need","🔴 احتياج"],["top","🔥 قوي/ضعيف"]].map(([k,l]) => (
          <button key={k} onClick={() => setView(k)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${view===k?"bg-blue-600 text-white":"text-slate-400 hover:text-slate-200"}`}>
            {l}
          </button>
        ))}
      </div>
      {view === "need" && <NeedSection branch={branch} products={products} periods={periods} images={images} onSaveImage={onSaveImage} onRemoveImage={onRemoveImage} settings={settings} />}
      {view === "top"  && <TopBottomSection branch={branch} products={products} periods={periods} images={images} onSaveImage={onSaveImage} onRemoveImage={onRemoveImage} settings={settings} />}
    </div>
  );
});

// ─── قائمة الفروع ────────────────────────────────────────────

const BranchSelector = memo(({ branches, periods, products, settings, onSelect }) => {
  const [search,  setSearch]  = useState("");
  const [sortBy,  setSortBy]  = useState("revenue");

  const branchStats = useMemo(() =>
    branches.map(branch => {
      let qty = 0, rev = 0;
      periods.forEach(per => {
        const data = per.sales?.[branch] ?? {};
        Object.values(data).forEach(v => { qty += num(v.qty); rev += num(v.totalPrice); });
      });
      return { branch, qty, rev };
    }).sort((a,b) => sortBy === "revenue" ? b.rev - a.rev : b.qty - a.qty),
    [branches, periods, sortBy]
  );

  const filtered = branchStats.filter(b => arabicIncludes(b.branch, search));

  return (
    <div className="space-y-3">
      <SearchBar value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 بحث عن فرع…" />
      <FilterChips
        label="ترتيب:"
        options={[{key:"revenue",label:"الأعلى إيراداً"},{key:"units",label:"الأكثر وحدات"}]}
        active={sortBy} onChange={setSortBy}
      />
      <div className="space-y-2">
        {filtered.map(({ branch, qty, rev }, i) => (
          <Card key={branch} onClick={() => onSelect(branch)} className="!p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-7 h-7 rounded-full text-xs flex items-center justify-center font-black shrink-0 ${i===0?"bg-amber-500 text-black":i===1?"bg-slate-400 text-black":i===2?"bg-amber-700 text-white":"bg-slate-700 text-slate-400"}`}>{i+1}</span>
              <div className="flex-1 font-bold text-slate-100">{branch}</div>
              <div className="text-right shrink-0">
                <div className="font-black text-emerald-400 text-sm tabular-nums">{fmtM(rev)}</div>
                <div className="text-xs text-slate-500 tabular-nums">{fmtN(qty)} وحدة</div>
              </div>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
                style={{ width: `${filtered[0]?.rev > 0 ? (rev/filtered[0].rev)*100 : 0}%` }} />
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <EmptyState icon="🏪" title="لا توجد فروع" subtitle="ارفع ملف مبيعات أولاً" />}
      </div>
    </div>
  );
});

// ─── الشاشة الرئيسية ─────────────────────────────────────────

export default function BranchesScreen({ products, periods, settings, images, onSaveImage, onRemoveImage }) {
  const [selected, setSelected] = useState(null);
  const branches = useMemo(() => allBranches(periods), [periods]);

  if (selected) {
    return (
      <BranchDetail
        branch={selected} products={products} periods={periods}
        images={images} onSaveImage={onSaveImage} onRemoveImage={onRemoveImage}
        settings={settings} onBack={() => setSelected(null)}
      />
    );
  }

  if (branches.length === 0) return <EmptyState icon="🏪" title="لا توجد فروع" subtitle="ارفع ملف مبيعات أولاً" />;

  return (
    <div className="space-y-3">
      <SectionHeader icon="🏪" title="الفروع" subtitle="اضغط فرع للتفاصيل" />
      <BranchSelector branches={branches} periods={periods} products={products} settings={settings} onSelect={setSelected} />
    </div>
  );
}
