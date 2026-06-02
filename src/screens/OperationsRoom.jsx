// OperationsRoom.jsx — غرفة العمليات
import { useState, useMemo } from "react";
import { ProductImage } from "../components/ProductImage.jsx";
import {
  allBranches, totalPurchases, num, fmtN, fmtM, fmtPct,
  getFactoryCode,
} from "../lib/calc.js";

// حدود منطقية لاستبعاد القيم الشاذة (أخطاء إدخال/مضاعفة)
const MAX_REASONABLE_QTY   = 100000;  // كمية منتج واحد
const MAX_REASONABLE_PRICE = 5000;    // سعر شراء منتج واحد

// مبيعات منتج عبر كل الفترات
function soldOf(barcode, periods) {
  return periods.reduce((s,per) =>
    s + Object.values(per.sales??{}).reduce((ss,d)=>ss+num(d[barcode]?.qty??0),0), 0);
}

// قيم آمنة للمنتج (مع تنظيف الشاذ)
function safeMetrics(p, periods) {
  let bought    = totalPurchases(p);
  let buyPrice  = num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
  const sellPrice = num(p.sellPrice ?? 0);
  const allSold = soldOf(p.barcode, periods);

  // تنظيف الشاذ: لو الكمية أو السعر مستحيل، نعتبره خطأ إدخال
  const anomaly = bought > MAX_REASONABLE_QTY || buyPrice > MAX_REASONABLE_PRICE;
  if (bought > MAX_REASONABLE_QTY) bought = allSold; // نستخدم المباع كتقدير
  if (buyPrice > MAX_REASONABLE_PRICE) buyPrice = 0;

  const closing   = Math.max(0, bought - allSold);
  const soldPct   = bought > 0 ? (allSold/bought)*100 : 0;
  const margin    = buyPrice > 0 ? ((sellPrice-buyPrice)/buyPrice)*100 : 0;
  const frozenVal = closing * buyPrice;

  return { bought, buyPrice, sellPrice, allSold, closing, soldPct, margin, frozenVal, anomaly };
}

function calcHealthScore(product, periods) {
  const sorted = [...periods].sort((a,b) =>
    (a.uploadDate??a.label) > (b.uploadDate??b.label) ? 1 : -1
  );
  const m = safeMetrics(product, periods);
  const lastQ = sorted.slice(-1).reduce((s,per) =>
    s + Object.values(per.sales??{}).reduce((ss,d)=>ss+num(d[product.barcode]?.qty??0),0), 0);
  const prevQ = sorted.slice(-2,-1).reduce((s,per) =>
    s + Object.values(per.sales??{}).reduce((ss,d)=>ss+num(d[product.barcode]?.qty??0),0), 0);
  const growth = prevQ > 0 ? ((lastQ-prevQ)/prevQ)*100 : 0;
  const avgMonth = sorted.length > 0 ? m.allSold/sorted.length : 0;
  const daysLeft = avgMonth > 0 ? Math.round((m.closing/avgMonth)*30) : 999;

  let score = 0;
  score += Math.min(30, m.soldPct * 0.3);
  score += Math.min(20, Math.max(0, growth) * 0.2);
  score += Math.min(20, m.margin * 0.2);
  score += daysLeft > 60 ? 15 : daysLeft > 30 ? 10 : 5;
  score += sorted.filter(per =>
    Object.values(per.sales??{}).some(d=>num(d[product.barcode]?.qty??0)>0)
  ).length / Math.max(sorted.length, 1) * 15;

  const rounded = Math.round(score);
  const grade = rounded >= 70 ? "strong" : rounded >= 45 ? "average" : rounded >= 25 ? "weak" : "critical";
  const color = { strong:"#8aab8e", average:"#d4a853", weak:"#f59e0b", critical:"#e8855a" }[grade];
  const label = { strong:"🟢 قوي", average:"🟡 متوسط", weak:"🟠 ضعيف", critical:"🔴 حرج" }[grade];
  return { score:rounded, grade, color, label, ...m, growth, daysLeft, avgMonth };
}

function buildDecisions(products, periods) {
  const sorted = [...periods].sort((a,b) =>
    (a.uploadDate??a.label) > (b.uploadDate??b.label) ? 1 : -1
  );
  const decisions = [];

  products.forEach(p => {
    const m = safeMetrics(p, periods);
    if (m.anomaly) return; // نتجاهل المنتجات الشاذة
    if (m.allSold === 0 && m.bought <= 12) return; // أغراض غير معروضة للبيع (ما باعت ولا قطعة)

    const lastQ = sorted.slice(-1).reduce((s,per) =>
      s + Object.values(per.sales??{}).reduce((ss,d)=>ss+num(d[p.barcode]?.qty??0),0), 0);
    const prevQ = sorted.slice(-2,-1).reduce((s,per) =>
      s + Object.values(per.sales??{}).reduce((ss,d)=>ss+num(d[p.barcode]?.qty??0),0), 0);
    const growth = prevQ > 0 ? ((lastQ-prevQ)/prevQ)*100 : 0;
    const avgMonthly = sorted.length > 0 ? m.allSold/sorted.length : 0;
    const daysLeft = avgMonthly > 0 ? Math.round((m.closing/avgMonthly)*30) : 999;
    const monthly = sorted.slice(-6).map(per => ({
      label: per.label?.slice(0,6) ?? "",
      qty: Object.values(per.sales??{}).reduce((s,d)=>s+num(d[p.barcode]?.qty??0),0),
    }));
    const base = { ...p, ...m, lastQ, prevQ, growth, avgMonthly, daysLeft, monthly };

    if (m.soldPct < 25 && m.frozenVal > 300 && m.bought > 0 && m.allSold > 0) {
      decisions.push({ priority:"red", urgency:"high", icon:"🔴", tag:"تصريف عاجل", title:p.name,
        headline:`${fmtN(m.closing)} قطعة راكدة — ${fmtM(m.frozenVal)} مجمّدة`,
        reason:`${fmtPct(m.soldPct)} مباع فقط خلال ${sorted.length} فترة`,
        cost:`كل يوم تأخير = ${fmtM(m.frozenVal/30)} مجمّدة`, action:"clear", actionLabel:"أنشئ عرض تصفية", product:base });
    }
    if (daysLeft <= 21 && m.closing > 0 && growth > 0) {
      decisions.push({ priority:"red", urgency:"immediate", icon:"⚡", tag:"أعد الطلب", title:p.name,
        headline:`ينفد خلال ${daysLeft} يوم`,
        reason:`صاعد ${growth>0?"+":""}${Math.round(growth)}% — معدل ${Math.round(avgMonthly)} قطعة/شهر`,
        cost:`فرصة ضائعة إذا نفد`, action:"reorder", actionLabel:"اطلب المزيد", product:base });
    }
    if (growth > 40 && lastQ > 0) {
      decisions.push({ priority:"amber", urgency:"soon", icon:"📈", tag:"فرصة نمو", title:p.name,
        headline:`صاعد ${Math.round(growth)}% — ركّز عليه`, reason:`من ${fmtN(prevQ)} إلى ${fmtN(lastQ)} قطعة`,
        cost:`ربح إضافي محتمل: ${fmtM(lastQ*(m.sellPrice-m.buyPrice))}`, action:"campaign", actionLabel:"أنشئ حملة", product:base });
    }
    if (m.margin > 50 && m.soldPct < 40 && m.closing > 20 && m.allSold > 0) {
      decisions.push({ priority:"green", urgency:"planned", icon:"💰", tag:"فرصة ربح", title:p.name,
        headline:`هامش ${Math.round(m.margin)}% — غير مستغل`, reason:`${fmtPct(m.soldPct)} مباع فقط رغم الهامش`,
        cost:`ربح محتمل: ${fmtM(m.closing*(m.sellPrice-m.buyPrice))}`, action:"campaign", actionLabel:"أنشئ بطاقة", product:base });
    }
  });

  const order = { immediate:0, high:1, soon:2, planned:3 };
  return decisions.sort((a,b)=>(order[a.urgency]??4)-(order[b.urgency]??4)).slice(0,15);
}

function DecisionCard({ d, images, onAction, periods }) {
  const [open, setOpen] = useState(false);
  const p = d.product;
  const COLORS = {
    red:   { bg:"rgba(232,133,90,0.08)", border:"rgba(232,133,90,0.25)", text:"#e8855a", tag:"rgba(232,133,90,0.15)" },
    amber: { bg:"rgba(212,168,83,0.08)", border:"rgba(212,168,83,0.25)", text:"#d4a853", tag:"rgba(212,168,83,0.15)" },
    green: { bg:"rgba(138,171,142,0.08)",border:"rgba(138,171,142,0.25)",text:"#8aab8e", tag:"rgba(138,171,142,0.15)" },
  };
  const C = COLORS[d.priority] ?? COLORS.amber;
  const factoryCode = getFactoryCode(p.barcode);
  const max = Math.max(...p.monthly.map(m=>m.qty), 1);
  const health = calcHealthScore(d.product, periods ?? []);

  return (
    <div style={{borderRadius:"18px",overflow:"hidden",border:`1px solid ${C.border}`,marginBottom:"12px",background:C.bg}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"14px 16px",cursor:"pointer",display:"flex",gap:"12px",alignItems:"flex-start"}}>
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
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"4px",flexShrink:0}}>
          <div style={{background:`${health.color}15`,border:`1px solid ${health.color}30`,borderRadius:"8px",padding:"3px 8px",textAlign:"center"}}>
            <div style={{fontSize:"14px",fontWeight:"900",color:health.color,lineHeight:1}}>{health.score}</div>
            <div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)",marginTop:"1px"}}>score</div>
          </div>
          <div style={{fontSize:"11px",color:C.text}}>{open?"▲":"▼"}</div>
        </div>
      </div>
      {open && (
        <div style={{borderTop:`1px solid ${C.border}`,background:"rgba(0,0,0,0.25)"}}>
          <div style={{padding:"14px 16px",display:"flex",gap:"13px",alignItems:"flex-start",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
            <div style={{width:"72px",height:"72px",borderRadius:"14px",overflow:"hidden",flexShrink:0,border:`1px solid ${C.border}`}}>
              {images?.[p.barcode] ? <img src={images[p.barcode]} alt={p.name} style={{width:"100%",height:"100%",objectFit:"cover"}} />
                : <div style={{width:"100%",height:"100%",background:"rgba(255,255,255,0.05)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"26px"}}>📦</div>}
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
          <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"7px",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
            {[["مشتريات",fmtN(p.bought),"rgba(255,255,255,0.5)"],["متبقي",fmtN(p.closing),C.text],["سعر شراء",`${p.buyPrice} ﷼`,"#d4a853"],["هامش",`${Math.round(p.margin)}%`,p.margin>30?"#8aab8e":"#e8855a"]].map(([l,v,c])=>(
              <div key={l} style={{background:"rgba(255,255,255,0.04)",borderRadius:"10px",padding:"8px",textAlign:"center"}}>
                <div style={{fontSize:"13px",fontWeight:"900",color:c}}>{v}</div>
                <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginTop:"2px"}}>{l}</div>
              </div>
            ))}
          </div>
          {p.monthly.some(m=>m.qty>0) && (
            <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
              <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginBottom:"7px"}}>الترند الشهري</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:"3px",height:"36px"}}>
                {p.monthly.map((m,i)=>(<div key={i} style={{flex:1,borderRadius:"3px 3px 0 0",background:i===p.monthly.length-1?C.text:`${C.text}55`,height:`${max>0?(m.qty/max)*100:0}%`,minHeight:m.qty>0?"2px":"0"}} />))}
              </div>
            </div>
          )}
          <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
            <div style={{fontSize:"12px",color:C.text,fontWeight:"700"}}>💡 {d.cost}</div>
          </div>
          <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
            <button onClick={()=>onAction(d)} style={{padding:"11px",borderRadius:"13px",border:"none",background:`linear-gradient(135deg,${C.text},${C.text}99)`,color:"#0a0804",fontSize:"13px",fontWeight:"900",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>{d.actionLabel}</button>
            <button onClick={()=>{const text=`📦 ${p.name}\n🔖 ${p.barcode}\n🏭 ${factoryCode}\n💡 ${d.headline}`;navigator.clipboard.writeText(text).then(()=>alert("✅ تم النسخ")).catch(()=>alert(text));}} style={{padding:"11px",borderRadius:"13px",border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.6)",fontSize:"13px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>📋 نسخ IT</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BranchPulse({ periods }) {
  const sorted = [...periods].sort((a,b)=>(a.uploadDate??a.label)>(b.uploadDate??b.label)?1:-1);
  const lastPer = sorted[sorted.length-1], prevPer = sorted[sorted.length-2];
  const data = allBranches(periods).map(b => {
    const last = Object.values(lastPer?.sales?.[b]??{}).reduce((s,v)=>s+num(v.totalPrice),0);
    const prev = Object.values(prevPer?.sales?.[b]??{}).reduce((s,v)=>s+num(v.totalPrice),0);
    const growth = prev>0?((last-prev)/prev)*100:0;
    return { name:b, last, prev, growth };
  }).filter(b=>b.last>0).sort((a,b)=>b.last-a.last).slice(0,8);
  if (data.length===0) return null;
  const max = Math.max(...data.map(b=>b.last),1);
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
                <span style={{fontSize:"12px",fontWeight:"900",color:b.growth>0?"#8aab8e":b.growth<0?"#e8855a":"#d4a853",flexShrink:0}}>{b.growth>0?"+":""}{Math.round(b.growth)}%</span>
              </div>
              <div style={{height:"5px",background:"rgba(255,255,255,0.06)",borderRadius:"100px",overflow:"hidden"}}>
                <div style={{height:"100%",width:`${(b.last/max)*100}%`,borderRadius:"100px",background:b.growth>10?"#8aab8e":b.growth<-10?"#e8855a":"#d4a853"}} />
              </div>
              <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginTop:"2px"}}>{fmtM(b.last)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FinancialSummary({ products, periods }) {
  const totalRevenue = periods.reduce((s,per) =>
    s + Object.values(per.sales??{}).reduce((ss,b)=>ss+Object.values(b).reduce((sss,v)=>sss+num(v.totalPrice),0),0), 0);
  let totalCost = 0, totalFrozen = 0, anomalies = 0;
  products.forEach(p => {
    const m = safeMetrics(p, periods);
    if (m.anomaly) { anomalies++; return; }
    totalCost   += m.allSold * m.buyPrice;
    totalFrozen += m.frozenVal;
  });
  const totalProfit = totalRevenue - totalCost;
  return (
    <div style={{background:"linear-gradient(135deg,rgba(212,168,83,0.1),rgba(212,168,83,0.04))",border:"1px solid rgba(212,168,83,0.2)",borderRadius:"18px",padding:"16px",marginBottom:"14px"}}>
      <div style={{fontSize:"13px",color:"rgba(212,168,83,0.7)",marginBottom:"12px",fontWeight:"700"}}>💰 الصحة المالية</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
        {[["إيراد كلي",fmtM(totalRevenue),"#d4a853"],["ربح صافي",fmtM(totalProfit),"#8aab8e"],["قيمة مجمّدة",fmtM(totalFrozen),"#e8855a"],["هامش كلي",totalRevenue>0?fmtPct((totalProfit/totalRevenue)*100):"—","#a89fc4"]].map(([l,v,c])=>(
          <div key={l} style={{background:"rgba(255,255,255,0.05)",borderRadius:"12px",padding:"11px",textAlign:"center"}}>
            <div style={{fontSize:"16px",fontWeight:"900",color:c}}>{v}</div>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginTop:"3px"}}>{l}</div>
          </div>
        ))}
      </div>
      {anomalies > 0 && <div style={{fontSize:"11px",color:"#e8855a",marginTop:"8px",textAlign:"center"}}>⚠️ استُبعد {anomalies} منتج بأرقام شاذة (راجع مشترياتها)</div>}
    </div>
  );
}

export function OperationsRoom({ products, periods, images, settings, onBuildCard }) {
  const [filter, setFilter] = useState("all");
  const decisions = useMemo(()=>buildDecisions(products, periods), [products, periods]);
  const filtered = filter==="all" ? decisions : decisions.filter(d=>d.priority===filter);
  const counts = { red:decisions.filter(d=>d.priority==="red").length, amber:decisions.filter(d=>d.priority==="amber").length, green:decisions.filter(d=>d.priority==="green").length };
  const today = new Date().toLocaleDateString("ar-SA",{weekday:"long",day:"numeric",month:"long"});
  const handleAction = (d) => { if (onBuildCard) onBuildCard({ type:d.action, product:d.product.name, barcode:d.product.barcode }); };

  return (
    <div style={{direction:"rtl",fontFamily:"Cairo,sans-serif"}}>
      <div style={{marginBottom:"16px"}}>
        <div style={{fontSize:"13px",color:"rgba(212,168,83,0.6)",marginBottom:"3px"}}>{today}</div>
        <div style={{fontSize:"22px",fontWeight:"900",color:"#ffffff",marginBottom:"3px"}}>غرفة العمليات</div>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)",marginBottom:"10px"}}>{products.length} منتج · {periods.length} فترة · {decisions.length} قرار يحتاج اهتمامك</div>
        {products.length > 0 && periods.length > 0 && (() => {
          const scores = products.slice(0,150).map(p => calcHealthScore(p, periods)).filter(s=>!s.anomaly);
          const strong=scores.filter(s=>s.grade==="strong").length, average=scores.filter(s=>s.grade==="average").length, weak=scores.filter(s=>s.grade==="weak").length, critical=scores.filter(s=>s.grade==="critical").length;
          return (
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"6px"}}>
              {[["🟢 قوي",strong,"#8aab8e"],["🟡 متوسط",average,"#d4a853"],["🟠 ضعيف",weak,"#f59e0b"],["🔴 حرج",critical,"#e8855a"]].map(([l,v,c])=>(
                <div key={l} style={{background:`${c}10`,border:`1px solid ${c}20`,borderRadius:"11px",padding:"8px",textAlign:"center"}}>
                  <div style={{fontSize:"18px",fontWeight:"900",color:c}}>{v}</div>
                  <div style={{fontSize:"9px",color:"rgba(255,255,255,0.35)",marginTop:"1px"}}>{l}</div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
      <FinancialSummary products={products} periods={periods} />
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
        <div style={{fontSize:"14px",fontWeight:"900",color:"#ffffff"}}>⚡ القرارات</div>
        <div style={{display:"flex",gap:"5px"}}>
          {[["all","الكل"],["red","عاجل"],["amber","فرصة"],["green","ربح"]].map(([k,l])=>(
            <button key={k} onClick={()=>setFilter(k)} style={{padding:"5px 10px",borderRadius:"100px",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontSize:"11px",fontWeight:"700",background:filter===k?"rgba(212,168,83,0.2)":"rgba(255,255,255,0.05)",color:filter===k?"#d4a853":"rgba(255,255,255,0.4)",border:filter===k?"1px solid rgba(212,168,83,0.4)":"1px solid rgba(255,255,255,0.08)"}}>{l} {k!=="all"?`(${counts[k]??0})`:""}</button>
          ))}
        </div>
      </div>
      {filtered.length===0 && <div style={{textAlign:"center",padding:"40px",color:"rgba(255,255,255,0.3)"}}><div style={{fontSize:"36px",marginBottom:"10px"}}>✅</div><div>لا توجد قرارات</div></div>}
      {filtered.map((d,i)=><DecisionCard key={i} d={d} images={images} onAction={handleAction} periods={periods} />)}
      {periods.length>=2 && <BranchPulse periods={periods} />}
    </div>
  );
}
