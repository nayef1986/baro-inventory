// ============================================================
// Branches.jsx — شاشة الفروع
// ============================================================

import { useState, useMemo, useEffect, memo } from "react";
import {
  Card, Btn, StatPill, EmptyState, ExportBar,
  FilterChips, SearchBar, SectionHeader, BackBtn,
  useToast, fmtN, fmtM, fmtPct,
} from "../components/UI.jsx";
import { ProductImage, CameraScanner } from "../components/ProductImage.jsx";
import {
  allBranches, getFactoryCode, arabicIncludes,
  allContainers, allFactoryCodes, totalPurchases,
  soldAllPeriods, num, getSalesNames,
} from "../lib/calc.js";
import {
  exportBranchNeedReport, printBranchNeedReport,
  exportGeneric, printTrendReport,
} from "../lib/exporters.js";
import SmartRedistribution from "./SmartRedistribution.jsx";
import OfferBuilder from "./OfferBuilder.jsx";

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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 بحث بالمصنع أو الكونتينر…"
          className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500" />
        {search && <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400 text-sm">✕</button>}
      </div>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500">
        <option value="">الكل</option>
        {filtered.map(({ cont, facs }) => [
          <option key={`c-${cont}`} value={`container:${cont}`}>📦 {cont} — الكل</option>,
          ...facs.map(f => (
            <option key={`f-${f}`} value={`factory:${f}`}>　🏭 {f}{settings?.factories?.[f] ? ` · ${settings.factories[f]}` : ""}</option>
          ))
        ])}
      </select>
    </div>
  );
}

// ─── كرت المنتج المفصل في الاحتياج ──────────────────────────

function NeedProductCard({ item, images, onSaveImage, onRemoveImage, settings, closingAll, picked, onTogglePick }) {
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex items-center gap-3 p-3 border-b border-slate-700">
        {onTogglePick && (
          <button onClick={onTogglePick} className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center font-black transition-colors"
            style={{background:picked?"#d4a853":"rgba(255,255,255,0.08)", color:picked?"#0a0804":"transparent", fontSize:"16px"}}>✓</button>
        )}
        <ProductImage barcode={item.barcode} images={images} onSave={onSaveImage} onRemove={onRemoveImage} size="sm" name={item.name} />
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
      <div className="bg-blue-900/10 px-3 py-2 border-b border-slate-700">
        <div className="text-xs text-blue-400 font-bold mb-1.5">📦 المستودع الكلي</div>
        <div className="grid grid-cols-2 gap-2">
          <StatPill label="إجمالي المشتريات" value={fmtN(item.bought)} color="text-blue-400" />
          <StatPill label="المتبقي الكلي" value={fmtN(closingAll)} color={closingAll < 20 ? "text-red-400" : "text-slate-300"} />
        </div>
      </div>
      <div className="bg-amber-900/10 px-3 py-2 border-b border-slate-700">
        <div className="text-xs text-amber-400 font-bold mb-1.5">🏪 هذا الفرع</div>
        <div className="grid grid-cols-3 gap-1">
          <StatPill label="أُعطي أول المدة" value={fmtN(item.given)} color="text-blue-400" />
          <StatPill label="باع الفرع" value={fmtN(item.sold)} color="text-amber-400" />
          <StatPill label="متبقي عنده" value={fmtN(item.remaining)} color={item.remaining === 0 ? "text-red-400" : "text-slate-300"} />
        </div>
      </div>
      <div className="bg-emerald-900/10 px-3 py-2 border-b border-slate-700">
        <div className="text-xs text-emerald-400 font-bold mb-1.5">📊 المبيعات الكلية</div>
        <div className="grid grid-cols-2 gap-2">
          <StatPill label="مباع ككل" value={fmtN(item.totalSoldAll)} color="text-emerald-400" />
          <StatPill label="نسبة البيع" value={fmtPct(item.bought > 0 ? (item.totalSoldAll/item.bought)*100 : 0)} color="text-amber-400" />
        </div>
      </div>
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
  const search = useMemo(() => {
    if (!query || query.length < 2) return null;
    const q = query.toLowerCase().trim();
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
    const byFactory = products.filter(p => {
      const code = getFactoryCode(p.barcode).toLowerCase();
      const name = (settings?.factories?.[getFactoryCode(p.barcode)] ?? "").toLowerCase();
      return code.includes(q) || name.includes(q);
    });
    if (byFactory.length > 0) {
      const factoryCode = getFactoryCode(byFactory[0].barcode);
      return {
        type: "factory", factoryCode,
        factoryName: settings?.factories?.[factoryCode] ?? "",
        containers: [...new Set(byFactory.map(p => p.container))],
        products: byFactory,
      };
    }
    const byContainer = products.filter(p => p.container.toLowerCase().includes(q));
    if (byContainer.length > 0) {
      const factories = [...new Set(byContainer.map(p => getFactoryCode(p.barcode)).filter(Boolean))];
      return {
        type: "container", container: byContainer[0].container,
        factories: factories.map(f => ({ code: f, name: settings?.factories?.[f] ?? "", products: byContainer.filter(p => getFactoryCode(p.barcode) === f) })),
        products: byContainer,
      };
    }
    return { type: "empty" };
  }, [query, products, periods, settings]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="🔍 باركود · مصنع · كونتينر…"
            className="w-full bg-slate-800 border-2 border-slate-600 focus:border-blue-500 text-slate-100 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none placeholder-slate-500 transition-colors" />
          {query && <button onClick={() => setQuery("")} className="absolute left-4 top-1/2 -translate-y-1/2 text-red-400">✕</button>}
        </div>
        <label className="w-12 h-12 bg-blue-600 hover:bg-blue-500 rounded-2xl flex items-center justify-center cursor-pointer transition-colors shrink-0">
          <span className="text-xl">📷</span>
          <input type="file" accept="image/*" capture="environment" className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = async (ev) => {
                try {
                  const response = await fetch("/api/scan-barcode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64: ev.target.result }) });
                  const data = await response.json();
                  if (data.barcode) setQuery(data.barcode); else alert("لم يُعثر على باركود في الصورة");
                } catch { alert("خطأ في القراءة"); }
              };
              reader.readAsDataURL(file);
              e.target.value = "";
            }} />
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
                    {p.neededIn.map(b => <span key={b} className="text-xs bg-amber-900/30 text-amber-300 border border-amber-700/40 rounded-lg px-2 py-0.5">{b}</span>)}
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
            <div className="flex gap-3 text-xs mt-2"><span className="text-blue-400">{search.products.length} منتج</span><span className="text-slate-400">{search.containers.join(" · ")}</span></div>
          </div>
          <div className="space-y-2">
            {search.products.slice(0, 20).map(p => (
              <Card key={p.barcode} className="!p-3">
                <div className="flex items-center gap-3">
                  <ProductImage barcode={p.barcode} images={images} onSave={onSaveImage} onRemove={onRemoveImage} size="sm" name={p.name} />
                  <div className="flex-1 min-w-0"><div className="font-bold text-slate-100 text-sm truncate">{p.name}</div><div className="font-mono text-blue-400 text-xs">{p.barcode}</div></div>
                  <div className="text-right shrink-0"><div className="text-xs text-slate-400">📦 {p.container}</div></div>
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
                    <div className="flex-1 min-w-0"><div className="font-bold text-slate-100 text-sm truncate">{p.name}</div><div className="font-mono text-blue-400 text-xs">{p.barcode}</div></div>
                  </div>
                </Card>
              ))}
            </div>
          ))}
        </div>
      )}
      {search && search.type === "empty" && <div className="text-center py-6 text-slate-500 text-sm">لا توجد نتائج</div>}
    </div>
  );
}

// ─── شاشة الاحتياج ───────────────────────────────────────────

const NeedSection = memo(({ branch, products, periods, images, onSaveImage, onRemoveImage, settings }) => {
  const [minStock, setMinStock] = useState(settings?.minStock ?? 12);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("weak");  // weak | strong | hero
  const [openCont, setOpenCont] = useState({});
  const [openFac, setOpenFac] = useState({});
  const [picked, setPicked] = useState([]);
  const [showOffer, setShowOffer] = useState(false);
  const [viewImg, setViewImg] = useState(null);
  const { show, ToastContainer } = useToast();
  const togglePick = (bc) => setPicked(s => s.includes(bc) ? s.filter(x=>x!==bc) : [...s, bc]);

  const starred = settings?.starred ?? [];

  // احتياج الفرع: كل منتج باعه الفرع (باع/أخذ/باقي) + بياناته
  const allItems = useMemo(() => {
    if (!periods.length) return [];
    const branchData = {};
    const soldAllIndex = {};
    periods.forEach(per => {
      const bd = per.sales?.[branch] ?? {};
      Object.keys(bd).forEach(bc => { branchData[bc] = (branchData[bc] ?? 0) + num(bd[bc]?.qty ?? 0); });
      Object.values(per.sales ?? {}).forEach(d => {
        Object.keys(d).forEach(bc => { soldAllIndex[bc] = (soldAllIndex[bc] ?? 0) + num(d[bc]?.qty ?? 0); });
      });
    });
    return products
      .filter(p => (branchData[p.barcode] ?? 0) > 0)
      .map(p => {
        const sold = num(branchData[p.barcode] ?? 0);
        const dozens = Math.ceil(sold / minStock);
        const given = dozens * minStock;
        const remaining = Math.max(0, given - sold);
        const needQty = Math.max(0, minStock - remaining);
        const bought = totalPurchases(p);
        const allSold = soldAllIndex[p.barcode] ?? 0;
        const closingAll = Math.max(0, bought - allSold);
        const buyPrice = num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
        const sellPrice = num(p.sellPrice);
        const soldPct = bought > 0 ? (allSold/bought)*100 : 0;
        const margin = buyPrice > 0 ? ((sellPrice-buyPrice)/buyPrice)*100 : 0;
        const isHero = (soldPct > 70 && margin > 20) || starred.includes(p.barcode);
        return { ...p, sold, given, remaining, needQty, closingAll, bought, totalSoldAll: allSold, buyPrice, sellPrice, soldPct, margin, isHero };
      });
  }, [products, branch, minStock, periods, starred]);

  // بحث (باركود/اسم/مصنع)
  const searched = useMemo(() => {
    if (!search) return allItems;
    const s = search.toLowerCase();
    return allItems.filter(i =>
      i.barcode.toLowerCase().includes(s) ||
      (i.name ?? "").toLowerCase().includes(s) ||
      getFactoryCode(i.barcode).includes(s)
    );
  }, [allItems, search]);

  // ترتيب المنتجات داخل المصنع
  const sortItems = (arr) => {
    if (sortBy === "hero") return [...arr].sort((a,b)=>(b.isHero?1:0)-(a.isHero?1:0) || b.soldPct-a.soldPct);
    if (sortBy === "strong") return [...arr].sort((a,b)=>b.soldPct-a.soldPct);
    return [...arr].sort((a,b)=>a.soldPct-b.soldPct); // weak
  };

  // تجميع هرمي: كونتينر ← مصنع ← منتجات
  const grouped = useMemo(() => {
    const map = {};
    searched.forEach(i => {
      const cont = i.container ?? "بدون كونتينر";
      const fac = getFactoryCode(i.barcode) || "—";
      if (!map[cont]) map[cont] = {};
      if (!map[cont][fac]) map[cont][fac] = [];
      map[cont][fac].push(i);
    });
    const conts = Object.entries(map).map(([cont, facs]) => {
      const factories = Object.entries(facs).map(([fac, items]) => {
        const sold = items.reduce((s,x)=>s+x.totalSoldAll,0);
        const bought = items.reduce((s,x)=>s+x.bought,0);
        const soldPct = bought>0 ? (sold/bought)*100 : 0;
        return { fac, items: sortItems(items), soldPct, count: items.length };
      });
      // ترتيب المصانع
      factories.sort((a,b)=> sortBy==="strong" ? b.soldPct-a.soldPct : sortBy==="hero" ? b.soldPct-a.soldPct : a.soldPct-b.soldPct);
      const count = factories.reduce((s,f)=>s+f.count,0);
      return { cont, factories, count };
    });
    return conts.sort((a,b)=>b.count-a.count);
  }, [searched, sortBy, minStock]);

  // المنتجات المختارة للعرض
  const pickedItems = useMemo(
    () => picked.map(bc => allItems.find(i => i.barcode === bc)).filter(Boolean),
    [picked, allItems]
  );

  if (showOffer) {
    return <OfferBuilder items={pickedItems} images={images} settings={settings} onClose={()=>setShowOffer(false)} />;
  }

  const colorOf = (pct) => pct < 30 ? "#ef4444" : pct < 60 ? "#f59e0b" : "#22c55e";

  // بطاقة منتج
  const ProductRow = (x) => {
    const isPicked = picked.includes(x.barcode);
    const c = colorOf(x.soldPct);
    const img = images?.[x.barcode];
    return (
      <div key={x.barcode} style={{
        background: isPicked ? "rgba(212,168,83,0.12)" : "rgba(255,255,255,0.03)",
        border: isPicked ? "2px solid #d4a853" : `1px solid ${c}40`,
        borderRadius:"12px", padding:"10px",
      }}>
        <div className="flex items-center gap-2.5">
          <button onClick={()=>togglePick(x.barcode)} className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center font-black"
            style={{background:isPicked?"#d4a853":"rgba(255,255,255,0.08)",color:isPicked?"#0a0804":"transparent",fontSize:"15px",border:"none",cursor:"pointer"}}>✓</button>
          {img
            ? <img src={img} alt="" onClick={()=>setViewImg({src:img,name:x.name})} className="w-14 h-14 rounded-lg object-cover shrink-0 cursor-pointer" />
            : <div className="w-14 h-14 rounded-lg bg-slate-700 flex items-center justify-center text-xl shrink-0">📦</div>}
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-100 text-sm leading-tight flex items-center gap-1">
              {x.isHero && <span>⭐</span>}{x.name}
            </div>
            <div className="text-xs text-slate-500 font-mono mt-0.5">{x.barcode}</div>
          </div>
          <div className="text-left shrink-0">
            <div style={{fontSize:"17px",fontWeight:"900",color:c}}>{Math.round(x.soldPct)}%</div>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap mt-2">
          <span className="text-xs px-2 py-0.5 rounded-lg bg-amber-900/30 text-amber-300">باع {fmtN(x.sold)}</span>
          <span className="text-xs px-2 py-0.5 rounded-lg bg-blue-900/30 text-blue-300">أخذ {fmtN(x.given)}</span>
          <span className="text-xs px-2 py-0.5 rounded-lg bg-emerald-900/30 text-emerald-300">باقي {fmtN(x.remaining)}</span>
          <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-700 text-slate-300">بيع {fmtN(x.sellPrice)}﷼</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <ToastContainer />
      {viewImg && (
        <div onClick={()=>setViewImg(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px"}}>
          <img src={viewImg.src} alt="" onClick={e=>e.stopPropagation()} style={{maxWidth:"100%",maxHeight:"70vh",borderRadius:"14px",objectFit:"contain"}} />
          {viewImg.name && <div style={{color:"#fff",fontWeight:"700",marginTop:"12px",textAlign:"center"}}>{viewImg.name}</div>}
          <div style={{display:"flex",gap:"10px",marginTop:"16px"}} onClick={e=>e.stopPropagation()}>
            <button onClick={async()=>{
              try {
                const res = await fetch(viewImg.src); const blob = await res.blob();
                const fn = (viewImg.name||"image").replace(/[^\w\u0600-\u06FF]/g,"_")+".jpg";
                if (navigator.canShare) {
                  const file = new File([blob], fn, {type:blob.type});
                  if (navigator.canShare({files:[file]})) { await navigator.share({files:[file]}); return; }
                }
                const url = URL.createObjectURL(blob); const a = document.createElement("a");
                a.href = url; a.download = fn; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
              } catch { alert("اضغط مطوّل على الصورة لحفظها"); }
            }} style={{padding:"11px 22px",borderRadius:"100px",border:"none",background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff",fontSize:"14px",fontWeight:"900",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>💾 حفظ الصورة</button>
            <button onClick={()=>setViewImg(null)} style={{padding:"11px 22px",borderRadius:"100px",border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.1)",color:"#fff",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>إغلاق</button>
          </div>
        </div>
      )}

      {/* بحث */}
      <div className="relative">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 بحث بالباركود أو الاسم أو المصنع…"
          className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500" />
        {search && <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400 text-sm">✕</button>}
      </div>

      {/* ترتيب */}
      <div className="flex gap-1.5">
        {[["weak","🔴 الأضعف"],["strong","🟢 الأقوى"],["hero","⭐ البطل"]].map(([k,l]) => (
          <button key={k} onClick={()=>setSortBy(k)}
            className="flex-1 py-2 rounded-xl text-xs font-bold transition-colors"
            style={{
              background: sortBy===k ? "rgba(212,168,83,0.2)" : "rgba(255,255,255,0.05)",
              color: sortBy===k ? "#d4a853" : "rgba(255,255,255,0.4)",
              border: sortBy===k ? "1px solid rgba(212,168,83,0.4)" : "1px solid rgba(255,255,255,0.08)",
            }}>{l}</button>
        ))}
      </div>

      {/* الحد الأدنى */}
      <div className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5">
        <span className="text-xs text-slate-400 font-bold">الحد الأدنى للفرع:</span>
        <input type="number" value={minStock} min={1} max={100} onChange={e => setMinStock(Math.max(1, Number(e.target.value) || 12))}
          className="w-16 bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-2 py-1.5 text-sm font-black text-center focus:outline-none focus:border-blue-500" />
        <span className="text-xs text-slate-400">قطعة (دزينة)</span>
      </div>

      {/* تصدير + طباعة */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => { const r = exportBranchNeedReport(branch, searched, products); if (r && !r.ok) show(r.error, "error"); else show("تم التصدير ✓"); }}
          className="flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors">
          📊 تصدير Excel
        </button>
        <button onClick={() => { const r = printBranchNeedReport(branch, searched, settings?.brandName); if (r && !r.ok) show(r.error, "error"); }}
          className="flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 py-2.5 rounded-xl text-sm font-bold transition-colors">
          🖨️ طباعة تقرير
        </button>
      </div>

      <div className="text-xs text-slate-500">{searched.length} منتج · {grouped.length} كونتينر · اضغط ✓ لعرض</div>

      {/* الكونتينرات الهرمية */}
      <div className="space-y-2" style={{marginBottom: picked.length>0 ? "80px" : "0"}}>
        {grouped.map(({cont, factories, count}) => {
          const contOpen = openCont[cont];
          return (
            <div key={cont} className="bg-slate-800/40 border border-slate-700 rounded-2xl overflow-hidden">
              <div onClick={()=>setOpenCont(o=>({...o,[cont]:!o[cont]}))} className="flex items-center justify-between p-3.5 cursor-pointer">
                <div className="font-black text-slate-100">📦 {cont}</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{count} منتج</span>
                  <span className="text-slate-500">{contOpen?"▲":"▼"}</span>
                </div>
              </div>
              {contOpen && factories.map(({fac, items, soldPct, count:fc}) => {
                const facKey = cont+"_"+fac;
                const facOpen = openFac[facKey];
                const fcColor = colorOf(soldPct);
                const facName = settings?.factories?.[fac] ?? "";
                return (
                  <div key={facKey} className="border-t border-slate-700/50">
                    <div onClick={()=>setOpenFac(o=>({...o,[facKey]:!o[facKey]}))} className="flex items-center justify-between py-2.5 px-4 cursor-pointer" style={{background:"rgba(0,0,0,0.2)",paddingRight:"24px"}}>
                      <div className="text-sm font-bold" style={{color:fcColor}}>🏭 {fac}{facName?` · ${facName}`:""}</div>
                      <div className="flex items-center gap-2">
                        <span style={{fontSize:"13px",fontWeight:"900",color:fcColor}}>{Math.round(soldPct)}%</span>
                        <span className="text-xs text-slate-500">{fc} {facOpen?"▲":"▼"}</span>
                      </div>
                    </div>
                    {facOpen && (
                      <div className="p-2.5 space-y-2">
                        {items.map(x => ProductRow(x))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        {searched.length === 0 && <EmptyState icon="✅" title="لا يوجد احتياج" />}
      </div>

      {/* شريط أنشئ عرض */}
      {picked.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 px-4 z-40" style={{maxWidth:"480px",margin:"0 auto"}}>
          <div className="flex gap-2">
            <button onClick={()=>setPicked([])} className="px-4 py-3.5 rounded-2xl bg-slate-700 text-slate-300 text-sm font-bold border border-slate-600">✕</button>
            <button onClick={()=>setShowOffer(true)}
              className="flex-1 py-3.5 rounded-2xl border-none text-black font-black text-base"
              style={{background:"linear-gradient(135deg,#d4a853,#b8935a)",boxShadow:"0 8px 24px rgba(0,0,0,0.4)"}}>
              🏷️ أنشئ عرض ({picked.length})
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

// ─── شاشة قوي/ضعيف ───────────────────────────────────────────

const TopBottomSection = memo(({ branch, products, periods, images, onSaveImage, onRemoveImage, settings }) => {
  const [periodId, setPeriodId] = useState(periods[periods.length-1]?.id ?? "");
  const [sortBy, setSortBy] = useState("sold");
  const [topN, setTopN] = useState(10);
  const [filterVal, setFilterVal] = useState("");
  const { show, ToastContainer } = useToast();
  const period = periods.find(p => p.id === periodId) ?? null;

  const items = useMemo(() => {
    if (!period) return [];
    const branchData = period.sales?.[branch] ?? {};
    return products.filter(p => branchData[p.barcode]).map(p => {
      const sold = num(branchData[p.barcode]?.qty ?? 0);
      const rev = num(branchData[p.barcode]?.totalPrice ?? 0);
      const bought = totalPurchases(p);
      const soldPct = bought > 0 ? (sold/bought)*100 : 0;
      return { ...p, sold, rev, soldPct };
    });
  }, [products, period, branch]);

  const [barcodeSearch2, setBarcodeSearch2] = useState("");
  const filterItems2 = (list) => {
    let result = list;
    if (filterVal) {
      const [type, val] = filterVal.split(":");
      if (type === "container") result = result.filter(p => p.container === val);
      if (type === "factory") result = result.filter(p => getFactoryCode(p.barcode) === val);
    }
    if (barcodeSearch2) {
      const s = barcodeSearch2.toLowerCase();
      result = result.filter(p => p.barcode.toLowerCase().includes(s) || p.name.toLowerCase().includes(s));
    }
    return result;
  };
  const sorted = [...filterItems2(items)].sort((a,b) => sortBy === "sold" ? b.sold - a.sold : b.soldPct - a.soldPct);
  const top = sorted.slice(0, topN);
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
        <div className="flex-1 min-w-0"><div className="font-bold text-slate-100 text-sm truncate">{p.name}</div><div className="text-xs text-slate-400 font-mono">{p.barcode}</div></div>
        <div className="text-right shrink-0"><div className={`text-lg font-black tabular-nums ${mode==="top"?"text-emerald-400":"text-red-400"}`}>{fmtN(p.sold)}</div><div className="text-xs text-amber-400">{fmtPct(p.soldPct)}</div></div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <ToastContainer />
      <select value={periodId} onChange={e => setPeriodId(e.target.value)} className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
        {[...periods].reverse().map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <div className="relative">
        <input value={barcodeSearch2} onChange={e => setBarcodeSearch2(e.target.value)} placeholder="🔍 بحث بالباركود…"
          className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500" />
        {barcodeSearch2 && <button onClick={() => setBarcodeSearch2("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400 text-sm">✕</button>}
      </div>
      <GroupedFilter products={products} settings={settings} value={filterVal} onChange={setFilterVal} />
      <div className="flex items-center gap-3 flex-wrap">
        <FilterChips label="قياس:" options={[{key:"sold",label:"الأكثر مبيعاً"},{key:"pct",label:"الأعلى نسبة"}]} active={sortBy} onChange={setSortBy} />
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500">أفضل</span>
          <input type="number" min={3} max={50} value={topN} onChange={e => setTopN(Math.min(50, Math.max(3, Number(e.target.value)||10)))}
            className="w-12 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-1 py-1 text-sm font-black text-center focus:outline-none" />
        </div>
      </div>
      {period ? (
        <>
          <Card>
            <div className="flex justify-between items-center mb-2">
              <SectionHeader icon="🔥" title={`الأقوى (${top.length})`} />
              <div className="flex gap-2">
                <button onClick={exportTop} className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-sm transition-colors"><span>📊</span><span>Excel</span></button>
                <button onClick={() => show("الطباعة قريباً", "info")} className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 px-4 py-2 rounded-xl font-bold text-sm transition-colors"><span>🖨️</span><span>طباعة</span></button>
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
                <button onClick={exportBottom} className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-sm transition-colors"><span>📊</span><span>Excel</span></button>
                <button onClick={() => show("الطباعة قريباً", "info")} className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 px-4 py-2 rounded-xl font-bold text-sm transition-colors"><span>🖨️</span><span>طباعة</span></button>
              </div>
            </div>
            <div className="space-y-2">
              {bottom.map((p,i) => <ProductRow key={p.barcode} p={p} rank={i+1} mode="bottom" />)}
              {bottom.length === 0 && <div className="text-center text-slate-500 text-sm py-3">لا توجد بيانات</div>}
            </div>
          </Card>
        </>
      ) : <EmptyState icon="📅" title="اختر فترة" />}
    </div>
  );
});
// ─── قسم النقل (هرمي: مصنع → منتج بعلامات) ──────────────────
const TransferSection = memo(({ branch, products, periods, images, settings, onSaveSettings }) => {
  const [factory, setFactory] = useState(null);
  const [minPct, setMinPct] = useState(40); // نسبة الفائض (تتحكم فيها)
  const [search, setSearch] = useState("");
  const [sourcesFor, setSourcesFor] = useState(null); // باركود المنتج المعروض مصادره
  const [reservations, setReservations] = useState(settings?.transfers ?? []); // الحجوزات

  // المحجوز من فرع معيّن لمنتج معيّن (لخصمه من الفائض)
  const reservedFrom = (fromBranch, barcode) =>
    reservations.filter(r => r.from===fromBranch && r.barcode===barcode).reduce((s,r)=>s+r.qty, 0);

  // حجز نقل (يُخصم من الفائض + يُحفظ)
  const book = async (barcode, name, from, toQty, available) => {
    const qty = Math.min(toQty, available);
    if (qty <= 0) return;
    const next = [...reservations, { barcode, name, from, to: branch, qty, ts: Date.now() }];
    setReservations(next);
    if (onSaveSettings) await onSaveSettings({ ...settings, transfers: next });
    setSourcesFor(null);
  };

  // إلغاء حجز
  const unbook = async (idx) => {
    const next = reservations.filter((_,i)=>i!==idx);
    setReservations(next);
    if (onSaveSettings) await onSaveSettings({ ...settings, transfers: next });
  };

  // طباعة خطة النقل المحجوزة لهذا الفرع — مرتّبة بالفرع المصدر
  const printPlan = () => {
    const mine = reservations.filter(r => r.to === branch);
    if (mine.length === 0) { alert("لا توجد حجوزات"); return; }
    // نجمّع بالفرع المصدر
    const bySource = {};
    mine.forEach(r => { if (!bySource[r.from]) bySource[r.from] = []; bySource[r.from].push(r); });
    const now = new Date();
    const greg = now.toLocaleDateString("ar-SA-u-ca-gregory", {year:"numeric",month:"long",day:"numeric"});
    const hijri = now.toLocaleDateString("ar-SA-u-ca-islamic", {year:"numeric",month:"long",day:"numeric"});
    const ref = "TR-" + now.getFullYear() + (now.getMonth()+1+"").padStart(2,"0") + (now.getDate()+"").padStart(2,"0") + "-" + (now.getHours()+"").padStart(2,"0")+(now.getMinutes()+"").padStart(2,"0");
    const totQty = mine.reduce((s,r)=>s+r.qty,0);
    const imgCell = (bc) => { const im = images?.[bc]; return im ? `<img src="${im}" class="th"/>` : `<div class="noimg">📦</div>`; };
    const sections = Object.entries(bySource).map(([src, rows], idx) => `
      <div class="sheet">
        <div class="hd">
          <div><div class="brand">${settings?.brandName ?? "ALBAROO"}</div><div class="ttl">📋 خطة نقل وتجميع</div></div>
          <div class="ref"><b>${ref}</b><br>📅 ${greg}<br>📅 ${hijri}هـ</div>
        </div>
        <div class="route">من فرع: <b>${src}</b> &nbsp;←&nbsp; إلى فرع: <b class="dest">${branch}</b></div>
        <div class="sech">🏪 اجمع من ${src} <span class="cnt">${rows.length} صنف · ${fmtN(rows.reduce((s,r)=>s+r.qty,0))} قطعة</span></div>
        <table><thead><tr><th>✓</th><th>صورة</th><th>الصنف</th><th>الباركود</th><th>الكمية</th></tr></thead><tbody>
        ${rows.map(r=>`<tr><td class="chk">☐</td><td class="imgc">${imgCell(r.barcode)}</td><td class="nm">${r.name}</td><td class="bc">${r.barcode}</td><td class="q">${fmtN(r.qty)}</td></tr>`).join("")}
        </tbody></table>
        <div class="ftr"><div class="sign"><div class="line"></div>أمين فرع ${src}</div><div class="sign"><div class="line"></div>مستلم فرع ${branch}</div></div>
      </div>`).join("");
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>خطة النقل — إلى ${branch}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        *{font-family:'Cairo',sans-serif;box-sizing:border-box;margin:0;padding:0}
        body{background:#f1f5f9;color:#1a1a1a}
        .tb{position:fixed;top:0;left:0;right:0;background:#0f172a;padding:10px;display:flex;gap:10px;justify-content:center;z-index:99}
        .tb button{font-family:'Cairo';font-size:14px;font-weight:700;border:none;border-radius:10px;padding:10px 20px;cursor:pointer}
        .bk{background:#334155;color:#fff}.pr{background:#2563eb;color:#fff}
        .page{max-width:800px;margin:70px auto 30px;background:#fff;padding:24px;border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
        .hd{display:flex;justify-content:space-between;border-bottom:3px solid #0f172a;padding-bottom:14px;margin-bottom:18px}
        .brand{font-size:24px;font-weight:900;color:#0f172a;letter-spacing:2px}
        .ttl{font-size:15px;color:#475569;margin-top:2px}
        .to{font-size:14px;color:#2563eb;font-weight:900;margin-top:4px}
        .ref{text-align:left;font-size:12px;color:#64748b;line-height:1.7}.ref b{color:#0f172a}
        .sum{background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:12px;text-align:center;margin-bottom:18px}
        .sum b{font-size:22px;color:#0f172a}
        .sec{margin-bottom:20px;page-break-inside:avoid}
        .sech{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;padding:11px 16px;border-radius:10px 10px 0 0;font-weight:900;font-size:14px;display:flex;justify-content:space-between;align-items:center}
        .cnt{font-size:12px;background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:100px}
        table{width:100%;border-collapse:collapse}
        th{background:#e2e8f0;padding:8px;font-size:11px;color:#334155}
        td{border:1px solid #e2e8f0;padding:7px;text-align:center;font-size:12px;vertical-align:middle}
        td.chk{font-size:18px;color:#94a3b8;width:30px}td.imgc{width:50px;padding:3px}
        .th{width:44px;height:44px;object-fit:cover;border-radius:7px;border:1px solid #e2e8f0}
        .noimg{width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:20px;background:#f1f5f9;border-radius:7px;margin:0 auto}
        td.nm{text-align:right;font-weight:700;color:#0f172a}td.bc{font-family:monospace;font-size:10px;color:#64748b}
        td.q{font-size:18px;font-weight:900;color:#2563eb}
        tr:nth-child(even) td{background:#fafbfc}
        .ftr{margin-top:24px;border-top:2px solid #e2e8f0;padding-top:16px;display:flex;justify-content:space-between}
        .sign{text-align:center;font-size:12px;color:#64748b}.sign .line{border-top:1px solid #94a3b8;width:150px;margin:28px auto 6px}
        .sheet{max-width:800px;margin:0 auto 24px;background:#fff;padding:24px;border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
        .route{background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:12px;text-align:center;font-size:15px;margin-bottom:14px}
        .route b{color:#0f172a}.route .dest{color:#2563eb}
        @media print{body{background:#fff}.tb{display:none}.sheet{margin:0;box-shadow:none;border-radius:0;max-width:100%;page-break-after:always}.sheet:last-child{page-break-after:auto}}
      </style></head><body>
      <div class="tb"><button class="bk" onclick="window.close();history.back()">← رجوع</button><button class="pr" onclick="window.print()">🖨️ طباعة (${Object.keys(bySource).length} صفحة)</button></div>
      ${sections}
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  // يحسب الفروع اللي عندها فائض من منتج معيّن (عند الطلب فقط — خفيف)
  const findSources = (barcode) => {
    const sources = [];
    const closed = settings?.closedBranches ?? [];
    const allB = allBranches(periods);
    allB.forEach(b => {
      if (b === branch) return; // مو نفس الفرع المحتاج
      if (closed.includes(b)) return; // الفرع المغلق ما ننقل منه
      let sold = 0;
      periods.forEach(per => { sold += num(per.sales?.[b]?.[barcode]?.qty ?? 0); });
      if (sold <= 0) return;
      const given = Math.ceil(sold / 12) * 12;
      const reserved = reservedFrom(b, barcode); // المحجوز مسبقاً
      const remaining = given - sold - reserved; // الفائض المتاح (بعد الحجز)
      const sPct = given > 0 ? (sold/given)*100 : 0;
      if (sPct < minPct && remaining >= 7) {
        sources.push({ branch: b, sold, remaining, soldPct: sPct });
      }
    });
    return sources.sort((a,b)=>b.remaining-a.remaining);
  };

  // مبيعات الفرع لكل منتج (كل الفترات)
  const branchData = useMemo(() => {
    const map = {};
    periods.forEach(per => {
      const d = per.sales?.[branch] ?? {};
      Object.keys(d).forEach(bc => { map[bc] = (map[bc] ?? 0) + num(d[bc]?.qty ?? 0); });
    });
    return map;
  }, [periods, branch]);

  // منتجات الفرع محسوبة (باع/أخذ/متبقي + الحالة)
  const branchProducts = useMemo(() => {
    return products
      .filter(p => (branchData[p.barcode] ?? 0) > 0)
      .map(p => {
        const sold = branchData[p.barcode] ?? 0;
        const given = Math.ceil(sold / 12) * 12;
        const remaining = Math.max(0, given - sold);
        const soldPct = given > 0 ? (sold / given) * 100 : 0;
        const bought = totalPurchases(p);
        const allSold = soldAllPeriods(p.barcode, periods);
        const closing = Math.max(0, bought - allSold);
        return {
          ...p, sold, given, remaining, soldPct, bought, closing,
          buyPrice: num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0),
          sellPrice: num(p.sellPrice),
          factory: getFactoryCode(p.barcode),
          needTransfer: remaining < 7,   // محتاج
          hasSurplus: soldPct < minPct && remaining >= 7, // فائض
        };
      });
  }, [products, branchData, periods, minPct]);

  // مصانع الفرع (بعدّاد المحتاج نقل)
  const factories = useMemo(() => {
    const map = {};
    branchProducts.forEach(p => {
      const f = p.factory;
      if (!map[f]) map[f] = { code:f, name: settings?.factories?.[f] ?? "", items:[], needCount:0 };
      map[f].items.push(p);
      if (p.needTransfer) map[f].needCount++;
    });
    return Object.values(map).sort((a,b)=>b.needCount-a.needCount);
  }, [branchProducts, settings]);

  // منتجات المصنع المختار
  const facItems = useMemo(() => {
    if (!factory) return [];
    const f = factories.find(x=>x.code===factory);
    let list = f ? f.items : [];
    if (search) list = list.filter(p => p.barcode.includes(search) || arabicIncludes(p.name, search));
    return list.sort((a,b)=> (b.needTransfer?1:0)-(a.needTransfer?1:0) || a.remaining-b.remaining);
  }, [factory, factories, search]);

  // عرض منتجات المصنع
  if (factory) {
    const f = factories.find(x=>x.code===factory);
    return (
      <div className="space-y-3">
        <button onClick={()=>setFactory(null)} className="text-blue-400 font-bold text-sm">← رجوع للمصانع</button>
        <div className="font-black text-slate-100">🏭 {f?.code}{f?.name?` · ${f.name}`:""}</div>
        <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl p-3">
          <span className="text-xs text-slate-400 font-bold">الفائض: باع أقل من</span>
          <input type="number" value={minPct} onChange={e=>setMinPct(Math.max(0,Math.min(100,Number(e.target.value)||0)))} className="w-14 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-2 py-1 text-sm font-black text-center" />
          <span className="text-xs text-slate-400">%</span>
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 بحث…" className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
        <div className="space-y-2">
          {facItems.map(p => {
            const soldOut = p.closing <= 0;
            const col = p.needTransfer ? "#ef4444" : p.hasSurplus ? "#22c55e" : "#64748b";
            return (
              <div key={p.barcode} style={{background:`${col}10`,border:`1.5px solid ${col}${soldOut?"40":"60"}`,borderRadius:"14px",padding:"12px",position:"relative",opacity:soldOut?0.7:1}}>
                {/* علامات */}
                {soldOut && <div style={{position:"absolute",top:"-9px",left:"10px",background:"#64748b",color:"#fff",fontSize:"10px",fontWeight:"900",padding:"2px 8px",borderRadius:"100px"}}>SOLD OUT</div>}
                {!soldOut && p.needTransfer && <div style={{position:"absolute",top:"-9px",left:"10px",background:"#ef4444",color:"#fff",fontSize:"10px",fontWeight:"900",padding:"2px 8px",borderRadius:"100px"}}>🔴 محتاج نقل</div>}
                {!soldOut && p.hasSurplus && <div style={{position:"absolute",top:"-9px",left:"10px",background:"#22c55e",color:"#fff",fontSize:"10px",fontWeight:"900",padding:"2px 8px",borderRadius:"100px"}}>🟢 فائض متوفّر</div>}
                <div className="flex items-start gap-3">
                  {images?.[p.barcode]
                    ? <img src={images[p.barcode]} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" style={{filter:soldOut?"grayscale(1)":"none"}} />
                    : <div className="w-14 h-14 rounded-lg bg-slate-700 flex items-center justify-center text-xl shrink-0">📦</div>}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-100 text-sm leading-tight">{p.name}</div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">{p.barcode}</div>
                  </div>
                  <div style={{fontSize:"20px",fontWeight:"900",color:col}} className="shrink-0">{fmtPct(p.soldPct)}</div>
                </div>
                <div className="flex gap-1.5 flex-wrap mt-2">
                  <span className="text-xs px-2 py-0.5 rounded-lg bg-blue-900/30 text-blue-300">باع {fmtN(p.sold)}</span>
                  <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-700 text-slate-300">أخذ {fmtN(p.given)}</span>
                  <span className="text-xs px-2 py-0.5 rounded-lg bg-amber-900/30 text-amber-300">متبقي {fmtN(p.remaining)}</span>
                </div>
                {/* متوفّر في فروع — للمنتج المحتاج */}
                {p.needTransfer && (
                  <div className="mt-2">
                    <button onClick={()=>setSourcesFor(sourcesFor===p.barcode?null:p.barcode)}
                      className="w-full bg-blue-900/30 border border-blue-700/40 text-blue-300 py-2 rounded-lg text-xs font-bold">
                      {sourcesFor===p.barcode ? "▲ إخفاء المصادر" : "🔍 متوفّر في فروع؟"}
                    </button>
                    {sourcesFor===p.barcode && (() => {
                      const sources = findSources(p.barcode);
                      return (
                        <div className="mt-2 space-y-1">
                          {sources.length === 0 ? (
                            <div className="text-xs text-slate-500 text-center py-2">🏬 غير متوفّر بفائض في الفروع — اطلبه من المستودع</div>
                          ) : sources.map(s => (
                            <div key={s.branch} className="flex items-center justify-between bg-emerald-900/15 border border-emerald-800/30 rounded-lg px-3 py-2">
                              <div className="text-xs text-emerald-300 font-bold">🏪 {s.branch}</div>
                              <div className="flex items-center gap-2">
                                <div className="text-xs text-slate-300">فائض <b className="text-emerald-400">{fmtN(s.remaining)}</b></div>
                                <button onClick={()=>book(p.barcode, p.name, s.branch, Math.max(7, p.given - p.remaining) || 12, s.remaining)}
                                  className="bg-blue-600 text-white text-xs px-3 py-1 rounded-lg font-bold">احجز</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
          {facItems.length===0 && <div className="text-center text-slate-500 py-6">لا منتجات</div>}
        </div>
      </div>
    );
  }

  // عرض المصانع (بعدّاد)
  return (
    <div className="space-y-3">
      {/* خطة النقل المحجوزة لهذا الفرع */}
      {reservations.filter(r=>r.to===branch).length > 0 && (
        <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl p-3">
          <div className="text-sm font-black text-blue-300 mb-2">📋 محجوز لهذا الفرع ({reservations.filter(r=>r.to===branch).length})</div>
          <div className="space-y-1">
            {reservations.map((r,idx)=> r.to===branch && (
              <div key={idx} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-100 truncate">{r.name}</div>
                  <div className="text-xs text-emerald-300">من 🏪 {r.from} · {fmtN(r.qty)} قطعة</div>
                </div>
                <button onClick={()=>unbook(idx)} className="text-red-400 text-xs px-2 py-1 shrink-0">✕ إلغاء</button>
              </div>
            ))}
          </div>
          <button onClick={printPlan} className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-bold mt-2">🖨️ اطبع خطة النقل</button>
        </div>
      )}
      <div className="text-xs text-slate-500">{factories.length} مصنع في هذا الفرع</div>
      <div className="space-y-2">
        {factories.map(f => {
          const col = f.needCount > 0 ? "#ef4444" : "#22c55e";
          return (
            <div key={f.code} onClick={()=>{setFactory(f.code);setSearch("");}} style={{background:`${col}10`,border:`1.5px solid ${col}30`,borderRadius:"14px",padding:"13px",cursor:"pointer"}}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-black text-slate-100 font-mono text-sm">{f.code}{f.name && <span className="text-slate-400 font-sans"> · {f.name}</span>}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{f.items.length} منتج</div>
                </div>
                {f.needCount > 0
                  ? <span className="text-xs px-3 py-1 rounded-lg bg-red-900/30 text-red-300 font-bold">🔴 {f.needCount} يحتاج نقل</span>
                  : <span className="text-xs px-3 py-1 rounded-lg bg-emerald-900/30 text-emerald-300 font-bold">✓ مكتمل</span>}
              </div>
            </div>
          );
        })}
        {factories.length===0 && <EmptyState icon="🏭" title="لا مصانع" />}
      </div>
    </div>
  );
});

// ─── تفاصيل الفرع ────────────────────────────────────────────

const BranchDetail = memo(({ branch, products, periods, images, onSaveImage, onRemoveImage, settings, onBack, onSaveSettings }) => {
  const [view, setView] = useState("need");
  return (
    <div className="space-y-4">
      <BackBtn onClick={onBack} label="رجوع للفروع" />
      <div className="font-black text-slate-100 text-lg">🏪 {branch}</div>
      <div className="flex bg-slate-800 border border-slate-700 rounded-2xl p-1 gap-1">
        {[["need","🔴 احتياج"],["transfer","🔀 النقل"],["top","🔥 قوي/ضعيف"],["search","🔍 بحث"]].map(([k,l]) => (
          <button key={k} onClick={() => setView(k)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${view===k?"bg-blue-600 text-white":"text-slate-400 hover:text-slate-200"}`}>
            {l}
          </button>
        ))}
      </div>
      {view === "need"     && <NeedSection branch={branch} products={products} periods={periods} images={images} onSaveImage={onSaveImage} onRemoveImage={onRemoveImage} settings={settings} />}
      {view === "transfer" && <TransferSection branch={branch} products={products} periods={periods} images={images} settings={settings} onSaveSettings={onSaveSettings} />}
      {view === "top"      && <TopBottomSection branch={branch} products={products} periods={periods} images={images} onSaveImage={onSaveImage} onRemoveImage={onRemoveImage} settings={settings} />}
      {view === "search"   && <SmartSearch products={products} periods={periods} settings={settings} images={images} onSaveImage={onSaveImage} onRemoveImage={onRemoveImage} />}
    </div>
  );
});

// ─── قائمة الفروع ────────────────────────────────────────────

const BranchSelector = memo(({ branches, periods, products, settings, onSelect, branchSummary }) => {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("revenue");
  const [searchMode, setSearchMode] = useState("branch");
  const [showCamera, setShowCamera] = useState(false);

  const branchStats = useMemo(() => {
    return branches.map(branch => {
      const s = branchSummary?.[branch] ?? { qty:0, rev:0, profit:0, perfLevel:"red" };
      return { branch, ...s };
    }).sort((a,b) => {
      if (sortBy === "revenue") return b.rev - a.rev;
      if (sortBy === "units") return b.qty - a.qty;
      if (sortBy === "profit") return b.profit - a.profit;
      return b.rev - a.rev;
    });
  }, [branches, branchSummary, sortBy]);

  const barcodeResults = useMemo(() => {
    if (searchMode !== "barcode" || !search.trim()) return null;
    const bc = search.trim().toUpperCase();
    return branchStats.map(b => {
      const qty = periods.reduce((s, per) => s + num(per.sales?.[b.branch]?.[bc]?.qty ?? 0), 0);
      const rev = periods.reduce((s, per) => s + num(per.sales?.[b.branch]?.[bc]?.totalPrice ?? 0), 0);
      return { ...b, barcodeQty: qty, barcodeRev: rev };
    }).filter(b => b.barcodeQty > 0).sort((a,b) => b.barcodeQty - a.barcodeQty);
  }, [search, searchMode, branchStats, periods]);

  const filtered = searchMode === "barcode" ? (barcodeResults ?? branchStats) : branchStats.filter(b => arabicIncludes(b.branch, search));
  const PERF_COLOR = { green: "text-emerald-400", amber: "text-amber-400", red: "text-red-400" };
  const PERF_LABEL = { green: "🟢", amber: "🟡", red: "🔴" };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => { setSearchMode("branch"); setSearch(""); }} className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${searchMode==="branch" ? "bg-blue-600 text-white border-blue-500" : "bg-slate-700 text-slate-400 border-slate-600"}`}>🏪 بحث فرع</button>
        <button onClick={() => { setSearchMode("barcode"); setSearch(""); }} className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${searchMode==="barcode" ? "bg-amber-600 text-white border-amber-500" : "bg-slate-700 text-slate-400 border-slate-600"}`}>🔍 بحث باركود</button>
      </div>
      <div className="flex gap-2">
        <div className="flex-1"><SearchBar value={search} onChange={e => setSearch(e.target.value)} placeholder={searchMode === "barcode" ? "أدخل الباركود…" : "🔍 بحث عن فرع…"} /></div>
        {searchMode === "barcode" && <button onClick={() => setShowCamera(true)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-xl text-amber-400 text-xl">📷</button>}
      </div>
      {showCamera && <CameraScanner products={products} onFound={r => { setSearch(r.barcode); setShowCamera(false); }} onClose={() => setShowCamera(false)} />}
      {searchMode === "branch" && <FilterChips label="ترتيب:" options={[{key:"revenue", label:"الأعلى إيراداً"},{key:"units", label:"الأكثر وحدات"},{key:"profit", label:"الأعلى ربحاً"}]} active={sortBy} onChange={setSortBy} />}
      {searchMode === "barcode" && search && barcodeResults !== null && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-3 py-2 text-xs text-amber-300">
          {barcodeResults.length > 0 ? `${barcodeResults.length} فرع فيه مبيعات لـ ${search}` : `لا توجد مبيعات لـ ${search} في أي فرع`}
        </div>
      )}
      <div className="text-xs text-slate-500">{filtered.length} فرع</div>
      <div className="space-y-2">
        {filtered.map(({ branch, qty, rev, profit, perfLevel, barcodeQty }, i) => (
          <Card key={branch} onClick={() => onSelect(branch)} className="!p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-7 h-7 rounded-full text-xs flex items-center justify-center font-black shrink-0 ${i===0?"bg-amber-500 text-black":i===1?"bg-slate-400 text-black":i===2?"bg-amber-700 text-white":"bg-slate-700 text-slate-400"}`}>{i+1}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-100 truncate">{branch}</div>
                {searchMode === "barcode" && barcodeQty > 0 && <div className="text-xs text-amber-400 mt-0.5">{fmtN(barcodeQty)} وحدة من الباركود</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="font-black text-emerald-400 text-sm tabular-nums">{fmtM(rev)}</div>
                <div className="text-xs text-slate-500 tabular-nums">{fmtN(qty)} وحدة</div>
                <div className={`text-xs font-bold ${PERF_COLOR[perfLevel]}`}>{PERF_LABEL[perfLevel]} ربح: {fmtM(profit)}</div>
              </div>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${perfLevel==="green" ? "bg-gradient-to-r from-emerald-500 to-blue-500" : perfLevel==="amber" ? "bg-gradient-to-r from-amber-500 to-yellow-500" : "bg-gradient-to-r from-red-500 to-rose-500"}`} style={{ width: `${filtered[0]?.rev > 0 ? (rev/filtered[0].rev)*100 : 0}%` }} />
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <EmptyState icon="🏪" title="لا توجد فروع" subtitle="ارفع ملف مبيعات أولاً" />}
      </div>
    </div>
  );
});

// ─── الشاشة الرئيسية ─────────────────────────────────────────

export default function BranchesScreen({ products, periods, settings, images, onSaveImage, onRemoveImage, branchSummary, onSaveSettings }) {
  const [selected, setSelected] = useState(null);
  const [mainTab, setMainTab] = useState("list");
  const branches = useMemo(() => allBranches(periods), [periods]);

  if (selected) {
    return (
      <BranchDetail branch={selected} products={products} periods={periods} images={images} onSaveImage={onSaveImage} onRemoveImage={onRemoveImage} settings={settings} onBack={() => setSelected(null)} onSaveSettings={onSaveSettings} />
    );
  }
  if (branches.length === 0) return <EmptyState icon="🏪" title="لا توجد فروع" subtitle="ارفع ملف مبيعات أولاً" />;

  return (
    <div className="space-y-3">
      <SectionHeader icon="🏪" title="الفروع" subtitle={mainTab==="list"?"اضغط فرع للتفاصيل":"نقل ذكي بين الفروع"} />
      <div className="flex bg-slate-800 border border-slate-700 rounded-2xl p-1 gap-1">
        {[["list","🏪 قائمة الفروع"],["redist","🔄 نقل ذكي"]].map(([k,l]) => (
          <button key={k} onClick={() => setMainTab(k)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${mainTab===k?"bg-blue-600 text-white":"text-slate-400 hover:text-slate-200"}`}>
            {l}
          </button>
        ))}
      </div>
      {mainTab === "list" && <BranchSelector branches={branches} periods={periods} products={products} settings={settings} onSelect={setSelected} branchSummary={branchSummary} />}
      {mainTab === "redist" && <SmartRedistribution products={products} periods={periods} settings={settings} images={images} onSaveSettings={onSaveSettings} />}
    </div>
  );
}
