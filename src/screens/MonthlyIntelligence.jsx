// MonthlyIntelligence.jsx — تقرير الذكاء الشهري
import { useState, useMemo } from "react";
import { totalPurchases, num, fmtN, fmtM } from "../lib/calc.js";

function buildMonthlyData(products, periods) {
  const sorted = [...periods].sort((a,b) =>
    (a.uploadDate??a.label) > (b.uploadDate??b.label) ? 1 : -1
  );

  // بناء بيانات كل منتج في كل شهر
  const monthlyMap = {}; // { barcode: { label: qty } }

  sorted.forEach(per => {
    products.forEach(p => {
      const qty = Object.values(per.sales??{}).reduce((s,b)=>s+num(b[p.barcode]?.qty??0),0);
      const rev = Object.values(per.sales??{}).reduce((s,b)=>s+num(b[p.barcode]?.totalPrice??0),0);
      const buyPrice = num(p.purchases?.slice(-1)[0]?.buyPrice??0);
      const profit = rev - (qty * buyPrice);
      if (!monthlyMap[p.barcode]) monthlyMap[p.barcode] = {};
      monthlyMap[p.barcode][per.label] = { qty, rev, profit };
    });
  });

  return { sorted, monthlyMap };
}

// ─── أفضل المنتجات بالشهر ─────────────────────────────────────

function MonthRanking({ products, periods, images }) {
  const [topN,   setTopN]   = useState(20);
  const [sortBy, setSortBy] = useState("rev");
  const [selMonth, setSelMonth] = useState(null);

  const { sorted, monthlyMap } = useMemo(() => buildMonthlyData(products, periods), [products, periods]);

  const currentMonth = selMonth ?? sorted[sorted.length-1]?.label;

  const ranked = useMemo(() => {
    if (!currentMonth) return [];
    return products.map(p => {
      const d = monthlyMap[p.barcode]?.[currentMonth] ?? { qty:0, rev:0, profit:0 };
      return { ...p, ...d };
    }).filter(p => p.qty > 0)
      .sort((a,b) => sortBy==="qty" ? b.qty-a.qty : sortBy==="profit" ? b.profit-a.profit : b.rev-a.rev)
      .slice(0, topN);
  }, [currentMonth, sortBy, topN, products, monthlyMap]);

  const totalQty = ranked.reduce((s,p)=>s+p.qty,0);
  const totalRev = ranked.reduce((s,p)=>s+p.rev,0);
  const totalPro = ranked.reduce((s,p)=>s+p.profit,0);

  return (
    <div>
      {/* اختيار الشهر */}
      <div style={{overflowX:"auto",paddingBottom:"8px",marginBottom:"12px"}}>
        <div style={{display:"flex",gap:"6px",minWidth:"max-content"}}>
          {sorted.map(per => (
            <button key={per.id} onClick={()=>setSelMonth(per.label)} style={{
              padding:"7px 14px",borderRadius:"100px",border:"none",cursor:"pointer",
              fontFamily:"Cairo,sans-serif",fontSize:"12px",fontWeight:"700",whiteSpace:"nowrap",
              background:currentMonth===per.label?"rgba(212,168,83,0.2)":"rgba(255,255,255,0.05)",
              color:currentMonth===per.label?"#d4a853":"rgba(255,255,255,0.4)",
              border:currentMonth===per.label?"1px solid rgba(212,168,83,0.4)":"1px solid rgba(255,255,255,0.08)",
            }}>{per.label}</button>
          ))}
        </div>
      </div>

      {/* فلاتر */}
      <div style={{display:"flex",gap:"8px",marginBottom:"12px",flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:"5px"}}>
          {[["rev","إيراد"],["qty","كمية"],["profit","ربح"]].map(([k,l])=>(
            <button key={k} onClick={()=>setSortBy(k)} style={{
              padding:"6px 12px",borderRadius:"100px",border:"none",cursor:"pointer",
              fontFamily:"Cairo,sans-serif",fontSize:"11px",fontWeight:"700",
              background:sortBy===k?"rgba(212,168,83,0.2)":"rgba(255,255,255,0.05)",
              color:sortBy===k?"#d4a853":"rgba(255,255,255,0.4)",
              border:sortBy===k?"1px solid rgba(212,168,83,0.4)":"1px solid rgba(255,255,255,0.08)",
            }}>{l}</button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
          <span style={{fontSize:"11px",color:"rgba(255,255,255,0.4)"}}>عرض</span>
          <input type="number" value={topN} onChange={e=>setTopN(Math.max(1,parseInt(e.target.value)||10))}
            style={{width:"55px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px",padding:"5px 8px",color:"#fff",fontSize:"12px",fontFamily:"Cairo,sans-serif",outline:"none",textAlign:"center"}} />
          <span style={{fontSize:"11px",color:"rgba(255,255,255,0.4)"}}>منتج</span>
        </div>
      </div>

      {/* الإجمالي */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"7px",marginBottom:"14px"}}>
        {[["إجمالي الوحدات",fmtN(totalQty),"#d4a853"],["إجمالي الإيراد",fmtM(totalRev),"#8aab8e"],["إجمالي الربح",fmtM(totalPro),"#a89fc4"]].map(([l,v,c])=>(
          <div key={l} style={{background:`${c}10`,border:`1px solid ${c}20`,borderRadius:"12px",padding:"10px",textAlign:"center"}}>
            <div style={{fontSize:"15px",fontWeight:"900",color:c}}>{v}</div>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.35)",marginTop:"2px"}}>{l}</div>
          </div>
        ))}
      </div>

      {/* القائمة */}
      <div style={{display:"flex",flexDirection:"column",gap:"7px"}}>
        {ranked.map((p,i)=>{
          const img = images?.[p.barcode];
          const barPercent = ranked[0]?.rev > 0 ? (p.rev/ranked[0].rev)*100 : 0;
          return (
            <div key={p.barcode} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:"14px",padding:"12px 14px"}}>
              <div style={{display:"flex",alignItems:"center",gap:"11px"}}>
                <span style={{fontSize:"13px",fontWeight:"900",color:i<3?"#d4a853":"rgba(255,255,255,0.3)",width:"20px",flexShrink:0}}>#{i+1}</span>
                {img ? (
                  <img src={img} alt={p.name} style={{width:"42px",height:"42px",borderRadius:"10px",objectFit:"cover",flexShrink:0}} />
                ) : (
                  <div style={{width:"42px",height:"42px",borderRadius:"10px",background:"rgba(255,255,255,0.04)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px",flexShrink:0}}>📦</div>
                )}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"13px",fontWeight:"700",color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                  <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",fontFamily:"monospace",marginTop:"1px"}}>{p.barcode}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:"13px",fontWeight:"900",color:"#8aab8e"}}>{fmtM(p.rev)}</div>
                  <div style={{fontSize:"10px",color:"rgba(255,255,255,0.35)",marginTop:"1px"}}>{fmtN(p.qty)} قطعة</div>
                </div>
              </div>
              <div style={{marginTop:"8px",height:"3px",background:"rgba(255,255,255,0.06)",borderRadius:"100px",overflow:"hidden"}}>
                <div style={{height:"100%",width:`${barPercent}%`,background:"linear-gradient(90deg,#d4a853,#8aab8e)",borderRadius:"100px"}} />
              </div>
            </div>
          );
        })}
        {ranked.length===0 && (
          <div style={{textAlign:"center",padding:"30px",color:"rgba(255,255,255,0.3)"}}>لا توجد مبيعات في هذا الشهر</div>
        )}
      </div>
    </div>
  );
}

// ─── لا تكرره ────────────────────────────────────────────────

function DoNotRepeat({ products, periods, images }) {
  const { sorted, monthlyMap } = useMemo(() => buildMonthlyData(products, periods), [products, periods]);

  const weak = useMemo(() => {
    return products.map(p => {
      const monthlyQty = sorted.map(per => monthlyMap[p.barcode]?.[per.label]?.qty ?? 0);
      const totalSold  = monthlyQty.reduce((s,v)=>s+v,0);
      const nonZero    = monthlyQty.filter(v=>v>0).length;
      const avgSold    = sorted.length > 0 ? totalSold / sorted.length : 0;
      const maxSold    = Math.max(...monthlyQty, 0);
      const bought     = totalPurchases(p);
      const soldPct    = bought > 0 ? (totalSold/bought)*100 : 0;
      const buyPrice   = num(p.purchases?.slice(-1)[0]?.buyPrice??0);
      const frozenVal  = Math.max(0, bought-totalSold) * buyPrice;

      return { ...p, totalSold, nonZero, avgSold, maxSold, soldPct, frozenVal };
    })
    .filter(p => p.totalPurchases > 0 || p.bought > 0)
    .filter(p => p.soldPct < 20 && p.maxSold < 10)
    .sort((a,b) => b.frozenVal - a.frozenVal)
    .slice(0, 30);
  }, [products, sorted, monthlyMap]);

  return (
    <div>
      <div style={{background:"rgba(232,133,90,0.06)",border:"1px solid rgba(232,133,90,0.2)",borderRadius:"14px",padding:"13px 16px",marginBottom:"14px"}}>
        <div style={{fontSize:"13px",color:"#e8855a",fontWeight:"700"}}>🚫 {weak.length} منتج — لا تطلبها مجدداً</div>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)",marginTop:"3px"}}>أداء ضعيف في كل الفترات (أقل من 20% مبيع)</div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:"7px"}}>
        {weak.map((p,i)=>{
          const img = images?.[p.barcode];
          return (
            <div key={p.barcode} style={{display:"flex",alignItems:"center",gap:"11px",padding:"11px 13px",background:"rgba(232,133,90,0.04)",border:"1px solid rgba(232,133,90,0.12)",borderRadius:"13px"}}>
              {img ? (
                <img src={img} alt={p.name} style={{width:"40px",height:"40px",borderRadius:"9px",objectFit:"cover",flexShrink:0}} />
              ) : (
                <div style={{width:"40px",height:"40px",borderRadius:"9px",background:"rgba(255,255,255,0.04)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"16px",flexShrink:0}}>📦</div>
              )}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"13px",fontWeight:"700",color:"rgba(255,255,255,0.7)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",fontFamily:"monospace"}}>{p.barcode}</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:"12px",fontWeight:"900",color:"#e8855a"}}>{fmtM(p.frozenVal)}</div>
                <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginTop:"1px"}}>مجمّدة</div>
              </div>
            </div>
          );
        })}
        {weak.length===0 && (
          <div style={{textAlign:"center",padding:"30px",color:"rgba(255,255,255,0.3)"}}>🎉 كل المنتجات بخير</div>
        )}
      </div>
    </div>
  );
}

// ─── كرّره هذا الشهر ─────────────────────────────────────────

function RepeatThisMonth({ products, periods, images }) {
  const { sorted, monthlyMap } = useMemo(() => buildMonthlyData(products, periods), [products, periods]);

  const currentMonthNum = new Date().getMonth() + 1;
  const currentMonthName = new Date().toLocaleDateString("ar-SA", { month: "long" });

  const repeat = useMemo(() => {
    // نبحث عن منتجات ارتفعت في نفس الشهر من السنة الماضية
    const sameMonthPeriods = sorted.filter(per => {
      const label = per.label ?? "";
      // نتحقق إذا الفترة من نفس الشهر
      const arMonths = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
      const monthIdx = arMonths.findIndex(m => label.includes(m));
      return monthIdx + 1 === currentMonthNum;
    });

    if (sameMonthPeriods.length === 0) return [];

    return products.map(p => {
      const sameMonthQty = sameMonthPeriods.reduce((s,per) =>
        s + (monthlyMap[p.barcode]?.[per.label]?.qty ?? 0), 0);
      const totalQty = sorted.reduce((s,per) =>
        s + (monthlyMap[p.barcode]?.[per.label]?.qty ?? 0), 0);
      const avgQty = sorted.length > 0 ? totalQty / sorted.length : 0;
      const boost = avgQty > 0 ? ((sameMonthQty - avgQty) / avgQty) * 100 : 0;
      const rev = sameMonthPeriods.reduce((s,per) =>
        s + (monthlyMap[p.barcode]?.[per.label]?.rev ?? 0), 0);
      return { ...p, sameMonthQty, avgQty, boost, rev };
    })
    .filter(p => p.sameMonthQty > 0 && p.boost > 20)
    .sort((a,b) => b.boost - a.boost)
    .slice(0, 20);
  }, [products, sorted, monthlyMap, currentMonthNum]);

  return (
    <div>
      <div style={{background:"rgba(138,171,142,0.06)",border:"1px solid rgba(138,171,142,0.2)",borderRadius:"14px",padding:"13px 16px",marginBottom:"14px"}}>
        <div style={{fontSize:"13px",color:"#8aab8e",fontWeight:"700"}}>🔄 {repeat.length} منتج — كرّره في {currentMonthName}</div>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)",marginTop:"3px"}}>ارتفع في نفس الشهر من السنة الماضية</div>
      </div>

      {repeat.length === 0 && (
        <div style={{textAlign:"center",padding:"30px",color:"rgba(255,255,255,0.3)"}}>
          <div style={{marginBottom:"8px"}}>📅</div>
          <div>تحتاج بيانات من {currentMonthName} السنة الماضية</div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:"7px"}}>
        {repeat.map(p => {
          const img = images?.[p.barcode];
          return (
            <div key={p.barcode} style={{display:"flex",alignItems:"center",gap:"11px",padding:"11px 13px",background:"rgba(138,171,142,0.05)",border:"1px solid rgba(138,171,142,0.15)",borderRadius:"13px"}}>
              {img ? (
                <img src={img} alt={p.name} style={{width:"40px",height:"40px",borderRadius:"9px",objectFit:"cover",flexShrink:0}} />
              ) : (
                <div style={{width:"40px",height:"40px",borderRadius:"9px",background:"rgba(255,255,255,0.04)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"16px",flexShrink:0}}>📦</div>
              )}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"13px",fontWeight:"700",color:"rgba(255,255,255,0.8)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",fontFamily:"monospace"}}>{p.barcode}</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:"12px",fontWeight:"900",color:"#8aab8e"}}>+{Math.round(p.boost)}%</div>
                <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginTop:"1px"}}>{fmtN(Math.round(p.sameMonthQty))} قطعة</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── الشاشة الرئيسية ─────────────────────────────────────────

export function MonthlyIntelligence({ products, periods, images, onBack }) {
  const [tab, setTab] = useState("ranking");

  const TABS = [
    { key:"ranking", icon:"🏆", label:"التصنيف" },
    { key:"repeat",  icon:"🔄", label:"كرّره"   },
    { key:"avoid",   icon:"🚫", label:"تجنّبه"  },
  ];

  return (
    <div style={{direction:"rtl",fontFamily:"Cairo,sans-serif"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
        <div>
          <div style={{fontSize:"18px",fontWeight:"900",color:"#ffffff"}}>📅 الذكاء الشهري</div>
          <div style={{fontSize:"12px",color:"rgba(212,168,83,0.6)",marginTop:"2px"}}>
            {periods.length} شهر · {products.length} منتج
          </div>
        </div>
        <button onClick={onBack} style={{padding:"7px 14px",borderRadius:"100px",border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.5)",fontSize:"12px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>
          ← رجوع
        </button>
      </div>

      {/* تبويبات */}
      <div style={{display:"flex",gap:"6px",marginBottom:"16px",background:"rgba(255,255,255,0.04)",borderRadius:"14px",padding:"4px"}}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{
            flex:1,padding:"9px",borderRadius:"11px",border:"none",cursor:"pointer",
            fontFamily:"Cairo,sans-serif",fontSize:"12px",fontWeight:"700",
            background:tab===t.key?"rgba(212,168,83,0.15)":"transparent",
            color:tab===t.key?"#d4a853":"rgba(255,255,255,0.35)",
            border:tab===t.key?"1px solid rgba(212,168,83,0.3)":"1px solid transparent",
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab==="ranking" && <MonthRanking   products={products} periods={periods} images={images} />}
      {tab==="repeat"  && <RepeatThisMonth products={products} periods={periods} images={images} />}
      {tab==="avoid"   && <DoNotRepeat    products={products} periods={periods} images={images} />}
    </div>
  );
}
