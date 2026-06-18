// OfferBuilder.jsx — منشئ العروض (داخل النظام الأساسي)
// يستقبل المنتجات المختارة من الاحتياج (بكامل معلوماتها) → نوع العرض → بطاقة بصورة
import { useState, useRef, useMemo } from "react";
import { getFactoryCode, num } from "../lib/calc.js";

function loadScript(src, globalName) {
  return new Promise((resolve, reject) => {
    if (window[globalName]) return resolve(window[globalName]);
    const s = document.createElement("script");
    s.src = src; s.onload = () => resolve(window[globalName]);
    s.onerror = () => reject(new Error("فشل التحميل"));
    document.head.appendChild(s);
  });
}

const OFFER_TYPES = [
  { key:"discount", icon:"🔥", label:"خصم مباشر",     color:"#e8855a", needs:"pct",   hint:"خصم % على المنتج" },
  { key:"free",     icon:"🎁", label:"قطعة مجانية",    color:"#10b981", needs:"none",  hint:"اشترِ واحدة والثانية هدية" },
  { key:"second",   icon:"💝", label:"الثانية بخصم",   color:"#d4a853", needs:"pct",   hint:"الأولى كامل والثانية بخصم %" },
  { key:"buy3",     icon:"⭐", label:"3 قطع بخصم",     color:"#c9a96e", needs:"pct",   hint:"3 من نفس المصنع بخصم %" },
  { key:"mix",      icon:"🔀", label:"حبة + حبة بخصم",  color:"#6366f1", needs:"pct",   hint:"منتج من مصنع + منتج من مصنع آخر" },
  { key:"bundle",   icon:"📦", label:"كومبو بسعر",     color:"#a855f7", needs:"price", hint:"حزمة منتجات بسعر ثابت" },
];

// يستقبل: items (منتجات مختارة من الاحتياج), images, settings, onClose
export default function OfferBuilder({ items = [], images = {}, settings = {}, onClose }) {
  const [step, setStep] = useState(1);       // 1 نوع · 2 بطاقة
  const [offerType, setOfferType] = useState(null);
  const [pct, setPct] = useState(20);
  const [bundlePrice, setBundlePrice] = useState(0);
  const [title, setTitle] = useState("");

  // ─── المرحلة 1: نوع العرض ───
  if (step === 1) {
    return (
      <div className="space-y-4">
        <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-600 bg-slate-800 text-slate-300 text-sm font-bold">← رجوع للاحتياج</button>

        <div>
          <div className="flex gap-1.5 mb-1"><div className="flex-1 h-1 rounded bg-amber-500"/><div className="flex-1 h-1 rounded bg-slate-700"/></div>
          <div className="text-xs text-amber-400/70">الخطوة 1 من 2 — نوع العرض · {items.length} منتج</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {OFFER_TYPES.map(t => {
            const on = offerType === t.key;
            return (
              <button key={t.key} onClick={()=>setOfferType(t.key)}
                className="p-3.5 rounded-2xl text-center transition-colors"
                style={{background:on?`${t.color}20`:"rgba(255,255,255,0.04)", border:on?`1px solid ${t.color}`:"1px solid rgba(255,255,255,0.08)"}}>
                <div className="text-2xl mb-1">{t.icon}</div>
                <div className="text-sm font-black" style={{color:on?t.color:"#e2e8f0"}}>{t.label}</div>
                <div className="text-[9px] text-slate-400 mt-0.5 leading-tight">{t.hint}</div>
              </button>
            );
          })}
        </div>

        {offerType && (() => {
          const t = OFFER_TYPES.find(x=>x.key===offerType);
          return (
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 space-y-3">
              <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="عنوان العرض (اختياري)…"
                className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder-slate-500" />
              {t.needs === "pct" && (
                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-sm text-slate-400">نسبة الخصم</span>
                    <span className="text-lg font-black" style={{color:t.color}}>{pct}%</span>
                  </div>
                  <input type="range" min={5} max={70} step={5} value={pct} onChange={e=>setPct(Number(e.target.value))} className="w-full" style={{accentColor:t.color}} />
                </div>
              )}
              {t.needs === "price" && (
                <div>
                  <div className="text-sm text-slate-400 mb-1.5">سعر الكومبو (﷼)</div>
                  <input type="number" value={bundlePrice} onChange={e=>setBundlePrice(Number(e.target.value))} placeholder="السعر الإجمالي…"
                    className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-base font-black focus:outline-none focus:border-amber-500" />
                </div>
              )}
              {t.needs === "none" && (
                <div className="text-xs text-emerald-300/80 text-center py-1">🎁 اشترِ قطعة واحصل على الثانية مجاناً</div>
              )}
            </div>
          );
        })()}

        {offerType && (
          <button onClick={()=>setStep(2)}
            className="w-full py-4 rounded-2xl border-none text-black font-black text-base"
            style={{background:"linear-gradient(135deg,#d4a853,#b8935a)"}}>
            عرض البطاقة النهائية ←
          </button>
        )}
      </div>
    );
  }

  // ─── المرحلة 2: البطاقة ───
  return (
    <OfferCard
      items={items} images={images}
      offerType={OFFER_TYPES.find(t=>t.key===offerType)}
      pct={pct} bundlePrice={bundlePrice} title={title}
      onBack={()=>setStep(1)}
    />
  );
}

// ─── البطاقة النهائية (صورة) ───
function OfferCard({ items, images, offerType, pct, bundlePrice, title, onBack }) {
  const cardRef = useRef();
  const [saving, setSaving] = useState(false);

  const calc = useMemo(() => {
    const totalOld = items.reduce((s,p)=>s+num(p.sellPrice),0);
    let totalNew = totalOld, badge = "";
    switch (offerType?.key) {
      case "discount": totalNew = totalOld*(1-pct/100); badge = `خصم ${pct}%`; break;
      case "free":     totalNew = totalOld; badge = "قطعة مجانية 🎁"; break;
      case "second": {
        const sorted = [...items].sort((a,b)=>num(b.sellPrice)-num(a.sellPrice));
        totalNew = totalOld - (num(sorted[1]?.sellPrice)*pct/100); badge = `الثانية بخصم ${pct}%`; break;
      }
      case "buy3": totalNew = totalOld*(1-pct/100); badge = `3 قطع بخصم ${pct}%`; break;
      case "mix":  totalNew = totalOld*(1-pct/100); badge = `حبة + حبة بخصم ${pct}%`; break;
      case "bundle": totalNew = bundlePrice>0?bundlePrice:totalOld; badge = "كومبو"; break;
      default: break;
    }
    return { totalOld, totalNew, saved: Math.max(0,totalOld-totalNew), badge };
  }, [items, offerType, pct, bundlePrice]);

  const saveCard = async () => {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const html2canvas = await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", "html2canvas");
      const canvas = await html2canvas(cardRef.current, { scale:2, backgroundColor:"#0d0b06", useCORS:true });
      const fn = `offer-${Date.now()}.jpg`;
      let shared = false;
      try {
        if (navigator.canShare && typeof navigator.share === "function") {
          const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.92));
          if (blob) {
            const file = new File([blob], fn, { type:"image/jpeg" });
            if (navigator.canShare({ files:[file] })) { await navigator.share({ files:[file] }); shared = true; }
          }
        }
      } catch (e) { shared = e?.name === "AbortError"; }
      if (!shared) {
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/jpeg", 0.92); a.download = fn; a.click();
      }
    } catch { alert("استخدم لقطة الشاشة"); }
    setSaving(false);
  };

  const color = offerType?.color ?? "#d4a853";

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="px-4 py-2 rounded-xl border border-slate-600 bg-slate-800 text-slate-300 text-sm font-bold">← تغيير النوع</button>

      <div ref={cardRef} style={{background:"#0d0b06",borderRadius:"20px",overflow:"hidden",border:`1px solid ${color}40`}}>
        {/* شريط العرض */}
        <div style={{background:`linear-gradient(135deg,${color},${color}aa)`,padding:"18px",textAlign:"center"}}>
          <div style={{fontSize:"30px"}}>{offerType?.icon}</div>
          <div style={{fontSize:"22px",fontWeight:"900",color:"#fff",marginTop:"2px"}}>{title || offerType?.label}</div>
          <div style={{fontSize:"14px",color:"rgba(255,255,255,0.9)",fontWeight:"700",marginTop:"2px"}}>{calc.badge}</div>
        </div>

        {/* المنتجات */}
        <div style={{padding:"14px"}}>
          {items.map((p,i) => {
            const img = images?.[p.barcode];
            const factory = getFactoryCode(p.barcode);
            const container = p.container ?? "";
            return (
              <div key={p.barcode} style={{display:"flex",gap:"12px",alignItems:"center",padding:"12px 0",borderBottom:i<items.length-1?"1px solid rgba(255,255,255,0.08)":"none"}}>
                {img
                  ? <img src={img} alt="" style={{width:"82px",height:"82px",borderRadius:"12px",objectFit:"contain",flexShrink:0,border:`1px solid ${color}30`,background:"#fff",padding:"3px"}} />
                  : <div style={{width:"82px",height:"82px",borderRadius:"12px",background:"rgba(255,255,255,0.05)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"32px",flexShrink:0}}>📦</div>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"17px",fontWeight:"900",color:"#ffffff",lineHeight:1.3}}>{p.name}</div>
                  <div style={{fontSize:"14px",color:"rgba(255,255,255,0.7)",fontFamily:"monospace",fontWeight:"700",marginTop:"3px",letterSpacing:"0.5px"}}>{p.barcode}</div>
                  <div style={{display:"flex",gap:"10px",marginTop:"5px",flexWrap:"wrap"}}>
                    <span style={{fontSize:"12px",fontWeight:"700",color:"#e8c87a"}}>🏭 {factory}</span>
                    {container && <span style={{fontSize:"12px",fontWeight:"700",color:"#8ab4f8"}}>📦 {container}</span>}
                  </div>
                </div>
                <div style={{textAlign:"left",flexShrink:0}}>
                  <div style={{fontSize:"20px",fontWeight:"900",color:"#d4a853"}}>{num(p.sellPrice).toLocaleString()} ﷼</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* كان → صار */}
        <div style={{margin:"0 14px 14px",background:`${color}12`,border:`1px solid ${color}30`,borderRadius:"14px",padding:"16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:"15px",color:"rgba(255,255,255,0.45)",textDecoration:"line-through"}}>كان {num(calc.totalOld).toLocaleString()} ﷼</div>
              <div style={{fontSize:"38px",fontWeight:"900",color,lineHeight:1.1,marginTop:"2px"}}>صار {num(Math.round(calc.totalNew)).toLocaleString()} ﷼</div>
            </div>
            {calc.saved > 0 && (
              <div style={{textAlign:"center",background:`${color}25`,borderRadius:"12px",padding:"10px 16px"}}>
                <div style={{fontSize:"12px",color:"rgba(255,255,255,0.6)"}}>توفّر</div>
                <div style={{fontSize:"28px",fontWeight:"900",color:"#10b981",lineHeight:1.1}}>{num(Math.round(calc.saved)).toLocaleString()} ﷼</div>
              </div>
            )}
          </div>
        </div>

        <div style={{padding:"12px 14px",borderTop:"1px solid rgba(255,255,255,0.06)",textAlign:"center"}}>
          <div style={{fontSize:"16px",fontWeight:"900",color:"#d4a853",letterSpacing:"2px"}}>ALBAROO</div>
        </div>
      </div>

      <button onClick={saveCard} disabled={saving}
        className="w-full py-4 rounded-2xl border-none text-black font-black text-base"
        style={{background:"linear-gradient(135deg,#d4a853,#b8935a)"}}>
        {saving ? "⏳ جاري الحفظ…" : "🖼️ حفظ العرض كصورة"}
      </button>
    </div>
  );
}
