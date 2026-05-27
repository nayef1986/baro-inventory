import { useState, useEffect, useMemo } from "react";
import { totalPurchases, soldAllPeriods, getFactoryCode, allBranches, num } from "../lib/calc.js";

// PRODUCTS تأتي من props

// FACTORIES و BRANCHES تُحسب من props

const TYPES = [
  { key:"bundle",   icon:"🎁", label:"كومبو",   color:"#d4a853" },
  { key:"discount", icon:"🔥", label:"خصم",     color:"#e8855a" },
  { key:"buy3",     icon:"⭐", label:"اشتري 3", color:"#c9a96e" },
  { key:"seasonal", icon:"🌸", label:"موسمي",   color:"#b8976a" },
  { key:"clear",    icon:"💨", label:"تصفية",   color:"#8aab8e" },
  { key:"new",      icon:"✨", label:"جديد",    color:"#a89fc4" },
];

const fm = n => Number(n||0).toLocaleString("en-US",{maximumFractionDigits:1});
const fp = n => Number(n||0).toFixed(1) + "%";
const todayAr = () => new Date().toLocaleDateString("ar-SA",{weekday:"long",day:"numeric",month:"long"});

const S = {
  bg:     "#0a0804",
  card:   "rgba(255,245,220,0.06)",
  border: "rgba(212,168,83,0.18)",
  gold:   "#d4a853",
  white:  "#ffffff",
  dim:    "rgba(255,255,255,0.55)",
  faint:  "rgba(255,255,255,0.12)",
  r:      "20px",
  rs:     "13px",
};

const Card = ({ children, style, onClick }) => (
  <div onClick={onClick} style={{
    background:S.card, border:"1px solid "+S.border,
    borderRadius:S.r, backdropFilter:"blur(20px)",
    ...style,
  }}>{children}</div>
);

// ─── إشعار ذكي ────────────────────────────────────────────────

function SmartAlert({ onBuild }) {
  const [show,  setShow]  = useState(true);
  const [open,  setOpen]  = useState(false);
  const [idx,   setIdx]   = useState(0);

  if (!PRODUCTS || PRODUCTS.length === 0) return null;

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

function TodayCard({ onBuild }) {
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

function SuggestionsTab({ onBuild }) {
  const [filter, setFilter] = useState("all");
  const weak = PRODUCTS.filter(p=>p.soldPct<50).sort((a,b)=>a.soldPct-b.soldPct);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
      <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
        {[["all","الكل"],["products","منتجات"],["factories","مصانع"],["branches","فروع"]].map(([k,l])=>(
          <button key={k} onClick={()=>setFilter(k)} style={{padding:"7px 15px",borderRadius:"100px",border:"none",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontSize:"13px",fontWeight:"700",background:filter===k?"rgba(212,168,83,0.2)":"rgba(255,245,220,0.05)",color:filter===k?S.gold:"rgba(255,255,255,0.4)",border:filter===k?"1px solid rgba(212,168,83,0.4)":"1px solid rgba(255,255,255,0.08)",transition:"all 0.2s"}}>{l}</button>
        ))}
      </div>

      {(filter==="all"||filter==="products") && weak.map((p,i)=>{
        const t = TYPES[i%TYPES.length];
        const discP = (p.sellPrice*0.75).toFixed(1);
        return (
          <div key={p.name} style={{background:S.card,border:"1px solid "+S.border,borderRadius:S.rs,padding:"16px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"12px"}}>
              <div style={{width:"50px",height:"50px",borderRadius:"14px",background:t.color+"18",border:"1px solid "+t.color+"30",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"24px",flexShrink:0}}>{t.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:"16px",fontWeight:"900",color:S.white}}>{p.name}</div>
                <div style={{fontSize:"13px",color:S.dim,marginTop:"3px"}}>📦 {p.container}</div>
              </div>
              <div style={{display:"inline-flex",background:t.color+"18",color:t.color,border:"1px solid "+t.color+"30",borderRadius:"100px",padding:"5px 12px",fontSize:"13px",fontWeight:"700"}}>{fp(p.soldPct)}</div>
            </div>
            <div style={{background:"rgba(255,255,255,0.04)",borderRadius:"11px",padding:"10px 13px",marginBottom:"11px"}}>
              <div style={{fontSize:"13px",color:S.dim}}>{t.icon} {t.label} 25% ← سعر جديد <strong style={{color:t.color,fontSize:"14px"}}>{discP} ﷼</strong> بدل {p.sellPrice} ﷼</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"7px",marginBottom:"11px"}}>
              {[["جاء",fm(p.qty),S.gold],["مباع",fm(Math.round(p.qty*p.soldPct/100)),t.color],["باقي",fm(Math.round(p.qty*(1-p.soldPct/100))),"rgba(255,255,255,0.5)"]].map(([l,v,c])=>(
                <div key={l} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"10px",padding:"9px",textAlign:"center"}}>
                  <div style={{fontSize:"15px",fontWeight:"900",color:c}}>{v}</div>
                  <div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)",marginTop:"3px"}}>{l}</div>
                </div>
              ))}
            </div>
            <button onClick={()=>onBuild(t.key,p)} style={{width:"100%",padding:"11px",borderRadius:"12px",border:"1px solid "+t.color+"30",background:t.color+"12",color:S.white,fontSize:"14px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>🎨 بنِ بطاقة عرض</button>
          </div>
        );
      })}
    </div>
  );
}

// ─── تنبيهات قابلة للتوسع ───────────────────────────────────

function ExpandableAlerts({ rows, C, onBuild }) {
  const [openIdx, setOpenIdx] = useState(null);

  const DETAILS = [
    { product: PRODUCTS.find(p=>p.name==="Fake Nail") ?? null,  tip:"خصم 25% → سعر 7.5 ﷼ لتحريك 422 قطعة", otype:"discount" },
    { product: null, tip:"تصفية مصنع الخليج بسعر التكلفة لاسترداد 3,120 ﷼", otype:"clear" },
    { product: null, tip:"أرسل كومبو خاص للفرع لتحفيز المبيعات", otype:"bundle" },
    { product: PRODUCTS.find(p=>p.name==="Bag") ?? null,        tip:"ما تحرك 3 أسابيع — خصم 30% أو تصفية", otype:"discount" },
    { product: PRODUCTS.find(p=>p.name==="Lip Gloss") ?? null,  tip:"زد كمية Lip Gloss 30% في الكونتينر القادم", otype:"bundle" },
    { product: null, tip:"ادمج Mask + Lip Gloss في كومبو بسعر مميز", otype:"bundle" },
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
      {rows.map((r,i)=>{
        const d   = DETAILS[i] ?? {};
        const c   = C[r.lv];
        const open = openIdx === i;
        const p   = d.product;
        return (
          <div key={i} style={{borderRadius:"14px",overflow:"hidden",border:"1px solid "+c+"30",transition:"all 0.3s"}}>
            {/* هيدر قابل للضغط */}
            <div onClick={()=>setOpenIdx(open?null:i)} style={{padding:"14px 16px",background:c+"10",display:"flex",alignItems:"center",gap:"12px",cursor:"pointer"}}>
              <span style={{fontSize:"20px",flexShrink:0}}>{r.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"15px",fontWeight:"900",color:S.white}}>{r.title}</div>
                <div style={{fontSize:"13px",color:S.dim,marginTop:"3px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.desc}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"8px",flexShrink:0}}>
                <div style={{display:"inline-flex",background:c+"18",color:c,border:"1px solid "+c+"28",borderRadius:"100px",padding:"5px 12px",fontSize:"13px",fontWeight:"700"}}>{r.val}</div>
                <div style={{color:c,fontSize:"14px",fontWeight:"900",transition:"transform 0.3s",transform:open?"rotate(90deg)":"rotate(0deg)"}}>←</div>
              </div>
            </div>

            {/* التفاصيل */}
            {open && (
              <div style={{background:"rgba(0,0,0,0.3)",borderTop:"1px solid "+c+"20",padding:"14px 16px"}}>
                {p && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"7px",marginBottom:"12px"}}>
                    {[["مشتريات",p.qty,S.white],["مباع",Math.round(p.qty*p.soldPct/100),c],["باقي",Math.round(p.qty*(1-p.soldPct/100)),"rgba(255,255,255,0.5)"]].map(([l,v,col])=>(
                      <div key={l} style={{background:"rgba(255,255,255,0.05)",borderRadius:"10px",padding:"9px",textAlign:"center"}}>
                        <div style={{fontSize:"16px",fontWeight:"900",color:col}}>{Number(v).toLocaleString()}</div>
                        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)",marginTop:"3px"}}>{l}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{background:c+"12",border:"1px solid "+c+"25",borderRadius:"11px",padding:"11px 14px",marginBottom:"12px"}}>
                  <div style={{fontSize:"13px",color:c,fontWeight:"700",marginBottom:"4px"}}>💡 التوصية</div>
                  <div style={{fontSize:"14px",color:S.white,fontWeight:"600"}}>{d.tip}</div>
                </div>
                {p && (
                  <button onClick={()=>{if(onBuild)onBuild(d.otype,p);}} style={{width:"100%",padding:"11px",borderRadius:"12px",border:"1px solid "+c+"35",background:c+"18",color:S.white,fontSize:"14px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>
                    🎨 بنِ بطاقة عرض
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {/* مصانع */}
      {(filter==="all"||filter==="factories") && FACTORIES.map((f,i)=>(
        <div key={f.code} style={{background:S.card,border:"1px solid "+S.border,borderRadius:S.rs,padding:"16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"12px"}}>
            <div style={{width:"50px",height:"50px",borderRadius:"14px",background:"rgba(232,133,90,0.12)",border:"1px solid rgba(232,133,90,0.22)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"24px",flexShrink:0}}>🏭</div>
            <div style={{flex:1}}>
              <div style={{fontSize:"16px",fontWeight:"900",color:S.white}}>{f.code} · {f.name}</div>
              <div style={{fontSize:"13px",color:S.dim,marginTop:"3px"}}>{f.products} منتج · خسارة {fm(f.lostVal)} ﷼</div>
            </div>
            <div style={{display:"inline-flex",background:"rgba(232,133,90,0.15)",color:"#e8855a",border:"1px solid rgba(232,133,90,0.25)",borderRadius:"100px",padding:"5px 12px",fontSize:"13px",fontWeight:"700"}}>{fp(f.soldPct)}</div>
          </div>
          <div style={{background:"rgba(255,255,255,0.04)",borderRadius:"11px",padding:"10px 13px",marginBottom:"11px"}}>
            <div style={{fontSize:"13px",color:S.dim}}>💨 تصفية المصنع بسعر التكلفة لاسترداد <strong style={{color:"#e8855a"}}>{fm(f.lostVal)} ﷼</strong></div>
          </div>
          <button onClick={()=>onBuild("clear",{name:f.name,sellPrice:10,buyPrice:4,soldPct:f.soldPct,qty:200})} style={{width:"100%",padding:"11px",borderRadius:"12px",border:"1px solid rgba(6,182,212,0.3)",background:"rgba(6,182,212,0.08)",color:"#ffffff",fontSize:"14px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>
            🎨 بنِ بطاقة تصفية
          </button>
        </div>
      ))}

      {/* فروع */}
      {(filter==="all"||filter==="branches") && BRANCHES.map((b,i)=>(
        <div key={b.name} style={{background:S.card,border:"1px solid "+S.border,borderRadius:S.rs,padding:"16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"12px"}}>
            <div style={{width:"50px",height:"50px",borderRadius:"14px",background:"rgba(168,159,196,0.12)",border:"1px solid rgba(168,159,196,0.22)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"24px",flexShrink:0}}>🏪</div>
            <div style={{flex:1}}>
              <div style={{fontSize:"16px",fontWeight:"900",color:S.white}}>{b.name}</div>
              <div style={{fontSize:"13px",color:S.dim,marginTop:"3px"}}>#{b.rank} · {fm(b.rev)} ﷼</div>
            </div>
          </div>
          <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"11px"}}>
            {b.weak.map(w=>(<span key={w} style={{display:"inline-flex",background:"rgba(232,133,90,0.1)",color:"#e8855a",border:"1px solid rgba(232,133,90,0.2)",borderRadius:"100px",padding:"5px 12px",fontSize:"13px",fontWeight:"700"}}>{w}</span>))}
          </div>
          <button onClick={()=>onBuild("bundle",{name:b.weak[0],sellPrice:10,buyPrice:3,soldPct:20,qty:300})} style={{width:"100%",padding:"11px",borderRadius:"12px",border:"1px solid rgba(168,159,196,0.3)",background:"rgba(168,159,196,0.08)",color:"#ffffff",fontSize:"14px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>
            🎁 بنِ عرض خاص للفرع
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── التحليل ──────────────────────────────────────────────────

function AnalysisTab({ onBuild }) {
  const [openIdx, setOpenIdx] = useState(null);

  const C = {red:"#e8855a", amber:"#d4a853", green:"#8aab8e"};

  const rows = [
    { lv:"red",   icon:"🔴", title:"Fake Nail — نفاد وشيك",    desc:"422 قطعة · 12% مباع",       val:"14 يوم",  tip:"خصم 25% لتحريك المخزون",              prod:PRODUCTS.find(p=>p.name==="Fake Nail") ?? null, otype:"discount" },
    { lv:"red",   icon:"🔴", title:"مصنع الخليج — خطير",       desc:"15% مباع · 3,120 ﷼ مجمّدة",  val:"-3,120 ﷼",tip:"تصفية بسعر التكلفة",                  prod:null, otype:"clear" },
    { lv:"amber", icon:"🟡", title:"البارو النور — ضعيف",      desc:"الأدنى إيراداً",             val:"#5",      tip:"كومبو خاص لهذا الفرع",                prod:null, otype:"bundle" },
    { lv:"amber", icon:"🟡", title:"Bag — ما تحرك",            desc:"3 أسابيع بدون بيع",          val:"⚠️",      tip:"خصم 30% أو تصفية",                   prod:PRODUCTS.find(p=>p.name==="Bag") ?? null, otype:"discount" },
    { lv:"green", icon:"🟢", title:"Lip Gloss — فرصة تكرار",  desc:"71% مباع · كرّره",           val:"+30%",    tip:"زد الكمية 30% في الكونتينر القادم",   prod:PRODUCTS.find(p=>p.name==="Lip Gloss") ?? null, otype:"bundle" },
    { lv:"green", icon:"🟢", title:"Mask + Lip Gloss كومبو",  desc:"يباعان معاً 87%",            val:"87%",     tip:"ادمج المنتجين في كومبو بسعر مميز",    prod:null, otype:"bundle" },
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>

      <div style={{background:S.card,border:"1px solid "+S.border,borderRadius:S.rs,padding:"16px"}}>
        <div style={{fontSize:"15px",fontWeight:"900",color:S.white,marginBottom:"14px"}}>📊 ROI الكونتينرات</div>
        {[{name:"BAR01YW26",roi:340},{name:"BAR02YW26",roi:180}].map(c=>(
          <div key={c.name} style={{marginBottom:"12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"6px"}}>
              <span style={{fontSize:"14px",color:S.dim}}>{c.name}</span>
              <span style={{fontSize:"14px",fontWeight:"900",color:c.roi>=300?"#8aab8e":"#d4a853"}}>{c.roi}%</span>
            </div>
            <div style={{height:"7px",background:"rgba(255,255,255,0.06)",borderRadius:"100px",overflow:"hidden"}}>
              <div style={{height:"100%",width:Math.min(100,c.roi/4)+"%",borderRadius:"100px",background:c.roi>=300?"linear-gradient(90deg,#8aab8e,#d4a853)":"linear-gradient(90deg,#d4a853,#e8855a)"}} />
            </div>
          </div>
        ))}
      </div>

      {rows.map((r,i)=>{
        const c   = C[r.lv];
        const open = openIdx === i;
        return (
          <div key={i} style={{borderRadius:"14px",overflow:"hidden",border:"1px solid "+c+"30"}}>
            <div onClick={()=>setOpenIdx(open?null:i)} style={{padding:"14px 16px",background:c+"10",display:"flex",alignItems:"center",gap:"12px",cursor:"pointer"}}>
              <span style={{fontSize:"20px",flexShrink:0}}>{r.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"15px",fontWeight:"900",color:S.white}}>{r.title}</div>
                <div style={{fontSize:"13px",color:S.dim,marginTop:"3px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.desc}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"8px",flexShrink:0}}>
                <div style={{display:"inline-flex",background:c+"18",color:c,border:"1px solid "+c+"28",borderRadius:"100px",padding:"5px 12px",fontSize:"13px",fontWeight:"700"}}>{r.val}</div>
                <div style={{color:c,fontSize:"14px",transition:"transform 0.3s",transform:open?"rotate(90deg)":"rotate(0deg)"}}>←</div>
              </div>
            </div>
            {open && (
              <div style={{background:"rgba(0,0,0,0.3)",borderTop:"1px solid "+c+"20",padding:"14px 16px"}}>
                {r.prod && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"7px",marginBottom:"12px"}}>
                    {[
                      ["مشتريات", r.prod.qty, S.white],
                      ["مباع",    Math.round(r.prod.qty*r.prod.soldPct/100), c],
                      ["باقي",   Math.round(r.prod.qty*(1-r.prod.soldPct/100)), "rgba(255,255,255,0.5)"]
                    ].map(([l,v,col])=>(
                      <div key={l} style={{background:"rgba(255,255,255,0.05)",borderRadius:"10px",padding:"9px",textAlign:"center"}}>
                        <div style={{fontSize:"16px",fontWeight:"900",color:col}}>{Number(v).toLocaleString()}</div>
                        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)",marginTop:"3px"}}>{l}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{background:c+"12",border:"1px solid "+c+"25",borderRadius:"11px",padding:"11px 14px",marginBottom:r.prod?"12px":"0"}}>
                  <div style={{fontSize:"13px",color:c,fontWeight:"700",marginBottom:"4px"}}>💡 التوصية</div>
                  <div style={{fontSize:"14px",color:S.white,fontWeight:"600"}}>{r.tip}</div>
                </div>
                {r.prod && (
                  <button onClick={()=>{if(onBuild)onBuild(r.otype,r.prod);}} style={{width:"100%",padding:"11px",borderRadius:"12px",border:"1px solid "+c+"35",background:c+"18",color:S.white,fontSize:"14px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>
                    🎨 بنِ بطاقة عرض
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Gemini Image Generator ──────────────────────────────────

function GeminiGen({ productName, productImage, onAddToCard }) {
  const [style,    setStyle]    = useState("studio");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState("");

  const STYLES = [
    { key:"studio",    icon:"📸", label:"استوديو",  en:"white marble surface, soft studio lighting, clean background, luxury aesthetic" },
    { key:"model",     icon:"👗", label:"موديل",    en:"held by fashion model, lifestyle photography, natural lighting, modern aesthetic" },
    { key:"lifestyle", icon:"🌿", label:"لايف ستايل",en:"flat lay on aesthetic background, flowers and natural elements, soft pastel colors" },
    { key:"dramatic",  icon:"🔥", label:"دراما",    en:"dramatic dark background, cinematic lighting, luxury premium feel, moody atmosphere" },
  ];

  const buildPrompt = () => {
    const s = STYLES.find(x=>x.key===style);
    return "Professional product photography of " + productName + ", " + s.en + ", Instagram ready, high resolution, commercial quality photo";
  };

  const generate = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/gemini-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: buildPrompt(), imageBase64: productImage ?? null }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setResult(data.image);
    } catch(e) {
      setError("حدث خطأ: " + e.message);
    }
    setLoading(false);
  };

  const s = STYLES.find(x=>x.key===style);

  return (
    <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(168,159,196,0.25)",borderRadius:"16px",padding:"16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"14px"}}>
        <span style={{fontSize:"20px"}}>🤖</span>
        <div>
          <div style={{fontSize:"15px",fontWeight:"900",color:"#ffffff"}}>أنشئ صورة بـ Gemini</div>
          <div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)",marginTop:"2px"}}>{productName}</div>
        </div>
      </div>

      {/* الأسلوب */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"7px",marginBottom:"14px"}}>
        {STYLES.map(st=>(
          <button key={st.key} onClick={()=>setStyle(st.key)} style={{padding:"10px",borderRadius:"12px",border:"none",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontSize:"13px",fontWeight:"700",
            background:style===st.key?"rgba(168,159,196,0.2)":"rgba(255,255,255,0.04)",
            color:style===st.key?"#a89fc4":"rgba(255,255,255,0.4)",
            border:style===st.key?"1px solid rgba(168,159,196,0.4)":"1px solid rgba(255,255,255,0.07)",
            display:"flex",alignItems:"center",gap:"6px",justifyContent:"center",
          }}>
            <span style={{fontSize:"18px"}}>{st.icon}</span>{st.label}
          </button>
        ))}
      </div>

      {/* البرومت */}
      <div style={{background:"rgba(0,0,0,0.3)",borderRadius:"11px",padding:"10px 13px",marginBottom:"14px"}}>
        <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginBottom:"5px",fontWeight:"700",letterSpacing:"0.05em"}}>البرومت التلقائي</div>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.55)",lineHeight:"1.6",direction:"ltr",textAlign:"left"}}>{buildPrompt()}</div>
      </div>

      {/* زر الإنشاء */}
      <button onClick={generate} disabled={loading} style={{width:"100%",padding:"13px",borderRadius:"13px",border:"none",background:loading?"rgba(168,159,196,0.1)":"linear-gradient(135deg,#a89fc4,#8b82a8)",color:"#ffffff",fontSize:"14px",fontWeight:"900",cursor:loading?"not-allowed":"pointer",fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",opacity:loading?0.7:1}}>
        {loading ? <><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>⏳</span> جاري الإنشاء…</> : <><span>✨</span> أنشئ الصورة</>}
      </button>

      {/* النتيجة */}
      {result && (
        <div style={{marginTop:"14px"}}>
          <div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)",marginBottom:"8px",fontWeight:"700"}}>النتيجة:</div>
          {typeof result === "string" && result.startsWith("data:") ? (
            <img src={result} alt="AI" style={{width:"100%",borderRadius:"14px",marginBottom:"10px",maxHeight:"250px",objectFit:"cover"}} />
          ) : (
            <div style={{width:"100%",height:"180px",borderRadius:"14px",background:"linear-gradient(135deg,rgba(168,159,196,0.2),rgba(212,168,83,0.1))",border:"1px solid rgba(168,159,196,0.3)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"8px",marginBottom:"10px"}}>
              <span style={{fontSize:"40px"}}>🎨</span>
              <div style={{fontSize:"13px",color:"rgba(255,255,255,0.5)"}}>صورة {s.label} احترافية</div>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
            <button onClick={()=>onAddToCard&&onAddToCard("gemini-result")} style={{padding:"11px",borderRadius:"12px",border:"1px solid rgba(168,159,196,0.35)",background:"rgba(168,159,196,0.15)",color:"#ffffff",fontSize:"13px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>
              ➕ أضف للبطاقة
            </button>
            <button onClick={()=>{
              if(result&&result.startsWith("data:")){
                const a=document.createElement("a");a.href=result;
                a.download="product-ai-"+Date.now()+".jpg";a.click();
              }
            }} style={{padding:"11px",borderRadius:"12px",border:"1px solid rgba(37,211,102,0.3)",background:"rgba(37,211,102,0.08)",color:"#25d166",fontSize:"13px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>
              💾 حفظ الصورة
            </button>
          </div>
        </div>
      )}

      {error && <div style={{marginTop:"10px",fontSize:"13px",color:"#e8855a",textAlign:"center"}}>{error}</div>}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── البطاقة ──────────────────────────────────────────────────

function CardTab({ initType, initProd }) {
  const [type,   setType]   = useState(initType  ?? "discount");
  const [title,  setTitle]  = useState(initProd ? "خصم خاص — "+initProd.name : "");
  const [expiry, setExpiry] = useState("");
  const [oldP,   setOldP]   = useState(String(initProd?.sellPrice ?? ""));
  const [newP,   setNewP]   = useState(initProd ? String((initProd.sellPrice*0.75).toFixed(1)) : "");

  const t      = TYPES.find(x=>x.key===type) ?? TYPES[0];
  const oldNum = parseFloat(oldP)||0;
  const newNum = parseFloat(newP)||0;
  const disc   = oldNum>0&&newNum>0 ? Math.round((1-newNum/oldNum)*100) : 0;
  const buy    = initProd?.buyPrice ?? 0;
  const profit = newNum - buy;
  const margin = buy>0 ? ((newNum-buy)/buy)*100 : 0;
  const tl     = margin>=20?"green":margin>=0?"amber":"red";
  const TLC    = {green:"#8aab8e",amber:"#d4a853",red:"#e8855a"};
  const TLL    = {green:"🟢 آمن — ربح جيد",amber:"🟡 هامش ضعيف",red:"🔴 خطر — خسارة"};

  const TEMPLATES = [
    {type:"discount",title:"خصم [X]% على [المنتج]"},
    {type:"bundle",  title:"[منتج 1] + [منتج 2] كومبو"},
    {type:"clear",   title:"تصفية — [المنتج] بسعر التكلفة"},
    {type:"seasonal",title:"عرض [الموسم] — [المنتج]"},
    {type:"buy3",    title:"اشتري 3 واحصل على خصم"},
  ];

  const sendMsg = () => {
    const msg = "🎯 طلب عرض — البارو\n━━━━━━━━━━━━\n" +
      t.icon+" "+t.label+"\n"+
      (title?"العنوان: "+title+"\n":"") +
      (initProd?"المنتج: "+initProd.name+"\n":"") +
      (oldNum?"السعر القديم: "+oldNum+" ﷼\n":"") +
      (newNum?"السعر الجديد: "+newNum+" ﷼\n":"") +
      (disc?"الخصم: "+disc+"%\n":"") +
      (expiry?"ينتهي: "+expiry+"\n":"") +
      "━━━━━━━━━━━━\nيرجى التنفيذ في Odoo 🙏";
    navigator.clipboard.writeText(msg)
      .then(()=>alert("✅ تم النسخ — افتح واتساب وألصق"))
      .catch(()=>alert(msg));
  };

  const inp = (val, set, label, ph, type="text") => (
    <div>
      <div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)",marginBottom:"6px"}}>{label}</div>
      <input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph}
        style={{width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(212,168,83,0.15)",borderRadius:"12px",padding:"11px 14px",color:S.white,fontSize:"14px",fontFamily:"Cairo,sans-serif",outline:"none"}} />
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>

      {/* نوع العرض */}
      <div style={{background:S.card,border:"1px solid "+S.border,borderRadius:S.rs,padding:"16px"}}>
        <div style={{fontSize:"13px",fontWeight:"700",color:"rgba(212,168,83,0.6)",marginBottom:"12px"}}>نوع العرض</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px"}}>
          {TYPES.map(ot=>(
            <button key={ot.key} onClick={()=>setType(ot.key)} style={{padding:"11px 6px",borderRadius:"13px",border:"none",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontSize:"12px",fontWeight:"700",background:type===ot.key?ot.color+"20":"rgba(255,255,255,0.04)",color:type===ot.key?ot.color:"rgba(255,255,255,0.35)",border:type===ot.key?"1px solid "+ot.color+"45":"1px solid rgba(255,255,255,0.07)",display:"flex",flexDirection:"column",alignItems:"center",gap:"5px",transition:"all 0.2s"}}>
              <span style={{fontSize:"22px"}}>{ot.icon}</span>{ot.label}
            </button>
          ))}
        </div>
      </div>

      {/* قوالب */}
      <div style={{background:S.card,border:"1px solid "+S.border,borderRadius:S.rs,padding:"16px"}}>
        <div style={{fontSize:"13px",fontWeight:"700",color:"rgba(212,168,83,0.6)",marginBottom:"11px"}}>⚡ قوالب جاهزة</div>
        {TEMPLATES.map((tm,i)=>{
          const tmT = TYPES.find(x=>x.key===tm.type);
          return (
            <button key={i} onClick={()=>{setType(tm.type);setTitle(tm.title);}} style={{display:"flex",alignItems:"center",gap:"10px",padding:"11px 13px",borderRadius:"12px",border:"1px solid rgba(255,255,255,0.07)",background:"rgba(255,255,255,0.03)",cursor:"pointer",fontFamily:"Cairo,sans-serif",textAlign:"right",width:"100%",marginBottom:"6px"}}>
              <span style={{fontSize:"18px",flexShrink:0}}>{tmT?.icon}</span>
              <div style={{flex:1,minWidth:0,fontSize:"14px",fontWeight:"700",color:"rgba(255,255,255,0.75)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tm.title}</div>
              <span style={{fontSize:"12px",color:"rgba(255,255,255,0.25)",flexShrink:0}}>←</span>
            </button>
          );
        })}
      </div>

      {/* التفاصيل */}
      <div style={{background:S.card,border:"1px solid "+S.border,borderRadius:S.rs,padding:"16px",display:"flex",flexDirection:"column",gap:"11px"}}>
        <div style={{fontSize:"13px",fontWeight:"700",color:"rgba(212,168,83,0.6)"}}>✏️ تفاصيل العرض</div>
        {inp(title,setTitle,"العنوان*","اكتب عنوان العرض")}
        {inp(expiry,setExpiry,"تاريخ الانتهاء","مثال: 30 مايو 2026")}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"9px"}}>
          {inp(oldP,setOldP,"السعر القديم ﷼","0","number")}
          {inp(newP,setNewP,"السعر الجديد ﷼","0","number")}
        </div>
      </div>

      {/* Gemini AI */}
      {initProd && <GeminiGen productName={initProd.name} productImage={initProd.barcode && images?.[initProd.barcode] || null} onAddToCard={(img)=>{}} />}

      {/* حاسبة الربح */}
      {oldNum>0&&newNum>0&&buy>0 && (
        <div style={{padding:"16px",borderRadius:"14px",background:TLC[tl]+"08",border:"1px solid "+TLC[tl]+"25"}}>
          <div style={{fontSize:"15px",fontWeight:"900",color:TLC[tl],marginBottom:"12px"}}>{TLL[tl]}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px"}}>
            {[["سعر الشراء",buy+" ﷼","rgba(255,255,255,0.45)"],["الربح",profit.toFixed(1)+" ﷼",TLC[tl]],["الهامش",margin.toFixed(1)+"%",TLC[tl]]].map(([l,v,c])=>(
              <div key={l} style={{background:"rgba(255,255,255,0.04)",borderRadius:"10px",padding:"10px",textAlign:"center"}}>
                <div style={{fontSize:"15px",fontWeight:"900",color:c}}>{v}</div>
                <div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)",marginTop:"3px"}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* معاينة */}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
        <div style={{fontSize:"12px",color:"rgba(212,168,83,0.5)",fontWeight:"700",letterSpacing:"0.1em"}}>معاينة البطاقة — A5 عمودي</div>
        <div style={{width:"100%",maxWidth:"320px",background:"#0d0b06",borderRadius:"22px",overflow:"hidden",border:"1.5px solid "+t.color+"28",boxShadow:"0 8px 40px "+t.color+"12"}}>
          <div style={{background:"linear-gradient(135deg,"+t.color+"ee,"+t.color+"99)",padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:"9px"}}>
              <span style={{fontSize:"24px"}}>{t.icon}</span>
              <span style={{fontSize:"18px",fontWeight:"900",color:"#0a0804"}}>{t.label}</span>
            </div>
            <span style={{fontSize:"13px",color:"rgba(10,8,4,0.5)"}}>البارو</span>
          </div>
          <div style={{height:"120px",display:"flex",gap:"1px",borderBottom:"1px solid "+t.color+"15"}}>
            {[1,2,3].map(i=>(
              <div key={i} style={{flex:1,background:"rgba(255,245,220,0.03)",display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.12)",fontSize:"22px",borderLeft:i>1?"1px solid "+t.color+"10":"none"}}>📷</div>
            ))}
          </div>
          <div style={{padding:"16px 18px 14px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{fontSize:"18px",fontWeight:"900",color:S.white,lineHeight:"1.3"}}>{title||"عنوان العرض"}</div>
          </div>
          <div style={{padding:"14px 18px",background:t.color+"08",borderBottom:"1px solid "+t.color+"12",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              {oldNum>0&&<div style={{fontSize:"13px",color:"rgba(255,255,255,0.3)",textDecoration:"line-through",marginBottom:"4px"}}>{oldNum} ﷼</div>}
              <div style={{fontSize:"28px",fontWeight:"900",color:t.color,lineHeight:1}}>{newNum||"—"} <span style={{fontSize:"14px"}}>﷼</span></div>
            </div>
            {disc>0&&<div style={{background:"linear-gradient(135deg,"+t.color+","+t.color+"99)",borderRadius:"13px",padding:"10px 16px",textAlign:"center",color:"#0a0804",fontWeight:"900"}}><div style={{fontSize:"22px",lineHeight:1}}>{disc}%</div><div style={{fontSize:"10px",marginTop:"2px"}}>خصم</div></div>}
          </div>
          {expiry&&<div style={{padding:"11px 18px",background:"rgba(0,0,0,0.3)",fontSize:"13px",color:"rgba(255,255,255,0.3)",display:"flex",gap:"7px"}}><span>⏰</span><span>ينتهي: {expiry}</span></div>}
        </div>

        <div style={{width:"100%",maxWidth:"320px",display:"flex",flexDirection:"column",gap:"10px"}}>
          <button style={{width:"100%",padding:"14px",borderRadius:"14px",border:"none",background:"linear-gradient(135deg,#d4a853,#b8935a)",color:"#0a0804",fontSize:"15px",fontWeight:"900",cursor:"pointer",fontFamily:"Cairo,sans-serif",boxShadow:"0 4px 20px rgba(212,168,83,0.3)"}}>🖨️ طباعة A5 / حفظ PDF</button>
          <button onClick={sendMsg} style={{width:"100%",padding:"14px",borderRadius:"14px",border:"1px solid rgba(37,211,102,0.35)",background:"rgba(37,211,102,0.1)",color:"#25d166",fontSize:"15px",fontWeight:"900",cursor:"pointer",fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px"}}>
            <span style={{fontSize:"20px"}}>📋</span> نسخ رسالة Odoo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── الشاشة الرئيسية ─────────────────────────────────────────

export default function IdeasScreen({ products = [], periods = [], settings = {}, images = {}, onSaveImage, onRemoveImage }) {
  const [tab,  setTab]  = useState("suggestions");
  const [bT,   setBT]   = useState(null);
  const [bP,   setBP]   = useState(null);

  // حساب البيانات من props
  const PRODUCTS = useMemo(() => products.map(p => {
    const bought  = totalPurchases(p);
    const sold    = soldAllPeriods(p.barcode, periods);
    const closing = Math.max(0, bought - sold);
    const soldPct = bought > 0 ? (sold/bought)*100 : 0;
    const buyPrice = num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
    return { ...p, qty: bought, soldPct, buyPrice, closing };
  }), [products, periods]);

  const FACTORIES = useMemo(() => {
    const codes = [...new Set(products.map(p => getFactoryCode(p.barcode)).filter(Boolean))];
    return codes.map(code => {
      const prods   = PRODUCTS.filter(p => getFactoryCode(p.barcode) === code);
      const bought  = prods.reduce((s,p) => s+p.qty, 0);
      const sold    = prods.reduce((s,p) => s+Math.round(p.qty*p.soldPct/100), 0);
      const soldPct = bought > 0 ? (sold/bought)*100 : 0;
      const lostVal = prods.reduce((s,p) => s + p.closing * p.buyPrice, 0);
      return { code, name: settings?.factories?.[code] ?? "", products: prods.length, soldPct, lostVal };
    }).filter(f => f.soldPct < 40 && f.lostVal > 0).sort((a,b) => a.soldPct-b.soldPct).slice(0,3);
  }, [PRODUCTS, products, settings]);

  const BRANCHES = useMemo(() => {
    const branches = allBranches(periods);
    return branches.map(b => {
      const rev = periods.reduce((s,per) =>
        s + Object.values(per.sales?.[b]??{}).reduce((ss,v)=>ss+num(v.totalPrice),0), 0);
      const sold = products.map(p => ({
        name: p.name,
        sold: periods.reduce((s,per)=>s+num(per.sales?.[b]?.[p.barcode]?.qty??0),0)
      }));
      const weak = sold.filter(p=>p.sold===0).map(p=>p.name).slice(0,3);
      return { name:b, rev, rank:0, weak };
    }).sort((a,b)=>b.rev-a.rev).map((b,i)=>({...b,rank:i+1})).filter(b=>b.rank>=3).slice(0,3);
  }, [products, periods]);

  const onBuild = (type, prod) => { setBT(type); setBP(prod); setTab("builder"); };

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;font-family:'Cairo',sans-serif}
    body{background:#0a0804;color:#f0e6d0;direction:rtl}
    .ab1{position:fixed;width:500px;height:500px;top:-150px;right:-100px;background:radial-gradient(circle,rgba(212,168,83,0.1) 0%,transparent 70%);animation:d1 14s ease-in-out infinite alternate;pointer-events:none;z-index:0}
    .ab2{position:fixed;width:400px;height:400px;bottom:-80px;left:-100px;background:radial-gradient(circle,rgba(184,151,90,0.08) 0%,transparent 70%);animation:d2 18s ease-in-out infinite alternate;pointer-events:none;z-index:0}
    @keyframes d1{from{transform:translate(0,0)}to{transform:translate(-50px,70px)}}
    @keyframes d2{from{transform:translate(0,0)}to{transform:translate(60px,-50px)}}
    ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(212,168,83,0.2);border-radius:3px}
    input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
  `;

  return (
    <>
      <style>{CSS}</style>
      <div className="ab1"/><div className="ab2"/>
      <div style={{position:"relative",zIndex:1,minHeight:"100vh",padding:"20px 16px 48px",maxWidth:"440px",margin:"0 auto"}}>

        <div style={{marginBottom:"20px"}}>
          <h1 style={{fontSize:"30px",fontWeight:"900",color:"#ffffff",marginBottom:"5px"}}>مختبر الأفكار</h1>
          <p style={{fontSize:"14px",color:"rgba(212,168,83,0.7)"}}>اقتراحات ذكية · بطاقات عروض احترافية</p>
        </div>

        {PRODUCTS.length === 0 ? (
          <div style={{textAlign:"center",padding:"48px 20px"}}>
            <div style={{fontSize:"48px",marginBottom:"16px"}}>💡</div>
            <div style={{fontSize:"20px",fontWeight:"900",color:"#ffffff",marginBottom:"8px"}}>مختبر الأفكار</div>
            <div style={{fontSize:"14px",color:"rgba(212,168,83,0.7)",lineHeight:"1.6"}}>
              ارفع فاتورة شراء وملف مبيعات<br/>لتظهر الاقتراحات والتحليلات
            </div>
          </div>
        ) : (
          <>
            <SmartAlert onBuild={onBuild} />
            <TodayCard onBuild={onBuild} />
          </>
        )}

        {/* تبويبات */}
        <div style={{display:"flex",gap:"3px",padding:"4px",background:"rgba(255,245,220,0.05)",border:"1px solid rgba(212,168,83,0.15)",borderRadius:"16px",marginBottom:"16px"}}>
          {[["suggestions","💡 اقتراحات"],["analysis","📊 تحليل"],["builder","🎨 بطاقة"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"9px 6px",borderRadius:"12px",border:"none",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontSize:"13px",fontWeight:"700",color:tab===k?"#d4a853":"rgba(255,255,255,0.35)",background:tab===k?"rgba(212,168,83,0.15)":"transparent",border:tab===k?"1px solid rgba(212,168,83,0.3)":"1px solid transparent",transition:"all 0.25s"}}>
              {l}
            </button>
          ))}
        </div>

        {tab==="suggestions" && <SuggestionsTab onBuild={onBuild} />}
        {tab==="analysis"    && <AnalysisTab onBuild={onBuild} />}
        {tab==="builder"     && <CardTab initType={bT} initProd={bP} />}
      </div>
    </>
  );
}
