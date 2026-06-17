// ─── إعادة التوزيع الذكية بالمصنع (نقل بين الفروع) ───────────────
// يكتشف الراكد والسريع لكل مصنع عبر الفترات، يقترح نقل، وأنت تعدّل.
import { useState, useMemo } from "react";
import { getFactoryCode, num } from "../lib/calc.js";

const toDozen = (n, u) => Math.ceil(n / (u||12)) * (u||12);

// محرّك التحليل: لكل مصنع، من راكد ومن سريع
function analyze(products, periods, settings) {
  const closed = settings?.closedBranches ?? [];
  const branchSet = new Set();
  periods.forEach(per => Object.keys(per.sales ?? {}).forEach(b => { if(!closed.includes(b)) branchSet.add(b); }));
  const nP = periods.length || 1;

  // مبيعات كل (فرع, منتج) عبر الفترات
  const factories = {};
  products.forEach(p => {
    const fc = getFactoryCode(p.barcode);
    if (!factories[fc]) factories[fc] = { code: fc, name: settings?.factories?.[fc] ?? "", brSold: {}, prods: {} };
    branchSet.forEach(b => {
      let sold = 0;
      periods.forEach(per => { sold += num(per.sales?.[b]?.[p.barcode]?.qty ?? 0); });
      if (sold <= 0) return;
      factories[fc].brSold[b] = (factories[fc].brSold[b] ?? 0) + sold;
      if (!factories[fc].prods[b]) factories[fc].prods[b] = [];
      factories[fc].prods[b].push({ barcode: p.barcode, name: p.name, sold, p });
    });
  });

  const out = [];
  Object.values(factories).forEach(fac => {
    const brs = Object.entries(fac.brSold).map(([branch,sold])=>({ branch, sold }));
    if (brs.length < 2) return;
    const totalSold = brs.reduce((s,b)=>s+b.sold,0);
    const avg = totalSold / brs.length;
    brs.forEach(b => { b.vsAvg = avg>0?(b.sold/avg)*100:0; });
    const stale = brs.filter(b=>b.sold < avg*0.5).sort((a,b)=>a.vsAvg-b.vsAvg);
    const hot   = brs.filter(b=>b.sold > avg).sort((a,b)=>b.vsAvg-a.vsAvg);
    if (stale.length===0 || hot.length===0) return;
    out.push({ ...fac, totalSold, avg, stale, hot, brCount: brs.length });
  });
  return out.sort((a,b)=>b.stale.length-a.stale.length);
}

export default function SmartRedistribution({ products=[], periods=[], settings={}, images={} }) {
  const [sel, setSel] = useState(null);      // المصنع المختار
  const [edits, setEdits] = useState({});    // {barcode: qty معدّلة}
  const [removed, setRemoved] = useState({}); // {barcode: true} مستثنى

  const analysis = useMemo(()=>analyze(products, periods, settings), [products, periods, settings]);

  // منتجات النقل المقترحة للمصنع المختار
  const plan = useMemo(()=>{
    if (!sel) return null;
    const fac = analysis.find(f=>f.code===sel);
    if (!fac) return null;
    const closed = settings?.closedBranches ?? [];
    // من كل فرع راكد: منتجاته اللي عنده فائض
    const source = fac.stale[0];   // أكثر فرع ركوداً
    const dest = fac.hot[0];        // أكثر فرع طلباً
    // منتجات المصنع في الفرع الراكد
    const facProds = {};
    products.forEach(p => {
      if (getFactoryCode(p.barcode) !== sel) return;
      let soldSrc = 0;
      periods.forEach(per => { soldSrc += num(per.sales?.[source.branch]?.[p.barcode]?.qty ?? 0); });
      if (soldSrc <= 0) return;
      const given = toDozen(soldSrc, 12);
      const surplus = given - soldSrc;
      if (surplus < 1) return;
      facProds[p.barcode] = { barcode:p.barcode, name:p.name, soldSrc, surplus, suggest: Math.max(12, toDozen(surplus,12)) };
    });
    return { fac, source, dest, items: Object.values(facProds) };
  }, [sel, analysis, products, periods, settings]);

  // طباعة خطة النقل
  const printPlan = () => {
    if (!plan) return;
    const items = plan.items.filter(it=>!removed[it.barcode]);
    const d = new Date();
    const ds = `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
    const rows = items.map((it,i)=>{
      const qty = edits[it.barcode] ?? it.suggest;
      const img = images?.[it.barcode];
      const imgCell = img ? `<img src="${img}" class="pimg"/>` : `<div class="pnoimg">📦</div>`;
      return `<tr><td class="rn">${i+1}</td><td class="im">${imgCell}</td><td class="bc">${it.barcode}</td><td class="nm">${it.name}</td><td class="q">${qty}</td></tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>نقل_${plan.source.branch}_${ds.replace(/\//g,"-")}</title>
      <style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
      *{font-family:'Cairo';box-sizing:border-box;margin:0;padding:0}body{padding:20px;color:#000}
      .h{text-align:center;border-bottom:2px solid #1e3a5f;padding-bottom:12px;margin-bottom:14px}
      .lg{font-size:24px;font-weight:900;letter-spacing:3px}.t{font-size:16px;font-weight:700;margin-top:4px}
      .route{display:flex;justify-content:center;gap:14px;align-items:center;margin:14px 0;font-size:15px;font-weight:900}
      .from{color:#dc2626}.to{color:#16a34a}.ar{color:#64748b}
      .meta{text-align:center;font-size:12px;color:#555;margin-bottom:12px}
      table{width:100%;border-collapse:collapse}th{background:#3b82f6;color:#fff;padding:8px;font-size:13px;border:1px solid #93c5fd}
      td{border:1px solid #cbd5e1;padding:8px;text-align:center;font-size:14px}td.nm{text-align:right;font-weight:700}td.bc{font-family:monospace;font-size:12px}td.q{font-size:18px;font-weight:900;color:#16a34a}td.rn{color:#888;width:30px}
      td.im{width:54px;padding:4px}.pimg{width:46px;height:46px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1}.pnoimg{width:46px;height:46px;border-radius:6px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto}
      .tb{position:fixed;top:0;left:0;right:0;background:#0f172a;padding:12px;display:flex;gap:8px;justify-content:center}
      .tb button{font-family:'Cairo';font-weight:900;border:none;border-radius:10px;padding:11px 24px;cursor:pointer;font-size:14px}
      .pr{background:#2563eb;color:#fff}.bk{background:#475569;color:#fff}
      @media print{.tb{display:none}body{padding:6px}}
      .wrap{padding-top:70px}</style></head><body>
      <div class="tb"><button class="bk" onclick="window.close()">✕ إغلاق</button><button class="pr" onclick="window.print()">🖨️ طباعة</button></div>
      <div class="wrap">
        <div class="h"><div class="lg">ALBAROO</div><div class="t">📋 خطة نقل بضاعة</div></div>
        <div class="route"><span class="from">📤 ${plan.source.branch}</span><span class="ar">←</span><span class="to">📥 ${plan.dest.branch}</span></div>
        <div class="meta">🏭 مصنع ${plan.fac.code}${plan.fac.name?` · ${plan.fac.name}`:""} · 📅 ${ds} · ${items.length} منتج</div>
        <table><thead><tr><th>#</th><th>صورة</th><th>الباركود</th><th>المنتج</th><th>الكمية</th></tr></thead><tbody>${rows}</tbody></table>
      </div></body></html>`;
    const w = window.open("","_blank");
    if (w){ w.document.write(html); w.document.close(); }
  };

  // ─── شاشة تفاصيل المصنع ───
  if (sel && plan) {
    const items = plan.items.filter(it=>!removed[it.barcode]);
    return (
      <div className="space-y-3">
        <button onClick={()=>{setSel(null);setEdits({});setRemoved({});}} className="text-blue-400 font-bold text-sm">← رجوع للمصانع</button>
        <div style={{background:"#0f1626",border:"1px solid #2d3a52",borderRadius:"14px",padding:"14px"}}>
          <div style={{fontWeight:900,color:"#f0e6d0",fontSize:"15px",marginBottom:"8px"}}>🏭 {plan.fac.code}{plan.fac.name?` · ${plan.fac.name}`:""}</div>
          <div style={{display:"flex",alignItems:"center",gap:"10px",fontSize:"14px",fontWeight:900}}>
            <span style={{color:"#f87171"}}>📤 {plan.source.branch}</span>
            <span style={{color:"#64748b"}}>←</span>
            <span style={{color:"#4ade80"}}>📥 {plan.dest.branch}</span>
          </div>
          <div style={{fontSize:"11px",color:"#94a3b8",marginTop:"6px"}}>
            الراكد باع {plan.source.sold} ({plan.source.vsAvg.toFixed(0)}% من المعدّل) · السريع باع {plan.dest.sold} ({plan.dest.vsAvg.toFixed(0)}%)
          </div>
        </div>

        {items.length===0 ? (
          <div style={{textAlign:"center",padding:"30px",color:"#64748b"}}>ما فيه منتجات للنقل</div>
        ) : (
          <>
            <div style={{fontSize:"12px",color:"#94a3b8",fontWeight:700}}>المنتجات المقترحة للنقل ({items.length}) — عدّل أو احذف:</div>
            {items.map(it => {
              const qty = edits[it.barcode] ?? it.suggest;
              return (
                <div key={it.barcode} style={{background:"#0f1626",border:"1px solid #2d3a52",borderRadius:"12px",padding:"10px",display:"flex",alignItems:"center",gap:"10px"}}>
                  {images?.[it.barcode]
                    ? <img src={images[it.barcode]} alt="" style={{width:"48px",height:"48px",borderRadius:"8px",objectFit:"cover",border:"1px solid #2d3a52",flexShrink:0}} />
                    : <div style={{width:"48px",height:"48px",borderRadius:"8px",background:"#1a2236",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"22px",flexShrink:0}}>📦</div>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,color:"#f0e6d0",fontSize:"13px"}}>{it.name}</div>
                    <div style={{fontFamily:"monospace",fontSize:"11px",color:"#64748b"}}>{it.barcode}</div>
                    <div style={{fontSize:"10px",color:"#94a3b8",marginTop:"2px"}}>فائض: {it.surplus}</div>
                  </div>
                  <input type="number" value={qty} min="0" step="12"
                    onChange={e=>setEdits({...edits,[it.barcode]:Math.max(0,num(e.target.value))})}
                    style={{width:"60px",background:"#1a2236",border:"1px solid #2d3a52",color:"#4ade80",borderRadius:"8px",padding:"7px",fontSize:"15px",fontWeight:900,textAlign:"center",fontFamily:"Cairo"}} />
                  <button onClick={()=>setRemoved({...removed,[it.barcode]:true})}
                    style={{background:"rgba(239,68,68,0.15)",color:"#fca5a5",border:"none",borderRadius:"8px",padding:"7px 10px",fontSize:"12px",fontWeight:700,cursor:"pointer",fontFamily:"Cairo"}}>حذف</button>
                </div>
              );
            })}
            <button onClick={printPlan}
              style={{width:"100%",background:"#2563eb",color:"#fff",border:"none",borderRadius:"12px",padding:"13px",fontSize:"15px",fontWeight:900,cursor:"pointer",fontFamily:"Cairo",marginTop:"6px"}}>
              🖨️ اطبع خطة النقل
            </button>
          </>
        )}
      </div>
    );
  }

  // ─── شاشة قائمة المصانع (الفرص) ───
  return (
    <div className="space-y-3">
      <div style={{background:"rgba(59,130,246,0.08)",border:"1px solid rgba(59,130,246,0.2)",borderRadius:"12px",padding:"12px",fontSize:"12px",color:"#93c5fd"}}>
        💡 النظام حلّل مبيعاتك عبر كل الفترات، واكتشف مصانع فيها <b>بضاعة راكدة بفرع</b> + <b>طلب بفرع ثاني</b>. اختر مصنع لترى خطة النقل.
      </div>
      {analysis.length===0 ? (
        <div style={{textAlign:"center",padding:"40px",color:"#64748b"}}>
          <div style={{fontSize:"32px",marginBottom:"8px"}}>✓</div>
          ما فيه فرص نقل واضحة حالياً<br/><span style={{fontSize:"11px"}}>التوزيع متوازن بين الفروع</span>
        </div>
      ) : (
        analysis.map(f => (
          <button key={f.code} onClick={()=>setSel(f.code)}
            style={{width:"100%",background:"#0f1626",border:"1px solid #2d3a52",borderRadius:"14px",padding:"14px",textAlign:"right",cursor:"pointer",fontFamily:"Cairo"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:900,color:"#f0e6d0",fontSize:"14px"}}>🏭 {f.code}{f.name?` · ${f.name}`:""}</div>
                <div style={{fontSize:"11px",color:"#94a3b8",marginTop:"3px"}}>
                  📤 {f.stale.length} فرع راكد · 📥 {f.hot.length} فرع يطلب
                </div>
              </div>
              <div style={{color:"#3b82f6",fontWeight:900,fontSize:"18px"}}>←</div>
            </div>
          </button>
        ))
      )}
    </div>
  );
}
