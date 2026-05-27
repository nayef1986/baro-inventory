// OperationsRoom.jsx — غرفة العمليات
import { useState, useMemo } from "react";
import { ProductImage } from "../components/ProductImage.jsx";
import {
  allBranches, totalPurchases, num, fmtN, fmtM, fmtPct,
  getFactoryCode,
} from "../lib/calc.js";

// ─── بناء القرارات ────────────────────────────────────────────

function buildDecisions(products, periods, images) {
  const sorted = [...periods].sort((a,b) =>
    (a.uploadDate??a.label) > (b.uploadDate??b.label) ? 1 : -1
  );
  const lastPer = sorted[sorted.length-1];

  const decisions = [];

  products.forEach(p => {
    const bought    = totalPurchases(p);
    const allSold   = sorted.reduce((s,per) =>
      s + Object.values(per.sales??{}).reduce((ss,d)=>ss+num(d[p.barcode]?.qty??0),0), 0);
    const closing   = Math.max(0, bought - allSold);
    const soldPct   = bought > 0 ? (allSold/bought)*100 : 0;
    const buyPrice  = num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
    const sellPrice = num(p.sellPrice ?? 0);
    const margin    = buyPrice > 0 ? ((sellPrice-buyPrice)/buyPrice)*100 : 0;
    const frozenVal = closing * buyPrice;

    const lastQ  = sorted.slice(-1).reduce((s,per) =>
      s + Object.values(per.sales??{}).reduce((ss,d)=>ss+num(d[p.barcode]?.qty??0),0), 0);
    const prevQ  = sorted.slice(-2,-1).reduce((s,per) =>
      s + Object.values(per.sales??{}).reduce((ss,d)=>ss+num(d[p.barcode]?.qty??0),0), 0);
    const growth = prevQ > 0 ? ((lastQ-prevQ)/prevQ)*100 : 0;

    const avgMonthly = sorted.length > 0
      ? sorted.reduce((s,per) =>
          s + Object.values(per.sales??{}).reduce((ss,d)=>ss+num(d[p.barcode]?.qty??0),0), 0) / sorted.length
      : 0;
    const daysLeft = avgMonthly > 0 ? Math.round((closing/avgMonthly)*30) : 999;

    const monthly = sorted.slice(-6).map(per => ({
      label: per.label?.slice(0,6) ?? "",
      qty: Object.values(per.sales??{}).reduce((s,d)=>s+num(d[p.barcode]?.qty??0),0),
    }));

    const base = { ...p, bought, allSold, closing, soldPct, buyPrice, sellPrice, margin, frozenVal, lastQ, prevQ, growth, avgMonthly, daysLeft, monthly };

    // 🔴 مخزون مجمّد + راكد
    if (soldPct < 25 && frozenVal > 300 && bought > 0) {
      decisions.push({
        priority: "red", urgency: "high",
        icon: "🔴", tag: "تصريف عاجل",
        title: p.name,
        headline: `${fmtN(closing)} قطعة راكدة — ${fmtM(frozenVal)} مجمّدة`,
        reason: `${fmtPct(soldPct)} مباع فقط خلال ${sorted.length} فترة`,
        cost: `كل يوم تأخير = ${fmtM(frozenVal/30)} ﷼ مجمّدة`,
        action: "clear",
        actionLabel: "أنشئ عرض تصفية",
        product: base,
      });
    }

    // 🔴 على وشك النفاد + صاعد
    if (daysLeft <= 21 && closing > 0 && growth > 0) {
      decisions.push({
        priority: "red", urgency: "immediate",
        icon: "⚡", tag: "أعد الطلب",
        title: p.name,
        headline: `ينفد خلال ${daysLeft} يوم`,
        reason: `صاعد ${growth > 0 ? "+" : ""}${Math.round(growth)}% — معدل ${Math.round(avgMonthly)} قطعة/شهر`,
        cost: `فرصة ضائعة إذا نفد`,
        action: "reorder",
        actionLabel: "اطلب المزيد",
        product: base,
      });
    }

    // 🟡 صاعد قوي
    if (growth > 40 && lastQ > 0) {
      decisions.push({
        priority: "amber", urgency: "soon",
        icon: "📈", tag: "فرصة نمو",
        title: p.name,
        headline: `صاعد ${Math.round(growth)}% — ركّز عليه`,
        reason: `من ${fmtN(prevQ)} إلى ${fmtN(lastQ)} قطعة`,
        cost: `ربح إضافي محتمل: ${fmtM(lastQ * (sellPrice-buyPrice))} ﷼`,
        action: "campaign",
        actionLabel: "أنشئ حملة",
        product: base,
      });
    }

    // 🟢 هامش عالي + مبيعات ضعيفة = فرصة مخفية
    if (margin > 50 && soldPct < 40 && closing > 20) {
      decisions.push({
        priority: "green", urgency: "planned",
        icon: "💰", tag: "فرصة ربح",
        title: p.name,
        headline: `هامش ${Math.round(margin)}% — غير مستغل`,
        reason: `${fmtPct(soldPct)} مباع فقط رغم الهامش العالي`,
        cost: `ربح محتمل: ${fmtM(closing * (sellPrice-buyPrice))} ﷼`,
        action: "campaign",
        actionLabel: "أنشئ بطاقة",
        product: base,
      });
    }
  });

  // ترتيب: عاجل أولاً ثم بالتكلفة
  const order = { immediate:0, high:1, soon:2, planned:3 };
  return decisions
    .sort((a,b) => (order[a.urgency]??4) - (order[b.urgency]??4))
    .slice(0, 15);
}

// ─── بطاقة القرار ────────────────────────────────────────────

function DecisionCard({ d, images, settings, onAction }) {
  const [open, setOpen] = useState(false);
  const p = d.product;
  const COLORS = {
    red:   { bg:"rgba(232,133,90,0.08)", border:"rgba(232,133,90,0.25)", text:"#e8855a", tag:"rgba(232,133,90,0.15)" },
    amber: { bg:"rgba(212,168,83,0.08)",  border:"rgba(212,168,83,0.25)",  text:"#d4a853", tag:"rgba(212,168,83,0.15)"  },
    green: { bg:"rgba(138,171,142,0.08)", border:"rgba(138,171,142,0.25)", text:"#8aab8e", tag:"rgba(138,171,142,0.15)" },
  };
  const C = COLORS[d.priority] ?? COLORS.amber;
  const factoryCode = getFactoryCode(p.barcode) ?? p.barcode?.slice(0,5) ?? "";

  // رسم بياني مصغر
  const max = Math.max(...p.monthly.map(m=>m.qty), 1);

  return (
    <div style={{borderRadius:"18px",overflow:"hidden",border:`1px solid ${C.border}`,marginBottom:"12px",background:C.bg}}>
      {/* هيدر القرار */}
      <div onClick={()=>setOpen(p=>!p)} style={{padding:"14px 16px",cursor:"pointer",display:"flex",gap:"12px",alignItems:"flex-start"}}>
        <span style={{fontSize:"22px",flexShrink:0,marginTop:"2px"}}>{d.icon}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:"7px",marginBottom:"5px",flexWrap:"wrap"}}>
            <span style={{fontSize:"11px",fontWeight:"700",color:C.text,background:C.tag,padding:"3px 9px",borderRadius:"100px"}}>{d.tag}</span>
            <span style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>{d.urgency==="immediate"?"🔴 الآن":d.urgency==="high"?"🟡 عاجل":"🟢 مخطط"}</span>
          </div>
          <div style={{fontSize:"15px",fontWeight:"900",color:"#ffffff",marginBottom:"4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.title}</div>
          <div style={{fontSize:"13px",fontWeight:"700",color:C.text,marginBottom:"3px"}}>{d.headline}</div>
          <div style={{fontSize:"12px",color:"rgba(255,255,255,0.45)"}}>{d.reason}</div>
        </div>
        <div style={{fontSize:"13px",color:C.text,flexShrink:0}}>{open?"▲":"▼"}</div>
      </div>

      {/* التفاصيل الكاملة */}
      {open && (
        <div style={{borderTop:`1px solid ${C.border}`,background:"rgba(0,0,0,0.25)"}}>

          {/* صورة + معلومات المنتج */}
          <div style={{padding:"14px 16px",display:"flex",gap:"13px",alignItems:"flex-start",borderBottom:`1px solid rgba(255,255,255,0.05)`}}>
            <div style={{width:"72px",height:"72px",borderRadius:"14px",overflow:"hidden",flexShrink:0,border:`1px solid ${C.border}`}}>
              {images?.[p.barcode] ? (
                <img src={images[p.barcode]} alt={p.name} style={{width:"100%",height:"100%",objectFit:"cover"}} />
              ) : (
                <div style={{width:"100%",height:"100%",background:"rgba(255,255,255,0.05)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"26px"}}>📦</div>
              )}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:"15px",fontWeight:"900",color:"#ffffff",marginBottom:"4px"}}>{p.name}</div>
              <div style={{fontSize:"11px",fontFamily:"monospace",color:"rgba(255,255,255,0.35)",marginBottom:"3px"}}>{p.barcode}</div>
              <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                <span style={{fontSize:"11px",color:"rgba(212,168,83,0.7)"}}>🏭 {factoryCode}</span>
                {p.container && <span style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>📦 {p.container}</span>}
              </div>
            </div>
          </div>

          {/* الأرقام */}
          <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"7px",borderBottom:`1px solid rgba(255,255,255,0.05)`}}>
            {[
              ["مشتريات", fmtN(p.bought),              "rgba(255,255,255,0.5)"],
              ["متبقي",   fmtN(p.closing),              C.text],
              ["سعر شراء", `${p.buyPrice} ﷼`,           "#d4a853"],
              ["هامش",    `${Math.round(p.margin)}%`,   p.margin>30?"#8aab8e":"#e8855a"],
            ].map(([l,v,c])=>(
              <div key={l} style={{background:"rgba(255,255,255,0.04)",borderRadius:"10px",padding:"8px",textAlign:"center"}}>
                <div style={{fontSize:"13px",fontWeight:"900",color:c}}>{v}</div>
                <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginTop:"2px"}}>{l}</div>
              </div>
            ))}
          </div>

          {/* رسم بياني */}
          {p.monthly.some(m=>m.qty>0) && (
            <div style={{padding:"12px 16px",borderBottom:`1px solid rgba(255,255,255,0.05)`}}>
              <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginBottom:"7px"}}>الترند الشهري</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:"3px",height:"36px"}}>
                {p.monthly.map((m,i)=>(
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"3px"}}>
                    <div style={{
                      width:"100%",borderRadius:"3px 3px 0 0",
                      background: i===p.monthly.length-1 ? C.text : `${C.text}55`,
                      height: `${max>0?(m.qty/max)*100:0}%`,
                      minHeight: m.qty>0?"2px":"0",
                    }} />
                  </div>
                ))}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:"4px"}}>
                <span style={{fontSize:"9px",color:"rgba(255,255,255,0.2)"}}>{p.monthly[0]?.label}</span>
                <span style={{fontSize:"9px",color:"rgba(255,255,255,0.2)"}}>{p.monthly[p.monthly.length-1]?.label}</span>
              </div>
            </div>
          )}

          {/* التكلفة والسبب */}
          <div style={{padding:"12px 16px",borderBottom:`1px solid rgba(255,255,255,0.05)`}}>
            <div style={{fontSize:"12px",color:C.text,fontWeight:"700",marginBottom:"3px"}}>💡 {d.cost}</div>
          </div>

          {/* الإجراء */}
          <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
            <button onClick={()=>onAction(d)} style={{
              padding:"11px",borderRadius:"13px",border:"none",
              background:`linear-gradient(135deg,${C.text},${C.text}99)`,
              color:"#0a0804",fontSize:"13px",fontWeight:"900",
              cursor:"pointer",fontFamily:"Cairo,sans-serif",
            }}>{d.actionLabel}</button>
            <button onClick={()=>{
              const text = `📦 ${p.name}\n🔖 ${p.barcode}\n🏭 ${factoryCode}\n💡 ${d.headline}\n📊 ${d.reason}`;
              navigator.clipboard.writeText(text).then(()=>alert("✅ تم النسخ")).catch(()=>alert(text));
            }} style={{
              padding:"11px",borderRadius:"13px",border:`1px solid rgba(255,255,255,0.1)`,
              background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.6)",
              fontSize:"13px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif",
            }}>📋 نسخ IT</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── نبض الفروع ──────────────────────────────────────────────

function BranchPulse({ periods }) {
  const sorted = [...periods].sort((a,b) =>
    (a.uploadDate??a.label) > (b.uploadDate??b.label) ? 1 : -1
  );
  const lastPer  = sorted[sorted.length-1];
  const prevPer  = sorted[sorted.length-2];

  const branches = allBranches(periods);

  const data = branches.map(b => {
    const last = Object.values(lastPer?.sales?.[b]??{}).reduce((s,v)=>s+num(v.totalPrice),0);
    const prev = Object.values(prevPer?.sales?.[b]??{}).reduce((s,v)=>s+num(v.totalPrice),0);
    const growth = prev > 0 ? ((last-prev)/prev)*100 : 0;
    return { name:b, last, prev, growth };
  }).filter(b=>b.last>0).sort((a,b)=>b.last-a.last).slice(0,8);

  if (data.length === 0) return null;

  const max = Math.max(...data.map(b=>b.last), 1);

  return (
    <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"16px",padding:"16px",marginBottom:"14px"}}>
      <div style={{fontSize:"14px",fontWeight:"900",color:"#ffffff",marginBottom:"14px"}}>🏪 نبض الفروع</div>
      <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
        {data.map((b,i)=>(
          <div key={b.name} style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <span style={{fontSize:"12px",fontWeight:"900",color:i===0?"#d4a853":i===1?"#94a3b8":"#78716c",width:"16px",flexShrink:0}}>{i+1}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:"3px"}}>
                <span style={{fontSize:"12px",fontWeight:"700",color:"rgba(255,255,255,0.7)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"140px"}}>{b.name}</span>
                <span style={{fontSize:"12px",fontWeight:"900",color:b.growth>0?"#8aab8e":b.growth<0?"#e8855a":"#d4a853",flexShrink:0}}>
                  {b.growth>0?"+":""}{Math.round(b.growth)}%
                </span>
              </div>
              <div style={{height:"5px",background:"rgba(255,255,255,0.06)",borderRadius:"100px",overflow:"hidden"}}>
                <div style={{
                  height:"100%",
                  width:`${(b.last/max)*100}%`,
                  borderRadius:"100px",
                  background: b.growth>10?"#8aab8e":b.growth<-10?"#e8855a":"#d4a853",
                  transition:"width 0.5s",
                }} />
              </div>
              <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginTop:"2px"}}>{fmtM(b.last)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── الملخص المالي ────────────────────────────────────────────

function FinancialSummary({ products, periods }) {
  const totalRevenue = periods.reduce((s,per) =>
    s + Object.values(per.sales??{}).reduce((ss,b) =>
      ss + Object.values(b).reduce((sss,v)=>sss+num(v.totalPrice),0), 0), 0);

  const totalCost = products.reduce((s,p) => {
    const allSold = periods.reduce((ss,per) =>
      ss + Object.values(per.sales??{}).reduce((sss,b)=>sss+num(b[p.barcode]?.qty??0),0), 0);
    return s + allSold * num(p.purchases?.slice(-1)[0]?.buyPrice??0);
  }, 0);

  const totalProfit  = totalRevenue - totalCost;
  const totalFrozen  = products.reduce((s,p) => {
    const bought  = totalPurchases(p);
    const allSold = periods.reduce((ss,per) =>
      ss + Object.values(per.sales??{}).reduce((sss,b)=>sss+num(b[p.barcode]?.qty??0),0), 0);
    return s + Math.max(0, bought-allSold) * num(p.purchases?.slice(-1)[0]?.buyPrice??0);
  }, 0);

  return (
    <div style={{background:"linear-gradient(135deg,rgba(212,168,83,0.1),rgba(212,168,83,0.04))",border:"1px solid rgba(212,168,83,0.2)",borderRadius:"18px",padding:"16px",marginBottom:"14px"}}>
      <div style={{fontSize:"13px",color:"rgba(212,168,83,0.7)",marginBottom:"12px",fontWeight:"700"}}>💰 الصحة المالية</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"8px"}}>
        {[
          ["إيراد كلي",   fmtM(totalRevenue), "#d4a853"],
          ["ربح صافي",    fmtM(totalProfit),  "#8aab8e"],
          ["قيمة مجمّدة", fmtM(totalFrozen),  "#e8855a"],
          ["هامش كلي",    totalRevenue>0?fmtPct((totalProfit/totalRevenue)*100):"—", "#a89fc4"],
        ].map(([l,v,c])=>(
          <div key={l} style={{background:"rgba(255,255,255,0.05)",borderRadius:"12px",padding:"11px",textAlign:"center"}}>
            <div style={{fontSize:"16px",fontWeight:"900",color:c}}>{v}</div>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginTop:"3px"}}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── غرفة العمليات الرئيسية ───────────────────────────────────

export function OperationsRoom({ products, periods, images, settings, onBuildCard }) {
  const [filter, setFilter] = useState("all");

  const decisions = useMemo(
    () => buildDecisions(products, periods, images),
    [products, periods]
  );

  const filtered = filter === "all" ? decisions
    : decisions.filter(d => d.priority === filter);

  const counts = {
    red:   decisions.filter(d=>d.priority==="red").length,
    amber: decisions.filter(d=>d.priority==="amber").length,
    green: decisions.filter(d=>d.priority==="green").length,
  };

  const today = new Date().toLocaleDateString("ar-SA", {weekday:"long",day:"numeric",month:"long"});

  const handleAction = (d) => {
    if (onBuildCard) onBuildCard({ type: d.action, product: d.product.name, barcode: d.product.barcode });
  };

  return (
    <div style={{direction:"rtl",fontFamily:"Cairo,sans-serif"}}>

      {/* هيدر */}
      <div style={{marginBottom:"16px"}}>
        <div style={{fontSize:"13px",color:"rgba(212,168,83,0.6)",marginBottom:"3px"}}>{today}</div>
        <div style={{fontSize:"22px",fontWeight:"900",color:"#ffffff",marginBottom:"3px"}}>غرفة العمليات</div>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)"}}>
          {products.length} منتج · {periods.length} فترة · {decisions.length} قرار
        </div>
      </div>

      {/* الملخص المالي */}
      <FinancialSummary products={products} periods={periods} />

      {/* القرارات */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
        <div style={{fontSize:"14px",fontWeight:"900",color:"#ffffff"}}>⚡ القرارات</div>
        <div style={{display:"flex",gap:"5px"}}>
          {[["all","الكل"],["red","عاجل"],["amber","فرصة"],["green","ربح"]].map(([k,l])=>(
            <button key={k} onClick={()=>setFilter(k)} style={{
              padding:"5px 10px",borderRadius:"100px",border:"none",cursor:"pointer",
              fontFamily:"Cairo,sans-serif",fontSize:"11px",fontWeight:"700",
              background:filter===k?"rgba(212,168,83,0.2)":"rgba(255,255,255,0.05)",
              color:filter===k?"#d4a853":"rgba(255,255,255,0.4)",
              border:filter===k?"1px solid rgba(212,168,83,0.4)":"1px solid rgba(255,255,255,0.08)",
            }}>{l} {k!=="all"?`(${counts[k]??0})`:""}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div style={{textAlign:"center",padding:"40px",color:"rgba(255,255,255,0.3)"}}>
          <div style={{fontSize:"36px",marginBottom:"10px"}}>✅</div>
          <div>لا توجد قرارات</div>
        </div>
      )}

      {filtered.map((d,i) => (
        <DecisionCard key={i} d={d} images={images} settings={settings} onAction={handleAction} />
      ))}

      {/* نبض الفروع */}
      {periods.length >= 2 && <BranchPulse periods={periods} />}
    </div>
  );
}
