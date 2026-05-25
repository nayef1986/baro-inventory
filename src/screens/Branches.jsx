// ============================================================
// Branches.jsx — شاشة الفروع
// ============================================================

import { useState, useMemo, memo } from "react";
import {
  Card, Btn, StatPill, EmptyState, ExportBar,
  FilterChips, SearchBar, SectionHeader, BackBtn,
  useToast, fmtN, fmtM, fmtPct,
} from "../components/UI.jsx";
import { ProductImage, CameraScanner } from "../components/ProductImage.jsx";
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

// ─── بحث ذكي مترابط ─────────────────────────────────────────

function SmartSearch({ products, periods, settings, images, onSaveImage, onRemoveImage }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);

  const search = useMemo(() => {
    if (!query || query.length < 2) return null;
    const q = query.toLowerCase().trim();

    // 1. بحث بالباركود
    const byBarcode = products.filter(p => p.barcode.toLowerCase().includes(q));
    if (byBarcode.length > 0) {
      return {
        type: "barcode",
        products: byBarcode.map(p => {
          const factory = getFactoryCode(p.barcode);
          const neededIn = periods.length > 0 ? Object.keys(periods[periods.length-1]?.sales ?? {}).filter(branch => {
            const sold = num(periods[periods.length-1]?.sales?.[branch]?.[p.barcode]?.qty ?? 0);
            return sold > 0;
          }) : [];
          return { ...p, factory, factoryName: settings?.factories?.[factory] ?? "", neededIn };
        }),
      };
    }

    // 2. بحث بالمصنع (رقم أو اسم)
    const byFactory = products.filter(p => {
      const code = getFactoryCode(p.barcode).toLowerCase();
      const name = (settings?.factories?.[getFactoryCode(p.barcode)] ?? "").toLowerCase();
      return code.includes(q) || name.includes(q);
    });
    if (byFactory.length > 0) {
      const factoryCode = getFactoryCode(byFactory[0].barcode);
      return {
        type: "factory",
        factoryCode,
        factoryName: settings?.factories?.[factoryCode] ?? "",
        containers: [...new Set(byFactory.map(p => p.container))],
        products: byFactory,
      };
    }

    // 3. بحث بالكونتينر
    const byContainer = products.filter(p => p.container.toLowerCase().includes(q));
    if (byContainer.length > 0) {
      const factories = [...new Set(byContainer.map(p => getFactoryCode(p.barcode)).filter(Boolean))];
      return {
        type: "container",
        container: byContainer[0].container,
        factories: factories.map(f => ({
          code: f,
          name: settings?.factories?.[f] ?? "",
          products: byContainer.filter(p => getFactoryCode(p.barcode) === f),
        })),
        products: byContainer,
      };
    }

    return { type: "empty" };
  }, [query, products, periods, settings]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="🔍 باركود · مصنع · كونتينر…"
            className="w-full bg-slate-800 border-2 border-slate-600 focus:border-blue-500 text-slate-100 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none placeholder-slate-500 transition-colors"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute left-4 top-1/2 -translate-y-1/2 text-red-400">✕</button>
          )}
        </div>
        {/* زر الكاميرا */}
        <label className="w-12 h-12 bg-blue-600 hover:bg-blue-500 rounded-2xl flex items-center justify-center cursor-pointer transition-colors shrink-0">
          <span className="text-xl">📷</span>
          <input type="file" accept="image/*" capture="environment" className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = async (ev) => {
                try {
                  const response = await fetch("/api/scan-barcode", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ imageBase64: ev.target.result }),
                  });
                  const data = await response.json();
                  if (data.barcode) setQuery(data.barcode);
                  else alert("لم يُعثر على باركود في الصورة");
                } catch { alert("خطأ في القراءة"); }
              };
              reader.readAsDataURL(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {search && search.type === "barcode" && (
        <div className="space-y-3">
          <div className="text-xs text-blue-400 font-bold">🔎 نتائج الباركود ({search.products.length})</div>
          {search.products.map(p => (
            <Card key={p.barcode} className="!p-3">
              <div className="flex items-start gap-3 mb-3">
                <ProductImage barcode={p.barcode} images={images} onSave={onSaveImage} onRemove={onRemoveImage} size="lg" name={p.name} />
                <div className="flex-1 min-w-0">
                  <div className="font-black text-slate-100 text-sm">{p.name}</div>
                  <div className="font-mono text-blue-400 text-xs mt-0.5">{p.barcode}</div>
                  <div className="text-xs text-slate-400 mt-0.5">📦 {p.container}</div>
                  <div className="text-xs text-slate-400">🏭 {p.factory}{p.factoryName ? ` · ${p.factoryName}` : ""}</div>
                  <div className="flex gap-2 text-xs mt-1">
                    <span className="text-red-300">شراء: {fmtM(p.purchases?.slice(-1)[0]?.buyPrice ?? 0)}</span>
                    <span className="text-emerald-300">بيع: {fmtM(p.sellPrice ?? 0)}</span>
                  </div>
                </div>
              </div>
              {p.neededIn.length > 0 && (
                <div>
                  <div className="text-xs text-amber-400 font-bold mb-1.5">🏪 فروع تبيعه:</div>
                  <div className="flex flex-wrap gap-1">
                    {p.neededIn.map(b => (
                      <span key={b} className="text-xs bg-amber-900/30 text-amber-300 border border-amber-700/40 rounded-lg px-2 py-0.5">{b}</span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {search && search.type === "factory" && (
        <div className="space-y-3">
          <div className="bg-slate-700/50 rounded-xl p-3">
            <div className="font-black text-slate-100 text-base">🏭 {search.factoryCode}</div>
            {search.factoryName && <div className="text-xs text-slate-400">{search.factoryName}</div>}
            <div className="flex gap-3 text-xs mt-2">
              <span className="text-blue-400">{search.products.length} منتج</span>
              <span className="text-slate-400">{search.containers.join(" · ")}</span>
            </div>
          </div>
          <div className="text-xs text-blue-400 font-bold">📦 الكونتينرات: {search.containers.join(" · ")}</div>
          <div className="space-y-2">
            {search.products.slice(0, 20).map(p => (
              <Card key={p.barcode} className="!p-3">
                <div className="flex items-center gap-3">
                  <ProductImage barcode={p.barcode} images={images} onSave={onSaveImage} onRemove={onRemoveImage} size="sm" name={p.name} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-100 text-sm truncate">{p.name}</div>
                    <div className="font-mono text-blue-400 text-xs">{p.barcode}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-slate-400">📦 {p.container}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {search && search.type === "container" && (
        <div className="space-y-3">
          <div className="bg-slate-700/50 rounded-xl p-3">
            <div className="font-black text-slate-100 text-base">📦 {search.container}</div>
            <div className="text-xs text-slate-400">{search.products.length} منتج · {search.factories.length} مصنع</div>
          </div>
          {search.factories.map(f => (
            <div key={f.code} className="space-y-2">
              <div className="text-xs font-bold text-amber-400">🏭 {f.code}{f.name ? ` · ${f.name}` : ""} ({f.products.length})</div>
              {f.products.slice(0, 10).map(p => (
                <Card key={p.barcode} className="!p-3">
                  <div className="flex items-center gap-3">
                    <ProductImage barcode={p.barcode} images={images} onSave={onSaveImage} onRemove={onRemoveImage} size="sm" name={p.name} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-100 text-sm truncate">{p.name}</div>
                      <div className="font-mono text-blue-400 text-xs">{p.barcode}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ))}
        </div>
      )}

      {search && search.type === "empty" && (
        <div className="text-center py-6 text-slate-500 text-sm">لا توجد نتائج</div>
      )}
    </div>
  );
}

// ─── شاشة الاحتياج ───────────────────────────────────────────

const NeedSection = memo(({ branch, products, periods, images, onSaveImage, onRemoveImage, settings }) => {
  const [periodId,    setPeriodId]    = useState(periods[periods.length-1]?.id ?? "");
  const [filterVal,   setFilterVal]   = useState("");
  const [minStock,    setMinStock]    = useState(settings?.minStock ?? 12);
  const { show, ToastContainer } = useToast();

  const period = periods.find(p => p.id === periodId) ?? null;

  const [barcodeSearch, setBarcodeSearch] = useState("");

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
    let list = allNeedItems;
    if (filterVal) {
      const [type, val] = filterVal.split(":");
      if (type === "container") list = list.filter(i => i.container === val);
      if (type === "factory")   list = list.filter(i => getFactoryCode(i.barcode) === val);
    }
    if (barcodeSearch) {
      const s = barcodeSearch.toLowerCase();
      list = list.filter(i =>
        i.barcode.toLowerCase().includes(s) ||
        i.name.toLowerCase().includes(s)
      );
    }
    return list;
  }, [allNeedItems, filterVal, barcodeSearch]);

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

      {/* بحث بالباركود */}
      <div className="relative">
        <input
          value={barcodeSearch}
          onChange={e => setBarcodeSearch(e.target.value)}
          placeholder="🔍 بحث بالباركود أو اسم المنتج…"
          className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
        />
        {barcodeSearch && (
          <button onClick={() => setBarcodeSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400 text-sm">✕</button>
        )}
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

  const sorted = [...filterItems2(items)].sort((a,b) =>
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

  const [barcodeSearch2, setBarcodeSearch2] = useState("");

  const filterItems2 = (list) => {
    let result = filterItems(list);
    if (barcodeSearch2) {
      const s = barcodeSearch2.toLowerCase();
      result = result.filter(p => p.barcode.toLowerCase().includes(s) || p.name.toLowerCase().includes(s));
    }
    return result;
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

      <div className="relative">
        <input
          value={barcodeSearch2}
          onChange={e => setBarcodeSearch2(e.target.value)}
          placeholder="🔍 بحث بالباركود…"
          className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
        />
        {barcodeSearch2 && (
          <button onClick={() => setBarcodeSearch2("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400 text-sm">✕</button>
        )}
      </div>

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
        {[["need","🔴 احتياج"],["top","🔥 قوي/ضعيف"],["search","🔍 بحث"]].map(([k,l]) => (
          <button key={k} onClick={() => setView(k)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${view===k?"bg-blue-600 text-white":"text-slate-400 hover:text-slate-200"}`}>
            {l}
          </button>
        ))}
      </div>
      {view === "need"   && <NeedSection branch={branch} products={products} periods={periods} images={images} onSaveImage={onSaveImage} onRemoveImage={onRemoveImage} settings={settings} />}
      {view === "top"    && <TopBottomSection branch={branch} products={products} periods={periods} images={images} onSaveImage={onSaveImage} onRemoveImage={onRemoveImage} settings={settings} />}
      {view === "search" && <SmartSearch products={products} periods={periods} settings={settings} images={images} onSaveImage={onSaveImage} onRemoveImage={onRemoveImage} />}
    </div>
  );
});

// ─── قائمة الفروع ────────────────────────────────────────────

const BranchSelector = memo(({ branches, periods, products, settings, onSelect }) => {
  const [search,    setSearch]    = useState("");
  const [sortBy,    setSortBy]    = useState("revenue");
  const [searchMode,  setSearchMode]  = useState("branch"); // branch | barcode
  const [showCamera,  setShowCamera]   = useState(false);

  const branchStats = useMemo(() => {
    return branches.map(branch => {
      let qty = 0, rev = 0;
      const cost = periods.reduce((s, per) => {
        const data = per.sales?.[branch] ?? {};
        Object.values(data).forEach(v => { qty += num(v.qty); rev += num(v.totalPrice); });
        return s + Object.entries(data).reduce((ss, [barcode, v]) => {
          const prod = products.find(p => p.barcode === barcode);
          return ss + num(v.qty) * num(prod?.purchases?.slice(-1)[0]?.buyPrice ?? 0);
        }, 0);
      }, 0);
      const profit = rev - cost;
      const perfLevel = rev > 0
        ? (profit / rev > 0.3 ? "green" : profit / rev > 0.1 ? "amber" : "red")
        : "red";
      return { branch, qty, rev, profit, perfLevel };
    }).sort((a,b) => {
      if (sortBy === "revenue") return b.rev - a.rev;
      if (sortBy === "units")   return b.qty - a.qty;
      if (sortBy === "profit")  return b.profit - a.profit;
      return b.rev - a.rev;
    });
  }, [branches, periods, products, sortBy]);

  // بحث الباركود — يعرض الفروع التي فيها مبيعات لهذا الباركود
  const barcodeResults = useMemo(() => {
    if (searchMode !== "barcode" || !search.trim()) return null;
    const bc = search.trim().toUpperCase();
    return branchStats.map(b => {
      const qty = periods.reduce((s, per) =>
        s + num(per.sales?.[b.branch]?.[bc]?.qty ?? 0), 0);
      const rev = periods.reduce((s, per) =>
        s + num(per.sales?.[b.branch]?.[bc]?.totalPrice ?? 0), 0);
      return { ...b, barcodeQty: qty, barcodeRev: rev };
    }).filter(b => b.barcodeQty > 0).sort((a,b) => b.barcodeQty - a.barcodeQty);
  }, [search, searchMode, branchStats, periods]);

  const filtered = searchMode === "barcode"
    ? (barcodeResults ?? branchStats)
    : branchStats.filter(b => arabicIncludes(b.branch, search));

  const PERF_COLOR = { green: "text-emerald-400", amber: "text-amber-400", red: "text-red-400" };
  const PERF_LABEL = { green: "🟢", amber: "🟡", red: "🔴" };

  return (
    <div className="space-y-3">
      {/* نوع البحث */}
      <div className="flex gap-2">
        <button onClick={() => { setSearchMode("branch"); setSearch(""); }}
          className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors
            ${searchMode==="branch" ? "bg-blue-600 text-white border-blue-500" : "bg-slate-700 text-slate-400 border-slate-600"}`}>
          🏪 بحث فرع
        </button>
        <button onClick={() => { setSearchMode("barcode"); setSearch(""); }}
          className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors
            ${searchMode==="barcode" ? "bg-amber-600 text-white border-amber-500" : "bg-slate-700 text-slate-400 border-slate-600"}`}>
          🔍 بحث باركود
        </button>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <SearchBar value={search} onChange={e => setSearch(e.target.value)}
            placeholder={searchMode === "barcode" ? "أدخل الباركود…" : "🔍 بحث عن فرع…"} />
        </div>
        {searchMode === "barcode" && (
          <button onClick={() => setShowCamera(true)}
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-xl text-amber-400 text-xl">
            📷
          </button>
        )}
      </div>
      {showCamera && (
        <CameraScanner
          products={products}
          onFound={r => { setSearch(r.barcode); setShowCamera(false); }}
          onClose={() => setShowCamera(false)}
        />
      )}

      {searchMode === "branch" && (
        <FilterChips
          label="ترتيب:"
          options={[
            {key:"revenue", label:"الأعلى إيراداً"},
            {key:"units",   label:"الأكثر وحدات"},
            {key:"profit",  label:"الأعلى ربحاً"},
          ]}
          active={sortBy} onChange={setSortBy}
        />
      )}

      {/* نتيجة بحث الباركود */}
      {searchMode === "barcode" && search && barcodeResults !== null && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-3 py-2 text-xs text-amber-300">
          {barcodeResults.length > 0
            ? `${barcodeResults.length} فرع فيه مبيعات لـ ${search}`
            : `لا توجد مبيعات لـ ${search} في أي فرع`}
        </div>
      )}

      <div className="text-xs text-slate-500">{filtered.length} فرع</div>

      <div className="space-y-2">
        {filtered.map(({ branch, qty, rev, profit, perfLevel, barcodeQty, barcodeRev }, i) => (
          <Card key={branch} onClick={() => onSelect(branch)} className="!p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-7 h-7 rounded-full text-xs flex items-center justify-center font-black shrink-0
                ${i===0?"bg-amber-500 text-black":i===1?"bg-slate-400 text-black":i===2?"bg-amber-700 text-white":"bg-slate-700 text-slate-400"}`}>
                {i+1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-100 truncate">{branch}</div>
                {searchMode === "barcode" && barcodeQty > 0 && (
                  <div className="text-xs text-amber-400 mt-0.5">{fmtN(barcodeQty)} وحدة من الباركود</div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="font-black text-emerald-400 text-sm tabular-nums">{fmtM(rev)}</div>
                <div className="text-xs text-slate-500 tabular-nums">{fmtN(qty)} وحدة</div>
                <div className={`text-xs font-bold ${PERF_COLOR[perfLevel]}`}>
                  {PERF_LABEL[perfLevel]} ربح: {fmtM(profit)}
                </div>
              </div>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${
                perfLevel==="green" ? "bg-gradient-to-r from-emerald-500 to-blue-500"
                : perfLevel==="amber" ? "bg-gradient-to-r from-amber-500 to-yellow-500"
                : "bg-gradient-to-r from-red-500 to-rose-500"
              }`} style={{ width: `${filtered[0]?.rev > 0 ? (rev/filtered[0].rev)*100 : 0}%` }} />
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
