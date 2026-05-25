import { useState } from "react";
import { TYPES, S, fm, fp } from "./constants.js";

function SuggestionsTab({ onBuild, PRODUCTS = [], FACTORIES = [], BRANCHES = [] }) {
  const [filter, setFilter] = useState("all");
  const weak = (PRODUCTS||[]).filter(p=>p.soldPct<50).sort((a,b)=>a.soldPct-b.soldPct);

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

export { SuggestionsTab };
