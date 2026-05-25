import { useState } from "react";
import { S, fm, fp } from "./constants.js";

function AnalysisTab({ onBuild, PRODUCTS = [] }) {
  const [openIdx, setOpenIdx] = useState(null);

  const C = {red:"#e8855a", amber:"#d4a853", green:"#8aab8e"};

  const rows = [
    { lv:"red",   icon:"🔴", title:"Fake Nail — نفاد وشيك",    desc:"422 قطعة · 12% مباع",       val:"14 يوم",  tip:"خصم 25% لتحريك المخزون",              prod:(PRODUCTS||[]).find(p=>p.name==="Fake Nail") ?? null, otype:"discount" },
    { lv:"red",   icon:"🔴", title:"مصنع الخليج — خطير",       desc:"15% مباع · 3,120 ﷼ مجمّدة",  val:"-3,120 ﷼",tip:"تصفية بسعر التكلفة",                  prod:null, otype:"clear" },
    { lv:"amber", icon:"🟡", title:"البارو النور — ضعيف",      desc:"الأدنى إيراداً",             val:"#5",      tip:"كومبو خاص لهذا الفرع",                prod:null, otype:"bundle" },
    { lv:"amber", icon:"🟡", title:"Bag — ما تحرك",            desc:"3 أسابيع بدون بيع",          val:"⚠️",      tip:"خصم 30% أو تصفية",                   prod:(PRODUCTS||[]).find(p=>p.name==="Bag") ?? null, otype:"discount" },
    { lv:"green", icon:"🟢", title:"Lip Gloss — فرصة تكرار",  desc:"71% مباع · كرّره",           val:"+30%",    tip:"زد الكمية 30% في الكونتينر القادم",   prod:(PRODUCTS||[]).find(p=>p.name==="Lip Gloss") ?? null, otype:"bundle" },
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

export { AnalysisTab };
