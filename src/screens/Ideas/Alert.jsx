import { useState, useEffect } from "react";
import { S, fm, fp, todayAr } from "./constants.js";

function SmartAlert({ onBuild, PRODUCTS = [] }) {
  const [show,  setShow]  = useState(true);
  const [open,  setOpen]  = useState(false);
  const [idx,   setIdx]   = useState(0);

  if (!PRODUCTS || PRODUCTS.length < 2) return null;

  const weak   = [...PRODUCTS].sort((a,b)=>a.soldPct-b.soldPct)[0];
  const strong = [...PRODUCTS].sort((a,b)=>b.soldPct-a.soldPct)[0];

  if (!weak || !strong) return null;

  const ALERTS = [
    { lv:"red",   icon:"🔴", title:weak.name+" — نفاد وشيك",     desc:fm(Math.round((weak.qty||0)*(1-(weak.soldPct||0)/100)))+" قطعة راكدة · "+fp(weak.soldPct)+" مباع",  tip:"خصم 25% لتحريك المخزون",  prod:weak,   otype:"discount" },
    { lv:"red",   icon:"🔴", title:"مصنع ضعيف — أداء خطير",      desc:"أقل من 20% مباع · يحتاج تدخل",                                                                    tip:"تصفية بسعر التكلفة",       prod:null,  otype:"clear"    },
    { lv:"amber", icon:"🟡", title:"فرع ضعيف — يحتاج دعم",       desc:"الأدنى إيراداً هذا الأسبوع",                                                                      tip:"كومبو خاص لهذا الفرع",    prod:null,  otype:"bundle"   },
    { lv:"green", icon:"🟢", title:strong.name+" — فرصة تكرار",  desc:fp(strong.soldPct)+" مباع · مرشح للكونتينر القادم",                                                 tip:"زد الكمية 30%",            prod:strong, otype:"bundle"  },
  ];

  useEffect(()=>{
    if(open) return;
    const t = setInterval(()=>setIdx(p=>(p+1)%ALERTS.length),5000);
    return ()=>clearInterval(t);
  },[open]);

  if(!show) return null;

  const a = ALERTS[idx];
  const C = {red:"#e8855a",amber:"#d4a853",green:"#8aab8e"};
  const c = C[a.lv];

  return (
    <>
      {/* بانر */}
      <div onClick={()=>setOpen(true)} style={{
        background: a.lv==="red"?"rgba(232,133,90,0.12)":a.lv==="amber"?"rgba(212,168,83,0.12)":"rgba(138,171,142,0.12)",
        border:"1px solid "+c+"44", borderRadius:S.r,
        padding:"14px 16px", marginBottom:"14px",
        display:"flex", alignItems:"center", gap:"12px", cursor:"pointer",
      }}>
        <span style={{fontSize:"22px",flexShrink:0}}>{a.icon}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:"15px",fontWeight:"900",color:S.white,marginBottom:"3px"}}>{a.title}</div>
          <div style={{fontSize:"13px",color:S.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.desc}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"6px",flexShrink:0}}>
          <button onClick={e=>{e.stopPropagation();setShow(false);}} style={{width:"28px",height:"28px",borderRadius:"50%",border:"1px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.5)",fontSize:"14px",cursor:"pointer",fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          <div style={{display:"flex",gap:"4px"}}>
            {ALERTS.map((_,i)=>(
              <div key={i} style={{width:i===idx?"16px":"6px",height:"6px",borderRadius:"100px",background:i===idx?c:"rgba(255,255,255,0.2)",transition:"all 0.3s"}} />
            ))}
          </div>
        </div>
      </div>

      {/* Modal */}
      {open && (
        <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:100,display:"flex",alignItems:"flex-end"}}>
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:"440px",margin:"0 auto",background:"#0f0c07",border:"1px solid "+c+"44",borderRadius:"24px 24px 0 0",padding:"24px 20px 36px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"20px"}}>
              <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                <span style={{fontSize:"24px"}}>{a.icon}</span>
                <div>
                  <div style={{fontSize:"17px",fontWeight:"900",color:S.white}}>{a.title}</div>
                  <div style={{fontSize:"13px",color:c,marginTop:"2px"}}>{a.desc}</div>
                </div>
              </div>
              <button onClick={()=>setOpen(false)} style={{width:"34px",height:"34px",borderRadius:"50%",border:"1px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.6)",fontSize:"16px",cursor:"pointer",fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>

            {a.prod && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px",marginBottom:"14px"}}>
                {[["مشتريات",a.prod.qty,S.white],["مباع",Math.round(a.prod.qty*a.prod.soldPct/100),c],["باقي",Math.round(a.prod.qty*(1-a.prod.soldPct/100)),"rgba(255,255,255,0.6)"]].map(([l,v,col])=>(
                  <div key={l} style={{background:S.faint,borderRadius:"12px",padding:"11px",textAlign:"center"}}>
                    <div style={{fontSize:"17px",fontWeight:"900",color:col}}>{fm(v)}</div>
                    <div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)",marginTop:"3px"}}>{l}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{background:c+"15",border:"1px solid "+c+"25",borderRadius:"13px",padding:"14px 16px",marginBottom:"16px"}}>
              <div style={{fontSize:"13px",color:c,fontWeight:"700",marginBottom:"5px"}}>💡 التوصية</div>
              <div style={{fontSize:"15px",color:S.white,fontWeight:"600"}}>{a.tip}</div>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                <button onClick={()=>{setOpen(false);if(a.prod&&onBuild)onBuild(a.otype,a.prod);}} style={{padding:"13px",borderRadius:"14px",border:"1px solid "+c+"35",background:c+"18",color:S.white,fontSize:"14px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>🎨 بنِ بطاقة</button>
                <button onClick={()=>setOpen(false)} style={{padding:"13px",borderRadius:"14px",border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.6)",fontSize:"14px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>إغلاق</button>
              </div>
              <button onClick={()=>{
                const msg = "🎯 طلب عرض — البارو\n━━━━━━━━━━━━\n" + a.title + "\n" + a.tip + "\nيرجى التنفيذ في Odoo 🙏";
                navigator.clipboard.writeText(msg).then(()=>alert("✅ تم النسخ — افتح واتساب وألصق")).catch(()=>alert(msg));
              }} style={{padding:"13px",borderRadius:"14px",border:"1px solid rgba(37,211,102,0.35)",background:"rgba(37,211,102,0.1)",color:"#25d166",fontSize:"14px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px"}}>
                <span>📋</span> نسخ رسالة Odoo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── فكرة اليوم ───────────────────────────────────────────────

function TodayCard({ onBuild, PRODUCTS = [] }) {
  if (!PRODUCTS || PRODUCTS.length === 0) return null;
  const weak   = [...PRODUCTS].sort((a,b)=>a.soldPct-b.soldPct)[0];
  const strong = [...PRODUCTS].sort((a,b)=>b.soldPct-a.soldPct)[0];
  if (!weak || !strong) return null;

  const Row = ({ p, lv, label, tip, otype }) => {
    const C = {green:"#8aab8e", red:"#e8855a"};
    const c = C[lv];
    const bought  = p.qty;
    const sold    = Math.round(p.qty*p.soldPct/100);
    const closing = bought - sold;
    const margin  = Math.round(((p.sellPrice-p.buyPrice)/p.buyPrice)*100);
    return (
      <div style={{background:c+"12",border:"1px solid "+c+"30",borderRadius:"18px",padding:"16px"}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:"6px",background:c+"20",border:"1px solid "+c+"35",borderRadius:"100px",padding:"5px 12px",fontSize:"13px",fontWeight:"700",color:c,marginBottom:"12px"}}>{label}</div>
        <div style={{display:"flex",gap:"12px",alignItems:"flex-start",marginBottom:"12px"}}>
          <div style={{width:"60px",height:"60px",borderRadius:"14px",background:c+"18",border:"1.5px solid "+c+"30",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"26px",flexShrink:0}}>📷</div>
          <div style={{flex:1}}>
            <div style={{fontSize:"17px",fontWeight:"900",color:S.white,marginBottom:"4px"}}>{p.name}</div>
            <div style={{fontSize:"13px",color:S.dim,marginBottom:"6px"}}>📦 {p.container}</div>
            <div style={{display:"inline-flex",alignItems:"center",gap:"5px",background:c+"20",borderRadius:"100px",padding:"4px 11px",fontSize:"13px",fontWeight:"700",color:c}}>{fp(p.soldPct)}</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px",marginBottom:"10px"}}>
          {[["مشتريات",fm(bought),S.white],["مباع",fm(sold),c],["باقي",fm(closing),"rgba(255,255,255,0.55)"]].map(([l,v,col])=>(
            <div key={l} style={{background:"rgba(255,255,255,0.06)",borderRadius:"10px",padding:"8px",textAlign:"center"}}>
              <div style={{fontSize:"15px",fontWeight:"900",color:col}}>{v}</div>
              <div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)",marginTop:"3px"}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{background:"rgba(255,255,255,0.04)",borderRadius:"10px",padding:"9px 12px",marginBottom:"10px"}}>
          <span style={{fontSize:"13px",color:S.dim}}>هامش: </span>
          <strong style={{fontSize:"13px",color:S.white}}>{margin}%</strong>
          <span style={{fontSize:"13px",color:S.dim,marginRight:"10px"}}> · شراء: </span>
          <strong style={{fontSize:"13px",color:S.white}}>{p.buyPrice} ﷼</strong>
        </div>
        <div style={{background:c+"12",border:"1px solid "+c+"25",borderRadius:"10px",padding:"9px 13px",marginBottom:"10px"}}>
          <div style={{fontSize:"14px",color:S.white,fontWeight:"700"}}>✓ {tip}</div>
        </div>
        <button onClick={()=>onBuild(otype,p)} style={{width:"100%",padding:"11px",borderRadius:"12px",border:"1px solid "+c+"35",background:c+"18",color:S.white,fontSize:"14px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>🎨 بنِ بطاقة</button>
      </div>
    );
  };

  return (
    <div style={{background:S.card,border:"1px solid "+S.border,borderRadius:S.r,padding:"20px",marginBottom:"16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"18px"}}>
        <div>
          <div style={{fontSize:"13px",color:S.gold,fontWeight:"700",marginBottom:"4px"}}>فكرة اليوم</div>
          <div style={{fontSize:"15px",color:S.white,fontWeight:"600"}}>{todayAr()}</div>
        </div>
        <div style={{width:"48px",height:"48px",borderRadius:"14px",background:"rgba(212,168,83,0.12)",border:"1px solid rgba(212,168,83,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"24px"}}>💡</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
        <Row p={strong} lv="green" label="🟢 فرصة اليوم" tip={"كرّر "+strong.name+" بكمية أكبر +30%"} otype="bundle" />
        <Row p={weak}   lv="red"   label="🔴 خطر اليوم"  tip={"خصم 25% لتحريك "+fm(Math.round(weak.qty*(1-weak.soldPct/100)))+" قطعة"} otype="discount" />
      </div>
    </div>
  );
}

// ─── الاقتراحات ───────────────────────────────────────────────

export { SmartAlert, TodayCard };
