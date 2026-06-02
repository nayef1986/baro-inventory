// ProductNeeds.jsx — احتياج المنتجات عبر الفروع (خفيف: الحساب عند الضغط فقط)
import { useState, useMemo, memo } from "react";
import {
  totalPurchases, soldAllPeriods, getFactoryCode,
  arabicIncludes, num, allBranches, fmtN, fmtM, fmtPct,
} from "../lib/calc.js";

const MIN = 12;
const toDozen = n => Math.ceil(n / MIN) * MIN;

// زر نسخ الباركود
const CopyBarcode = memo(({ barcode }) => {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(barcode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(()=>{});
  };
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:"5px"}}>
      <span style={{fontFamily:"monospace",fontSize:"12px",color:"#94a3b8"}}>{barcode}</span>
      <button onClick={copy} style={{
        fontSize:"11px",padding:"2px 7px",borderRadius:"6px",cursor:"pointer",
        border:"1px solid rgba(148,163,184,0.3)",background:copied?"rgba(34,197,94,0.2)":"rgba(148,163,184,0.1)",
        color:copied?"#22c55e":"#94a3b8",fontFamily:"Cairo,sans-serif",
      }}>{copied ? "✓" : "📋"}</button>
    </span>
  );
});

// ─── تفاصيل المنتج عبر الفروع (يُحسب عند الضغط فقط) ──────────
const ProductDetail = memo(({ product, periods, images, settings, onBack }) => {
  const data = useMemo(() => {
    // مبيعات كل فرع (كل الفترات)
    const branchSales = {};
    periods.forEach(per => {
      Object.entries(per.sales ?? {}).forEach(([branch, d]) => {
        const q = num(d[product.barcode]?.qty ?? 0);
        if (q > 0) branchSales[branch] = (branchSales[branch] ?? 0) + q;
      });
    });
    const branches = Object.entries(branchSales).map(([branch, sold]) => {
      const given = toDozen(sold);
      return { branch, sold, given, remaining: given - sold };
    }).sort((a,b)=>b.sold-a.sold);

    const bought  = totalPurchases(product);
    const sold    = soldAllPeriods(product.barcode, periods);
    const closing = Math.max(0, bought - sold);
    return { branches, bought, sold, closing };
  }, [product, periods]);

  const img = images?.[product.barcode];
  const factory = getFactoryCode(product.barcode);
  const facName = settings?.factories?.[factory] ?? "";

  const print = () => {
    const rows = data.branches.map(b => `
      <tr><td>${b.branch}</td><td>${b.sold}</td><td>${b.given}</td><td>${b.remaining}</td></tr>`).join("");
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>${product.name}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        *{font-family:'Cairo',sans-serif;box-sizing:border-box}
        body{margin:0;background:#fff;color:#1a1a1a}
        .tb{position:fixed;top:0;left:0;right:0;background:#0f172a;padding:10px;display:flex;gap:10px;justify-content:center;z-index:99}
        .tb button{font-family:'Cairo';font-size:14px;font-weight:700;border:none;border-radius:10px;padding:10px 20px;cursor:pointer}
        .bk{background:#334155;color:#fff}.pr{background:#2563eb;color:#fff}
        .w{max-width:700px;margin:0 auto;padding:70px 20px 40px}
        .hd{display:flex;gap:16px;align-items:center;border-bottom:2px solid #e2e8f0;padding-bottom:16px;margin-bottom:16px}
        .hd img{width:90px;height:90px;border-radius:12px;object-fit:cover;border:1px solid #e2e8f0}
        .nm{font-size:20px;font-weight:900;color:#0f172a}
        .meta{font-size:13px;color:#666;font-family:monospace;margin-top:4px}
        .tot{display:flex;gap:10px;margin:16px 0}
        .tot div{flex:1;background:#f1f5f9;border-radius:12px;padding:12px;text-align:center}
        .tot .v{font-size:22px;font-weight:900;color:#0f172a}
        .tot .l{font-size:12px;color:#888;margin-top:3px}
        table{width:100%;border-collapse:collapse;margin-top:10px}
        th{background:#0f172a;color:#fff;padding:10px;font-size:13px}
        td{border:1px solid #e2e8f0;padding:9px;text-align:center;font-size:13px}
        tr:nth-child(even){background:#f8fafc}
        @media print{.tb{display:none}.w{padding:20px}}
      </style></head><body>
      <div class="tb"><button class="bk" onclick="window.close();history.back()">← رجوع</button><button class="pr" onclick="window.print()">🖨️ طباعة</button></div>
      <div class="w">
        <div class="hd">
          ${img ? `<img src="${img}"/>` : `<div style="width:90px;height:90px;border-radius:12px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:34px">📦</div>`}
          <div><div class="nm">${product.name}</div>
          <div class="meta">${product.barcode}</div>
          <div class="meta">🏭 ${factory}${facName?` · ${facName}`:""} · 📦 ${product.container ?? ""}</div></div>
        </div>
        <div class="tot">
          <div><div class="v">${fmtN(data.bought)}</div><div class="l">جاء</div></div>
          <div><div class="v">${fmtN(data.sold)}</div><div class="l">باع</div></div>
          <div><div class="v">${fmtN(data.closing)}</div><div class="l">باقي</div></div>
        </div>
        <table><thead><tr><th>الفرع</th><th>باع</th><th>أخذ</th><th>باقي</th></tr></thead><tbody>${rows}</tbody></table>
      </div></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-blue-400 font-bold text-sm">← رجوع للقائمة</button>

      {/* رأس المنتج */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
        <div className="flex gap-3 items-start">
          {img ? <img src={img} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />
               : <div className="w-20 h-20 rounded-xl bg-slate-700 flex items-center justify-center text-3xl shrink-0">📦</div>}
          <div className="flex-1 min-w-0">
            <div className="font-black text-slate-100">{product.name}</div>
            <div className="mt-1"><CopyBarcode barcode={product.barcode} /></div>
            <div className="text-xs text-blue-400 mt-1">🏭 {factory}{facName?` · ${facName}`:""}</div>
            <div className="text-xs text-slate-400">📦 {product.container}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-blue-900/20 rounded-xl p-2.5 text-center"><div className="text-xl font-black text-blue-400">{fmtN(data.bought)}</div><div className="text-xs text-slate-500">جاء</div></div>
          <div className="bg-amber-900/20 rounded-xl p-2.5 text-center"><div className="text-xl font-black text-amber-400">{fmtN(data.sold)}</div><div className="text-xs text-slate-500">باع</div></div>
          <div className="bg-slate-700/50 rounded-xl p-2.5 text-center"><div className="text-xl font-black text-slate-300">{fmtN(data.closing)}</div><div className="text-xs text-slate-500">باقي</div></div>
        </div>
      </div>

      <button onClick={print} className="w-full bg-slate-700 border border-slate-600 text-slate-200 py-3 rounded-xl font-bold text-sm">🖨️ طباعة التقرير بالصورة</button>

      {/* تفاصيل الفروع */}
      <div className="space-y-2">
        <div className="text-sm font-bold text-slate-300">الفروع ({data.branches.length})</div>
        {data.branches.map(b => (
          <div key={b.branch} className="bg-slate-800 border border-slate-700 rounded-xl p-3">
            <div className="font-bold text-slate-100 text-sm mb-2">🏪 {b.branch}</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center"><div className="text-lg font-black text-amber-400">{fmtN(b.sold)}</div><div className="text-xs text-slate-500">باع</div></div>
              <div className="text-center"><div className="text-lg font-black text-blue-400">{fmtN(b.given)}</div><div className="text-xs text-slate-500">أخذ</div></div>
              <div className="text-center"><div className="text-lg font-black text-emerald-400">{fmtN(b.remaining)}</div><div className="text-xs text-slate-500">باقي</div></div>
            </div>
          </div>
        ))}
        {data.branches.length === 0 && <div className="text-center text-slate-500 py-6">لا مبيعات في أي فرع</div>}
      </div>
    </div>
  );
});

// ─── الشاشة الرئيسية ─────────────────────────────────────────
export default function ProductNeedsScreen({ products = [], periods = [], images = {}, settings = {} }) {
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState(null);
  const [redMax,   setRedMax]   = useState(30);   // باع أقل من 30% = أحمر
  const [greenMin, setGreenMin] = useState(60);   // باع أكثر من 60% = أخضر
  const [visible,  setVisible]  = useState(30);

  // حساب خفيف للقائمة (نسبة فقط، بدون تفاصيل فروع)
  const list = useMemo(() => {
    const arr = products.map(p => {
      const bought  = totalPurchases(p);
      const sold    = soldAllPeriods(p.barcode, periods);
      const closing = Math.max(0, bought - sold);
      const soldPct = bought > 0 ? (sold/bought)*100 : 0;
      return { p, bought, sold, closing, soldPct };
    }).filter(x => x.bought > 0);
    // ترتيب بالمتبقي الكلي (الأكثر ركوداً أول)
    return arr.sort((a,b)=>b.closing-a.closing);
  }, [products, periods]);

  const filtered = useMemo(() => {
    if (!search) return list;
    return list.filter(x => arabicIncludes(x.p.name, search) || x.p.barcode.includes(search));
  }, [list, search]);

  const colorOf = (soldPct) => {
    if (soldPct < redMax)   return { border:"#ef4444", txt:"#ef4444", bg:"rgba(239,68,68,0.08)" };  // أحمر
    if (soldPct < greenMin) return { border:"#f59e0b", txt:"#f59e0b", bg:"rgba(245,158,11,0.08)" };  // برتقالي
    return { border:"#22c55e", txt:"#22c55e", bg:"rgba(34,197,94,0.08)" };                            // أخضر
  };

  if (selected) {
    return <ProductDetail product={selected} periods={periods} images={images} settings={settings} onBack={()=>setSelected(null)} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="font-black text-slate-100 text-lg">🔍 احتياج المنتجات</div>
        <div className="text-xs text-slate-500">مرتّبة بالمتبقي · اضغط منتج لتفاصيل الفروع</div>
      </div>

      {/* تحكم بالألوان */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-3">
        <div className="text-xs text-slate-400 font-bold mb-2">حدود التلوين (نسبة البيع)</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-400">🔴 أقل من</span>
          <input type="number" value={redMax} onChange={e=>setRedMax(Math.max(0,Math.min(100,Number(e.target.value)||0)))}
            className="w-14 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-2 py-1 text-sm font-black text-center" />
          <span className="text-xs text-amber-400">🟠 وسط</span>
          <span className="text-xs text-emerald-400">🟢 فوق</span>
          <input type="number" value={greenMin} onChange={e=>setGreenMin(Math.max(0,Math.min(100,Number(e.target.value)||0)))}
            className="w-14 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-2 py-1 text-sm font-black text-center" />
          <span className="text-xs text-slate-400">%</span>
        </div>
      </div>

      {/* بحث */}
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 بحث بالاسم أو الباركود…"
        className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />

      <div className="text-xs text-slate-500">{filtered.length} منتج</div>

      {/* القائمة */}
      <div className="space-y-2">
        {filtered.slice(0, visible).map(x => {
          const c = colorOf(x.soldPct);
          return (
            <div key={x.p.barcode} onClick={()=>setSelected(x.p)}
              style={{background:c.bg,border:`1.5px solid ${c.border}`,borderRadius:"14px",padding:"12px",cursor:"pointer"}}>
              <div className="flex items-start gap-3">
                {images?.[x.p.barcode]
                  ? <img src={images[x.p.barcode]} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  : <div className="w-12 h-12 rounded-lg bg-slate-700 flex items-center justify-center text-xl shrink-0">📦</div>}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-100 text-sm leading-tight">{x.p.name}</div>
                  <div className="mt-1" onClick={e=>e.stopPropagation()}><CopyBarcode barcode={x.p.barcode} /></div>
                  <div className="text-xs text-slate-400 mt-0.5">📦 {x.p.container}</div>
                </div>
                <div className="text-right shrink-0">
                  <div style={{fontSize:"18px",fontWeight:"900",color:c.txt}}>{fmtN(x.closing)}</div>
                  <div className="text-xs text-slate-500">باقي</div>
                  <div style={{fontSize:"12px",fontWeight:"700",color:c.txt,marginTop:"2px"}}>{fmtPct(x.soldPct)} باع</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {visible < filtered.length && (
        <button onClick={()=>setVisible(v=>v+30)} className="w-full bg-slate-700 text-slate-300 py-3 rounded-xl text-sm font-bold">
          عرض المزيد ({filtered.length - visible})
        </button>
      )}
    </div>
  );
}
