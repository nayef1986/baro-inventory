// Ideas/index.jsx — الشاشة الرئيسية (خفيفة)
import { useState, useEffect, lazy, Suspense } from "react";
import { totalPurchases, getFactoryCode, allBranches, num } from "../../lib/calc.js";
import { S, todayAr } from "./constants.js";

// تحميل كسول للمكونات الثقيلة
const Alert        = lazy(() => import("./Alert.jsx").then(m => ({ default: m.SmartAlert })));
const TodayCard    = lazy(() => import("./Alert.jsx").then(m => ({ default: m.TodayCard })));
const Suggestions  = lazy(() => import("./Suggestions.jsx").then(m => ({ default: m.SuggestionsTab })));
const Analysis     = lazy(() => import("./Analysis.jsx").then(m => ({ default: m.AnalysisTab })));
const CardBuilder  = lazy(() => import("./CardBuilder.jsx").then(m => ({ default: m.CardTab })));

const Loader = () => (
  <div style={{textAlign:"center",padding:"40px"}}>
    <div style={{fontSize:"24px",animation:"spin 1s linear infinite"}}>⏳</div>
    <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
  </div>
);

export default function IdeasScreen({ products = [], periods = [], settings = {}, images = {}, onSaveImage }) {
  const [tab,   setTab]  = useState("suggestions");
  const [bT,    setBT]   = useState(null);
  const [bP,    setBP]   = useState(null);
  const [PRODUCTS,  setProds]  = useState([]);
  const [FACTORIES, setFacts]  = useState([]);
  const [BRANCHES,  setBrancs] = useState([]);
  const [ready,     setReady]  = useState(false);

  useEffect(() => {
    if (!products || products.length === 0) { setReady(true); return; }
    const timer = setTimeout(() => {
      const lastPer = periods[periods.length - 1];
      const prods = products.slice(0, 100).map(p => {
        const bought   = totalPurchases(p);
        const sold     = Object.values(lastPer?.sales ?? {}).reduce((s,d)=>s+num(d[p.barcode]?.qty??0),0);
        const closing  = Math.max(0, bought - sold);
        const soldPct  = bought > 0 ? (sold/bought)*100 : 0;
        const buyPrice = num(p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
        return { ...p, qty: bought, soldPct, buyPrice, closing };
      });
      setProds(prods);

      const codes = [...new Set(prods.map(p=>getFactoryCode(p.barcode)).filter(Boolean))].slice(0,10);
      setFacts(codes.map(code => {
        const fp    = prods.filter(p=>getFactoryCode(p.barcode)===code);
        const bought = fp.reduce((s,p)=>s+p.qty,0);
        const sold   = fp.reduce((s,p)=>s+Math.round(p.qty*p.soldPct/100),0);
        const soldPct = bought>0?(sold/bought)*100:0;
        const lostVal = fp.reduce((s,p)=>s+p.closing*p.buyPrice,0);
        return { code, name:settings?.factories?.[code]??"", products:fp.length, soldPct, lostVal };
      }).filter(f=>f.soldPct<40&&f.lostVal>0).sort((a,b)=>a.soldPct-b.soldPct).slice(0,3));

      if (periods.length > 0) {
        setBrancs(allBranches(periods).slice(0,8).map(b=>{
          const rev  = Object.values(lastPer?.sales?.[b]??{}).reduce((s,v)=>s+num(v.totalPrice),0);
          const weak = products.filter(p=>!lastPer?.sales?.[b]?.[p.barcode]).map(p=>p.name).slice(0,3);
          return { name:b, rev, rank:0, weak };
        }).sort((a,b)=>b.rev-a.rev).map((b,i)=>({...b,rank:i+1})).filter(b=>b.rank>=3).slice(0,3));
      }
      setReady(true);
    }, 50);
    return () => clearTimeout(timer);
  }, [products, periods, settings]);

  const onBuild = (type, prod) => { setBT(type); setBP(prod); setTab("builder"); };

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
    *{box-sizing:border-box}
    .ab1{position:fixed;width:500px;height:500px;top:-150px;right:-100px;background:radial-gradient(circle,rgba(212,168,83,0.1) 0%,transparent 70%);animation:d1 14s ease-in-out infinite alternate;pointer-events:none;z-index:0}
    .ab2{position:fixed;width:400px;height:400px;bottom:-80px;left:-100px;background:radial-gradient(circle,rgba(184,151,90,0.08) 0%,transparent 70%);animation:d2 18s ease-in-out infinite alternate;pointer-events:none;z-index:0}
    @keyframes d1{from{transform:translate(0,0)}to{transform:translate(-50px,70px)}}
    @keyframes d2{from{transform:translate(0,0)}to{transform:translate(60px,-50px)}}
  `;

  return (
    <>
      <style>{CSS}</style>
      <div className="ab1"/><div className="ab2"/>
      <div style={{position:"relative",zIndex:1,padding:"4px 0 48px",maxWidth:"440px",margin:"0 auto"}}>

        <div style={{marginBottom:"20px"}}>
          <h1 style={{fontSize:"30px",fontWeight:"900",color:"#ffffff",marginBottom:"5px"}}>مختبر الأفكار</h1>
          <p style={{fontSize:"14px",color:"rgba(212,168,83,0.7)"}}>اقتراحات ذكية · بطاقات عروض احترافية</p>
        </div>

        {!ready ? (
          <Loader />
        ) : PRODUCTS.length === 0 ? (
          <div style={{textAlign:"center",padding:"48px 20px"}}>
            <div style={{fontSize:"48px",marginBottom:"16px"}}>💡</div>
            <div style={{fontSize:"20px",fontWeight:"900",color:"#ffffff",marginBottom:"8px"}}>مختبر الأفكار</div>
            <div style={{fontSize:"14px",color:"rgba(212,168,83,0.7)",lineHeight:"1.6"}}>
              ارفع فاتورة شراء وملف مبيعات<br/>لتظهر الاقتراحات والتحليلات
            </div>
          </div>
        ) : (
          <Suspense fallback={<Loader />}>
            <Alert PRODUCTS={PRODUCTS} onBuild={onBuild} />
            <TodayCard PRODUCTS={PRODUCTS} onBuild={onBuild} />
          </Suspense>
        )}

        {ready && PRODUCTS.length > 0 && (
          <div style={{display:"flex",gap:"3px",padding:"4px",background:"rgba(255,245,220,0.05)",border:"1px solid rgba(212,168,83,0.15)",borderRadius:"16px",marginBottom:"16px"}}>
            {[["suggestions","💡 اقتراحات"],["analysis","📊 تحليل"],["builder","🎨 بطاقة"]].map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"9px 6px",borderRadius:"12px",border:"none",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontSize:"13px",fontWeight:"700",color:tab===k?"#d4a853":"rgba(255,255,255,0.35)",background:tab===k?"rgba(212,168,83,0.15)":"transparent",border:tab===k?"1px solid rgba(212,168,83,0.3)":"1px solid transparent",transition:"all 0.25s"}}>
                {l}
              </button>
            ))}
          </div>
        )}

        {ready && PRODUCTS.length > 0 && (
          <Suspense fallback={<Loader />}>
            {tab==="suggestions" && <Suggestions PRODUCTS={PRODUCTS} FACTORIES={FACTORIES} BRANCHES={BRANCHES} onBuild={onBuild} />}
            {tab==="analysis"    && <Analysis    PRODUCTS={PRODUCTS} onBuild={onBuild} />}
            {tab==="builder"     && <CardBuilder  initType={bT} initProd={bP} images={images} />}
          </Suspense>
        )}
      </div>
    </>
  );
}
