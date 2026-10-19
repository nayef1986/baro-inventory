// ============================================================
// SeasonReport.jsx — تقرير الموسم (رمضان وغيره)
// عام · الفروع · الزمن · القرار
// ============================================================

import { useState, useMemo, useEffect, useCallback } from "react";
import { SectionHeader, BackBtn, fmtN, fmtM, fmtPct } from "../components/UI.jsx";
import { seasonAnalysis, timelineFor } from "../lib/season.js";
import { parseSalesFile } from "../lib/parsers.js";
import {
  loadSeasonPeriods, addSeasonPeriod, deleteSeasonPeriod,
  deleteAllSeasonPeriods, loadSeasonMeta, saveSeasonMeta,
} from "../lib/storage.js";

const C = {
  gold:"#d4a853", green:"#10b981", sky:"#38bdf8",
  red:"#f87171", purple:"#a78bfa", slate:"#64748b",
};

const esc = s => String(s ?? "").replace(/[&<>"]/g, c =>
  ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));

// ─── شريط نسبة ──────────────────────────────────────────────
function Bar({ pct, color = C.gold, h = 6 }) {
  return (
    <div style={{background:"rgba(255,255,255,0.07)",borderRadius:"100px",height:`${h}px`,overflow:"hidden"}}>
      <div style={{
        width:`${Math.max(0,Math.min(100,pct))}%`, height:"100%",
        background:color, borderRadius:"100px", transition:"width .3s",
      }}/>
    </div>
  );
}

// ─── بطاقة رقم ──────────────────────────────────────────────
function Stat({ label, value, color = "#f1f5f9", sub }) {
  return (
    <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",
      borderRadius:"14px",padding:"12px",textAlign:"center"}}>
      <div style={{fontSize:"20px",fontWeight:900,color}}>{value}</div>
      <div style={{fontSize:"10px",color:"#64748b",marginTop:"2px"}}>{label}</div>
      {sub && <div style={{fontSize:"9px",color:"#475569",marginTop:"1px"}}>{sub}</div>}
    </div>
  );
}

// ─── رسم الخط الزمني ────────────────────────────────────────
// أعمدة الموسم. الضغط على عمود يظهر يومه ورقمه تحت الرسم مباشرة.
function Timeline({ points, avg, thr = 20, height = 110, compact = false }) {
  const [sel, setSel] = useState(null);
  if (!points.length) return null;
  const max  = Math.max(...points.map(p=>p.qty), 1);
  const best = points.reduce((m,p)=> p.qty > m.qty ? p : m, points[0]);
  const shown = sel ?? best;

  return (
    <div>
      {/* القراءة: اليوم المختار أو الأقوى */}
      <div style={{display:"flex",alignItems:"baseline",gap:"8px",marginBottom:"10px"}}>
        <span style={{fontSize:"26px",fontWeight:900,color:"#fff",letterSpacing:"-1px"}}>
          {fmtN(shown.qty)}
        </span>
        <span style={{fontSize:"12px",color:"#8b97a8"}}>
          قطعة · {shown.label}{sel ? "" : " (الأقوى)"}
        </span>
      </div>

      <div style={{position:"relative",display:"flex",alignItems:"flex-end",
        gap: points.length > 20 ? "2px" : "4px", height:`${height}px`}}>
        {avg > 0 && (
          <div style={{position:"absolute",right:0,left:0,
            bottom:`${(avg/max)*height}px`,height:0,
            borderTop:"1px dashed rgba(255,255,255,0.18)",pointerEvents:"none"}}/>
        )}
        {points.map((p,i)=>{
          const h   = (p.qty / max) * 100;
          const on  = shown === p;
          const col = p.vsAvgPct >=  thr ? C.green
                    : p.vsAvgPct <= -thr ? C.red : "#3f4b5c";
          return (
            <div key={i}
              onClick={e=>{ e.stopPropagation(); setSel(sel===p ? null : p); }}
              style={{flex:1,minWidth:"4px",height:"100%",display:"flex",
                flexDirection:"column",justifyContent:"flex-end",cursor:"pointer"}}>
              <div style={{height:`${Math.max(3,h)}%`,background:col,
                borderRadius:"4px 4px 2px 2px",
                outline: on ? "1.5px solid #fff" : "none",
                outlineOffset:"1px",transition:"outline .12s"}}/>
            </div>
          );
        })}
      </div>

      {!compact && (
        <div style={{display:"flex",justifyContent:"space-between",fontSize:"10px",
          color:"#56637a",marginTop:"7px"}}>
          <span>{points[0]?.label}</span>
          <span>{points[points.length-1]?.label}</span>
        </div>
      )}
    </div>
  );
}

// ─── عنوان قسم ──────────────────────────────────────────────
function Head({ children, note }) {
  return (
    <div style={{margin:"20px 0 10px"}}>
      <div style={{fontSize:"14px",fontWeight:900,color:"#e8edf4"}}>{children}</div>
      {note && <div style={{fontSize:"11px",color:"#6b788c",marginTop:"3px"}}>{note}</div>}
    </div>
  );
}

// ─── سطر تسمية/قيمة ─────────────────────────────────────────
function Line({ label, value, color = "#8b97a8" }) {
  return (
    <div style={{display:"flex",gap:"10px",alignItems:"baseline"}}>
      <span style={{fontSize:"12px",fontWeight:700,color,flexShrink:0,minWidth:"56px"}}>
        {label}
      </span>
      <span style={{fontSize:"12.5px",color:"#cbd5e1",lineHeight:1.8}}>{value}</span>
    </div>
  );
}

// ─── مبدّل ──────────────────────────────────────────────────
function Toggle({ value, onChange, options }) {
  return (
    <div style={{display:"flex",gap:"4px",background:"rgba(255,255,255,0.04)",
      borderRadius:"11px",padding:"3px"}}>
      {options.map(([k,l])=>(
        <button key={k} onClick={()=>onChange(k)}
          style={{flex:1,padding:"8px",borderRadius:"8px",border:"none",cursor:"pointer",
            fontFamily:"Cairo,sans-serif",fontSize:"12px",fontWeight:700,
            background: value===k ? "rgba(255,255,255,0.1)" : "transparent",
            color:      value===k ? "#e8edf4" : "#6b788c"}}>
          {l}
        </button>
      ))}
    </div>
  );
}

// ─── صورة المنتج ────────────────────────────────────────────
// الضغط على الصورة يفتحها بحجمها، ولا يفتح تفاصيل البطاقة
function Thumb({ src, size = 68, onOpen, name }) {
  if (!src) {
    return (
      <div style={{width:size,height:size,borderRadius:"12px",flexShrink:0,
        background:"rgba(255,255,255,0.05)",border:"1px dashed rgba(255,255,255,0.12)",
        display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:size*0.36,opacity:0.5}}>📦</div>
    );
  }
  return (
    <img src={src} alt={name ?? ""}
      onClick={onOpen ? e => { e.stopPropagation(); onOpen({ src, name }); } : undefined}
      style={{width:size,height:size,borderRadius:"12px",objectFit:"cover",
        flexShrink:0,background:"#fff",cursor: onOpen ? "zoom-in" : "default"}}/>
  );
}

// ─── عارض الصورة ────────────────────────────────────────────
function Viewer({ img, onClose }) {
  if (!img) return null;
  return (
    <div onClick={onClose}
      style={{position:"fixed",inset:0,background:"rgba(2,6,14,0.94)",zIndex:90,
        display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",padding:"20px",gap:"16px"}}>
      <img src={img.src} alt={img.name ?? ""}
        onClick={e=>e.stopPropagation()}
        style={{maxWidth:"100%",maxHeight:"74vh",borderRadius:"16px",
          objectFit:"contain",background:"#fff"}}/>
      {img.name && (
        <div style={{fontSize:"14px",fontWeight:700,color:"#e8edf4",
          textAlign:"center",maxWidth:"90%"}}>{img.name}</div>
      )}
      <button onClick={onClose}
        style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:"100px",
          padding:"11px 30px",color:"#e8edf4",fontSize:"13px",fontWeight:700,
          cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>إغلاق</button>
    </div>
  );
}

// ─── صف منتج ────────────────────────────────────────────────
// سطران فقط: الاسم ورقم واحد كبير. التفاصيل تنفتح بالضغط.
function Row({ r, rank, value, unit, color = C.gold, fill = 0,
               sub, images, children, badge, onImg }) {
  const [open, setOpen] = useState(false);
  const medal = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : null;

  return (
    <div onClick={()=>setOpen(!open)}
      style={{background:"rgba(255,255,255,0.028)",borderRadius:"14px",
        marginBottom:"7px",cursor:"pointer",overflow:"hidden",
        border:"1px solid rgba(255,255,255,0.05)"}}>

      <div style={{display:"flex",alignItems:"center",gap:"12px",padding:"11px 12px"}}>
        <Thumb src={images?.[r.barcode]} onOpen={onImg} name={r.name} />

        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:"5px"}}>
            {medal && <span style={{fontSize:"14px"}}>{medal}</span>}
            <span style={{fontSize:"14px",fontWeight:700,color:"#f1f5f9",
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</span>
          </div>
          {sub && <div style={{fontSize:"11px",color:"#7c8a9e",marginTop:"3px"}}>{sub}</div>}
          {badge}
        </div>

        <div style={{textAlign:"left",flexShrink:0,minWidth:"58px"}}>
          <div style={{fontSize:"21px",fontWeight:900,color,lineHeight:1.1,
            letterSpacing:"-0.5px"}}>{value}</div>
          {unit && <div style={{fontSize:"10px",color:"#5b6878",marginTop:"1px"}}>{unit}</div>}
        </div>
      </div>

      {/* الشريط = حافة البطاقة السفلى، مو عنصر زائد */}
      {fill > 0 && (
        <div style={{height:"2.5px",background:"rgba(255,255,255,0.05)",display:"flex",justifyContent:"flex-start"}}>
          <div style={{width:`${Math.max(1,Math.min(100,fill))}%`,height:"100%",background:color}}/>
        </div>
      )}

      {open && (
        <div style={{padding:"11px 12px",background:"rgba(0,0,0,0.22)",
          fontSize:"11.5px",color:"#94a3b8",lineHeight:2}}>
          <div style={{fontFamily:"monospace",direction:"ltr",textAlign:"right",
            color:"#cbd5e1",fontSize:"12px",marginBottom:"3px"}}>{r.barcode}</div>
          <div>المصنع · {r.fac}{r.facName ? ` — ${r.facName}` : ""}</div>
          <div>الكونتينر · {r.cont || "ما له كونتينر"}</div>
          <div>الفئة · {r.catName || r.cat}</div>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── مجموعة حالة ────────────────────────────────────────────
function StatusGroup({ title, hint, color, items, images, right, onImg }) {
  const [open, setOpen] = useState(true);
  if (!items?.length) return null;

  return (
    <div>
      <div onClick={()=>setOpen(!open)}
        style={{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",
          margin:"20px 0 4px"}}>
        <span style={{width:"7px",height:"7px",borderRadius:"50%",background:color,
          flexShrink:0}}/>
        <span style={{fontSize:"14px",fontWeight:900,color:"#e8edf4",flex:1}}>
          {title}
        </span>
        <span style={{fontSize:"12px",fontWeight:900,color,background:`${color}1f`,
          borderRadius:"100px",padding:"2px 9px"}}>{fmtN(items.length)}</span>
        <span style={{color:"#4a5668",fontSize:"11px"}}>{open?"▲":"▼"}</span>
      </div>
      <div style={{fontSize:"11px",color:"#6b788c",marginBottom:"10px"}}>{hint}</div>

      {open && items.map(r=>(
        <Row key={r.barcode} r={r} rank={-1} images={images} onImg={onImg}
          color={color}
          value={right(r).v} unit={right(r).u}
          sub={`وارد ${fmtN(r.lc?.bought ?? 0)} · باع ${fmtN(r.qty)}`}>
          {r.lc?.note && <div style={{color:"#cbd5e1"}}>{r.lc.note}</div>}
        </Row>
      ))}
    </div>
  );
}

// ─── الطباعة ────────────────────────────────────────────────
export function buildSeasonHtml(A, settings, images = {}) {
  const brand = settings?.brandName ?? "ALBAROO";
  const today = new Date().toLocaleDateString("ar-SA");

  const tbl = (headers, rows) => `<table>
    <thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r=>`<tr>${r.map((c,i)=>
      `<td class="${i===0?'num':''}">${c}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>`;

  // خلية الصورة
  const imgC = bc => images?.[bc]
    ? `<img src="${images[bc]}" class="th"/>`
    : `<div class="noimg">📦</div>`;

  // خلية المصنع: الرقم فوق والاسم تحته
  const facC = r => `<b>${esc(r.fac)}</b>${r.facName ? `<br><span class="sm">${esc(r.facName)}</span>` : ""}`;

  // أعمدة المنتج الثابتة: صورة · باركود · اسم · مصنع · كونتينر · فئة
  const PH = ["صورة","الباركود","المنتج","المصنع","الكونتينر","الفئة"];
  const PC = r => [imgC(r.barcode), `<span class="bc">${esc(r.barcode)}</span>`,
                   esc(r.name), facC(r), esc(r.cont||"—"), esc(r.cat)];

  const sec = (title, inner) => `<div class="sec"><h2>${esc(title)}</h2>${inner}</div>`;

  const stats = `<div class="stats">${[
    ["الفترات", fmtN(A.periodCount)],
    ["إجمالي مباع", fmtN(A.grandQty)],
    ["الإيراد", fmtM(A.grandRev)],
    ["الربح", fmtM(A.grandProfit)],
    ["الفروع", fmtN(A.branches.length)],
    ["ضاع بالنفاد", fmtN(A.totalLost)],
    ["فلوس واقفة", fmtM(A.tiedValue)],
  ].map(([l,v])=>`<div class="st"><div class="sv">${v}</div><div class="sl">${l}</div></div>`).join("")}</div>`;

  let body = stats;

  // ١ — عام
  body += sec("🏆 أفضل ٣٠ منتج — كمية",
    tbl(["#",...PH,"مباع","الإيراد","الربح","دوران"],
      A.topByQty.slice(0,30).map((r,i)=>[i+1,...PC(r),
        `<b>${fmtN(r.qty)}</b>`,fmtM(r.rev),fmtM(r.profit),fmtPct(r.turnPct)])));

  body += sec("💰 أفضل ٣٠ منتج — ربح",
    tbl(["#",...PH,"الربح","مباع","الإيراد","دوران"],
      A.topByProfit.slice(0,30).map((r,i)=>[i+1,...PC(r),
        `<b>${fmtM(r.profit)}</b>`,fmtN(r.qty),fmtM(r.rev),fmtPct(r.turnPct)])));

  body += sec("🏷️ الفئات — كل الفروع",
    tbl(["#","الفئة","منتجات","مباع","الإيراد","الربح","% من الموسم"],
      A.topCats.map((c,i)=>[i+1,esc(c.catName),fmtN(c.items),fmtN(c.qty),
        fmtM(c.rev),fmtM(c.profit),
        fmtPct(A.grandQty>0?(c.qty/A.grandQty)*100:0)])));

  // ٢ — الزمن
  body += sec("📅 الخط الزمني — متى انتعشت ومتى هبطت",
    tbl(["#","الفترة","مباع","الإيراد","عن المتوسط","التغير","الحالة"],
      A.timeline.map((t,i)=>[i+1,esc(t.label),fmtN(t.qty),fmtM(t.rev),
        `<span class="sign">${t.vsAvgPct>0?"+":""}${fmtPct(t.vsAvgPct)}</span>`,
        t.change===null?"—":`<span class="sign">${t.change>0?"+":""}${fmtPct(t.change)}</span>`,
        t.vsAvgPct>=A.thresholdPct?"🟢 انتعاش"
        :t.vsAvgPct<=-A.thresholdPct?"🔴 هبوط":"⚪ عادي"])));

  body += sec("⚡ ملخص الذرى",
    `<div class="hl">
      <p><b>أقوى فترة:</b> ${esc(A.best?.label??"—")} بـ ${fmtN(A.best?.qty??0)} قطعة</p>
      <p><b>أضعف فترة:</b> ${esc(A.worst?.label??"—")} بـ ${fmtN(A.worst?.qty??0)} قطعة</p>
      <p><b>المتوسط:</b> ${fmtN(Math.round(A.avg))} قطعة لكل فترة</p>
      <p><b>فترات الانتعاش:</b> ${A.peaks.map(p=>esc(p.label)).join("، ")||"—"}</p>
      <p><b>فترات الهبوط:</b> ${A.dips.map(p=>esc(p.label)).join("، ")||"—"}</p>
    </div>`);

  // ٣ — حالة المنتجات
  if (A.soldOut.length) {
    body += sec(`🔵 نفد قبل نهاية المدة (${fmtN(A.soldOut.length)}) — الطلب أعلى مما بعناه`,
      `<div class="hl"><p>هذي المنتجات خلصت بضاعتها وباقي وقت في المدة.
       نزول مبيعاتها آخر المدة <b>نقص بضاعة مو ضعف طلب</b> — نزيدها مو نقللها.
       الضائع تقديريًا: <b>${fmtN(A.totalLost)}</b> قطعة.</p></div>` +
      tbl(["#",...PH,"وارد","باع","خلص في","فترات ضاعت","معدله","ضاع ~"],
        A.soldOut.map((r,i)=>[i+1,...PC(r),fmtN(r.lc.bought),fmtN(r.qty),
          esc(r.lc.outLabel), fmtN(r.lc.trailingZeros),
          fmtN(Math.round(r.lc.rate)),
          `<b class="big">${fmtN(r.lc.lost)}</b>`])));
  }

  if (A.stalled.length) {
    body += sec(`🟠 وقف بيعه في النص (${fmtN(A.stalled.length)})`,
      `<div class="hl"><p>آخر بيعة لها بدري وبعدها صفر.
       راجع إذا نفدت من الفرع ولا الطلب وقف.</p></div>` +
      tbl(["#",...PH,"وارد","باع","آخر بيعة","فترات صفر","باقي"],
        A.stalled.map((r,i)=>[i+1,...PC(r),fmtN(r.lc.bought),fmtN(r.qty),
          esc(r.lc.lastLabel),fmtN(r.lc.trailingZeros),fmtN(r.lc.left)])));
  }

  if (A.declined.length) {
    body += sec(`🔴 ضعف طلبه فعلًا (${fmtN(A.declined.length)}) — نقلله`,
      `<div class="hl"><p>عندها بضاعة وما انباعت — هذا ضعف طلب حقيقي، مو نفاد.</p></div>` +
      tbl(["#",...PH,"وارد","باع","باقي","دوران"],
        A.declined.map((r,i)=>[i+1,...PC(r),fmtN(r.lc.bought),fmtN(r.qty),
          `<b>${fmtN(r.lc.left)}</b>`,fmtPct(r.turnPct)])));
  }

  if (A.stagnant.length) {
    body += sec(`⚫ ما تحرك أو حركته ضعيفة (${fmtN(A.stagnant.length)})`,
      `<div class="hl"><p>الفلوس الواقفة: <b>${fmtM(A.tiedValue)}</b> ·
       <b>${fmtN(A.deadCount)}</b> منتج ما باع ولا قطعة وحدة.</p></div>` +
      tbl(["#",...PH,"وارد","باع","دوران","باقي","شراء","فلوس واقفة","الحالة"],
        A.stagnant.map((r,i)=>[i+1,
          imgC(r.barcode), `<span class="bc">${esc(r.barcode)}</span>`,
          esc(r.name), facC(r), esc(r.cont||"—"), esc(r.cat),
          fmtN(r.bought),fmtN(r.sold),fmtPct(r.turnPct),fmtN(r.left),
          fmtM(r.buyPrice),`<b>${fmtM(r.tiedValue)}</b>`,r.status])));
  }

  // ٤ — كل فرع
  A.branches.forEach(b => {
    body += sec(`🏬 ${b.branch} — ${fmtN(b.qty)} قطعة (${fmtPct(b.sharePct)} من الموسم)`,
      `<div class="hl">
        <p><b>الإيراد:</b> ${fmtM(b.rev)} · <b>الربح:</b> ${fmtM(b.profit)}</p>
        <p><b>أقوى فترة:</b> ${esc(b.best?.label??"—")} (${fmtN(b.best?.qty??0)}) ·
           <b>أضعف فترة:</b> ${esc(b.worst?.label??"—")} (${fmtN(b.worst?.qty??0)})</p>
        <p><b>انتعش في:</b> ${b.peaks.map(p=>esc(p.label)).join("، ")||"—"}</p>
        <p><b>هبط في:</b> ${b.dips.map(p=>esc(p.label)).join("، ")||"—"}</p>
      </div>` +
      `<h3>أقوى ٢٥ منتج في ${esc(b.branch)}</h3>` +
      tbl(["#",...PH,"مباع","الإيراد","الربح","دوران"],
        b.topByQty.slice(0,25).map((r,i)=>[i+1,...PC(r),
          `<b>${fmtN(r.qty)}</b>`,fmtM(r.rev),fmtM(r.profit),fmtPct(r.turnPct)])) +
      `<h3>أفضل فئات ${esc(b.branch)}</h3>` +
      tbl(["#","الفئة","مباع","الربح","% من الفرع"],
        b.topCats.slice(0,10).map((c,i)=>[i+1,esc(c.catName),fmtN(c.qty),fmtM(c.profit),
          fmtPct(b.qty>0?(c.qty/b.qty)*100:0)])));
  });

  // ٤ — القرار
  A.recs.forEach(rc => {
    body += sec(`📦 قرار ${rc.branch} — ايش نجيب`,
      `<div class="hl">
        <p><b>نصيب الفرع:</b> ${fmtPct(rc.sharePct)} من الموسم ·
           <b>باع:</b> ${fmtN(rc.totalLastQty)} · <b>المقترح:</b> ${fmtN(rc.totalSuggest)}
           ${rc.urgent.length ? ` · <b>نفد عنده:</b> ${fmtN(rc.urgent.length)} منتج` : ""}</p>
      </div>` +
      tbl(["#",...PH,"باع","دوران","الحالة","نجيب","دزينة","الفرق","السبب"],
        rc.bring.map((r,i)=>[i+1,...PC(r),fmtN(r.qty),
          fmtPct(r.turnPct),r.tier,
          `<b class="big">${fmtN(r.suggest)}</b>`,
          fmtN(Math.round(r.suggest/12)),
          `<span class="sign" style="color:${r.delta>=0?"#0a7a52":"#c0392b"}">${
            r.delta>0?"+":""}${fmtN(r.delta)}</span>`,
          `<span class="why">${esc(r.why)}</span>`])) +
      (rc.stop.length ? `<h3>⚠️ نقلل أو نوقف</h3>` +
        tbl(["#",...PH,"باع","دوران","الحالة","نجيب","السبب"],
          rc.stop.map((r,i)=>[i+1,...PC(r),fmtN(r.qty),
            fmtPct(r.turnPct),r.tier,fmtN(r.suggest),
            `<span class="why">${esc(r.why)}</span>`])) : ""));
  });

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>تقرير الموسم</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;font-family:'Cairo',sans-serif}
body{background:#fff;color:#111;padding:14px;direction:rtl}
.bar{position:fixed;top:0;right:0;left:0;background:#0f172a;padding:9px;
  display:flex;gap:9px;justify-content:center;z-index:99}
.bar button{padding:7px 20px;border:none;border-radius:8px;font-family:'Cairo';
  font-weight:700;font-size:13px;cursor:pointer}
.b1{background:#d4a853;color:#000}.b2{background:#334155;color:#fff}
.wrap{margin-top:48px}
h1{font-size:22px;font-weight:900;text-align:center;margin-bottom:3px}
.meta{text-align:center;font-size:11px;color:#666;margin-bottom:14px;
  padding-bottom:10px;border-bottom:2px solid #d4a853}
.stats{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:18px}
.st{border:1px solid #ddd;border-radius:9px;padding:9px;text-align:center;background:#fafafa}
.sv{font-size:16px;font-weight:900;color:#b8935a}
.sl{font-size:9px;color:#777;margin-top:2px}
.sec{margin-bottom:22px;page-break-inside:avoid}
h2{font-size:15px;font-weight:900;background:#f4f4f4;padding:7px 10px;
  border-right:4px solid #d4a853;border-radius:5px;margin-bottom:9px}
h3{font-size:12px;font-weight:900;color:#555;margin:11px 0 6px}
.hl{background:#fcfaf5;border:1px solid #ece4d4;border-radius:8px;
  padding:10px;margin-bottom:9px;font-size:11px;line-height:1.9}
.hl b{color:#8a6d35}
table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:5px}
th{background:#2d3748;color:#fff;padding:6px 4px;font-weight:700;
  font-size:9px;text-align:center;border:1px solid #1a202c}
td{padding:4px;border:1px solid #ddd;text-align:center;vertical-align:middle}
td.num{background:#f7f7f7;font-weight:700;width:24px}
tbody tr:nth-child(even){background:#fafafa}
tbody tr{page-break-inside:avoid}
img.th{width:46px;height:46px;object-fit:cover;border-radius:5px;
  border:1px solid #ddd;display:block;margin:0 auto}
.noimg{width:46px;height:46px;border:1px dashed #ccc;border-radius:5px;
  display:flex;align-items:center;justify-content:center;font-size:19px;
  margin:0 auto;color:#bbb}
.bc{font-family:'Courier New',monospace;font-size:10px;font-weight:700;
  direction:ltr;display:inline-block;letter-spacing:-0.2px}
.sm{font-size:8px;color:#777;font-weight:400}
.big{font-size:13px;color:#0a7a52}
.sign{direction:ltr;display:inline-block;unicode-bidi:isolate;font-weight:700}
.why{font-size:8px;color:#666;line-height:1.5;display:block;max-width:190px}
@media print{.bar{display:none}.wrap{margin-top:0}body{padding:4px}
  img.th{width:40px;height:40px}.noimg{width:40px;height:40px}
  @page{size:A4 landscape;margin:7mm}}
</style></head><body>
<div class="bar">
  <button class="b1" onclick="window.print()">🖨️ طباعة</button>
  <button class="b2" onclick="window.close()">إغلاق</button>
</div>
<div class="wrap">
  <h1>📊 ${esc(settings?.__seasonName?.trim() || "تقرير الموسم")}</h1>
  <div class="meta">${esc(brand)} · ${esc(A.firstLabel)} ← ${esc(A.lastLabel)} ·
    ${fmtN(A.periodCount)} فترة · طُبع ${esc(today)}</div>
  ${body}
</div></body></html>`;

  return html;
}

function printSeason(A, settings, images = {}) {
  try {
    const html = buildSeasonHtml(A, settings, images);
    const w = window.open("", "_blank", "width=1000,height=720");
    if (!w) return { ok:false, error:"فعّل النوافذ المنبثقة في المتصفح" };
    w.document.write(html); w.document.close();
    return { ok:true };
  } catch (e) { return { ok:false, error:String(e?.message ?? e) }; }
}

// ════════════════════════════════════════════════════════════
export function SeasonReport({ products = [], settings = {},
  images = {}, onBack }) {

  const [tab,     setTab]     = useState("overall");
  const [metric,  setMetric]  = useState("qty");     // qty | profit
  const [branch,  setBranch]  = useState(null);
  const [pickCat, setPickCat] = useState(null);      // فئة نتبع زمنها
  const [pickPr,  setPickPr]  = useState(null);      // منتج نتبع زمنه
  const [thr,     setThr]     = useState(20);        // حساسية الانتعاش/الهبوط %
  const [viewImg, setViewImg] = useState(null);      // الصورة المفتوحة بالحجم الكامل

  // ── فترات الموسم: مخزن مستقل، ما يمس مبيعاتك العادية ──
  const [periods,  setPeriods]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [uploading,setUploading]= useState(false);
  const [log,      setLog]      = useState([]);
  const [meta,     setMeta]     = useState({ name:"", note:"" });
  const [showMgr,  setShowMgr]  = useState(false);   // شاشة إدارة الملفات

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ps, m] = await Promise.all([loadSeasonPeriods(), loadSeasonMeta()]);
      setPeriods(ps ?? []);
      setMeta(m ?? { name:"", note:"" });
    } catch { setPeriods([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(()=>{ refresh(); }, [refresh]);

  // ── رفع ملف ──
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setUploading(true);
    setLog([{type:"info", text:`📖 أقرأ «${file.name}»…`}]);
    try {
      const buffer = await file.arrayBuffer();
      const { periods: parsed, errors, warnings } = parseSalesFile(buffer, "");

      if (errors?.length) {
        setLog(errors.map(e=>({type:"error", text:e})));
        setUploading(false);
        return;
      }
      if (!parsed?.length) {
        setLog([{type:"error", text:"ما قدرت أقرأ الملف — تأكد إنه تقرير نقطة البيع"}]);
        setUploading(false);
        return;
      }

      const out = [
        {type:"success", text:`✅ لقيت ${parsed.length} ${parsed.length===1?"فترة":"فترة"} في الملف`},
        ...(warnings ?? []).slice(0,2).map(w=>({type:"warning", text:w})),
      ];
      setLog([...out]);

      let saved = 0, replaced = 0, skipped = 0;
      for (const p of parsed) {
        const r = await addSeasonPeriod(p);
        if (r.ok && r.ok2 === "replaced") { replaced++; out.push({type:"info",    text:`🔄 ${r.reason}`}); }
        else if (r.ok)                    { saved++;    out.push({type:"success", text:`💾 ${p.label}`}); }
        else                              { skipped++;  out.push({type:"warning", text:`⏭️ ${r.reason}`}); }
        setLog([...out]);
      }
      out.push({type:"success",
        text:`تم — جديد ${saved} · محدّث ${replaced}${skipped?` · متخطّى ${skipped}`:""}`});
      setLog([...out]);
      await refresh();
    } catch (e) {
      setLog([{type:"error", text:`خطأ: ${e?.message ?? e}`}]);
    } finally { setUploading(false); }
  }, [refresh]);

  const removeOne = async (p) => {
    if (!confirm(`تحذف «${p.label}»؟`)) return;
    await deleteSeasonPeriod(p.id);
    await refresh();
  };
  const removeAll = async () => {
    if (!confirm(`تحذف كل فترات الموسم (${periods.length})؟\nمبيعاتك العادية ما تتأثر.`)) return;
    await deleteAllSeasonPeriods();
    await refresh();
  };

  const A = useMemo(
    () => seasonAnalysis(products, periods, settings, { thresholdPct: thr }),
    [products, periods, settings, thr]
  );

  // خط زمني للمنتج أو الفئة المختارة
  const pickTL = useMemo(() => {
    if (pickPr)  return timelineFor(A.periods, pickPr.barcode, branch);
    if (pickCat) return timelineFor(A.periods, pickCat.barcodes, branch);
    return null;
  }, [pickPr, pickCat, A.periods, branch]);

  // ── لوحة الرفع والإدارة (تظهر فاضية أو عند الضغط على "الملفات") ──
  const uploadPanel = (
    <div className="space-y-3">
      <div style={{background:"rgba(16,185,129,0.07)",border:"1px solid rgba(16,185,129,0.25)",
        borderRadius:"16px",padding:"14px"}}>
        <div style={{fontSize:"14px",fontWeight:900,color:"#fff",marginBottom:"4px"}}>
          📤 ارفع مبيعات الموسم
        </div>
        <div style={{fontSize:"11px",color:"#94a3b8",lineHeight:1.8,marginBottom:"11px"}}>
          مخزن مستقل — <b style={{color:C.green}}>مبيعاتك العادية ما تتأثر أبدًا</b>.
          ارفع ملف تقرير نقطة البيع كما هو؛ لو فيه أيام متعددة ينفصلون تلقائيًا
          كل يوم بتاريخه.
        </div>

        <input value={meta.name ?? ""}
          onChange={e=>{ const m={...meta,name:e.target.value}; setMeta(m); }}
          onBlur={()=>saveSeasonMeta(meta)}
          placeholder="اسم الموسم — مثلاً: رمضان 1447"
          style={{width:"100%",background:"rgba(0,0,0,0.3)",border:"1px solid rgba(255,255,255,0.12)",
            color:"#f1f5f9",borderRadius:"11px",padding:"9px 12px",fontSize:"13px",
            fontFamily:"Cairo,sans-serif",marginBottom:"10px",outline:"none"}}/>

        <label style={{display:"block",cursor: uploading?"wait":"pointer",
          background: uploading ? "#334155" : "linear-gradient(135deg,#059669,#047857)",
          color:"#fff",borderRadius:"13px",padding:"14px",textAlign:"center",
          fontWeight:900,fontSize:"13px"}}>
          {uploading ? "⏳ جاري الرفع…" : "📂 اختر ملف المبيعات"}
          <input type="file" accept=".xlsx,.xls" disabled={uploading}
            style={{display:"none"}}
            onChange={e=>{ const f=e.target.files?.[0]; e.target.value=""; handleFile(f); }}/>
        </label>

        {log.length > 0 && (
          <div style={{marginTop:"11px",maxHeight:"230px",overflowY:"auto"}}>
            {log.map((l,i)=>(
              <div key={i} style={{fontSize:"11px",padding:"5px 9px",borderRadius:"8px",
                marginBottom:"3px",lineHeight:1.6,
                background: l.type==="success" ? "rgba(16,185,129,0.12)"
                          : l.type==="error"   ? "rgba(248,113,113,0.12)"
                          : l.type==="warning" ? "rgba(245,158,11,0.12)"
                          :                      "rgba(56,189,248,0.1)",
                color:     l.type==="success" ? "#6ee7b7"
                          : l.type==="error"   ? "#fca5a5"
                          : l.type==="warning" ? "#fcd34d"
                          :                      "#7dd3fc"}}>
                {l.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {periods.length > 0 && (
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            marginBottom:"9px"}}>
            <div style={{fontSize:"13px",fontWeight:900,color:"#e2e8f0"}}>
              📅 الفترات المرفوعة ({fmtN(periods.length)})
            </div>
            <button onClick={removeAll}
              style={{background:"rgba(248,113,113,0.12)",border:"1px solid rgba(248,113,113,0.3)",
                borderRadius:"9px",padding:"5px 11px",color:C.red,fontSize:"11px",
                fontWeight:700,cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>
              🗑️ احذف الكل
            </button>
          </div>
          {[...A.periods].map(p=>{
            const q = Object.values(p.sales??{}).reduce((s,d)=>
              s + Object.values(d).reduce((ss,v)=>ss+(Number(v?.qty)||0),0), 0);
            const nb = Object.keys(p.sales??{}).length;
            return (
              <div key={p.id} style={{background:"rgba(255,255,255,0.03)",
                border:"1px solid rgba(255,255,255,0.07)",borderRadius:"12px",
                padding:"11px",marginBottom:"6px",display:"flex",
                alignItems:"center",gap:"10px"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"13px",fontWeight:700,color:"#e2e8f0"}}>{p.label}</div>
                  <div style={{fontSize:"10px",color:"#64748b",marginTop:"2px"}}>
                    {fmtN(nb)} فرع · {fmtN(q)} قطعة
                  </div>
                </div>
                <button onClick={()=>removeOne(p)}
                  style={{background:"rgba(248,113,113,0.1)",border:"none",borderRadius:"8px",
                    padding:"7px 10px",color:C.red,fontSize:"13px",cursor:"pointer",
                    flexShrink:0}}>✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-3">
        <BackBtn onClick={onBack} label="رجوع للتقارير" />
        <SectionHeader icon="📊" title="تقرير الموسم" />
        <div style={{textAlign:"center",padding:"60px",color:"#64748b"}}>⏳ أحمّل…</div>
      </div>
    );
  }

  if (!periods.length) {
    return (
      <div className="space-y-3">
        <BackBtn onClick={onBack} label="رجوع للتقارير" />
        <SectionHeader icon="📊" title="تقرير الموسم" />
        {uploadPanel}
      </div>
    );
  }

  if (showMgr) {
    return (
      <div className="space-y-3">
        <button onClick={()=>setShowMgr(false)}
          style={{background:"none",border:"none",color:C.sky,fontWeight:700,
            fontSize:"13px",cursor:"pointer",fontFamily:"Cairo,sans-serif",padding:0}}>
          ← رجوع للتقرير
        </button>
        <SectionHeader icon="📂" title="ملفات الموسم" />
        {uploadPanel}
      </div>
    );
  }

  const TABS = [
    ["overall",  "المنتجات"],
    ["branches", "الفروع"],
    ["status",   "الحالة"],
    ["decide",   "القرار"],
  ];

  const bA = branch ? A.branches.find(b=>b.branch===branch) : null;
  const rc = branch ? A.recs.find(r=>r.branch===branch)     : null;

  return (
    <div className="space-y-3">
      <Viewer img={viewImg} onClose={()=>setViewImg(null)} />
      <BackBtn onClick={onBack} label="رجوع للتقارير" />

      {/* ══ الموسم ══ الخط الزمني هو بطل الشاشة، يبقى فوق دايم */}
      <div style={{background:"rgba(255,255,255,0.03)",borderRadius:"18px",padding:"16px",
        border:"1px solid rgba(255,255,255,0.06)"}}>
        <div style={{display:"flex",alignItems:"flex-start",
          justifyContent:"space-between",gap:"10px",marginBottom:"14px"}}>
          <div style={{minWidth:0}}>
            <div style={{fontSize:"16px",fontWeight:900,color:"#fff"}}>
              {meta.name?.trim() || "تقرير الموسم"}
            </div>
            <div style={{fontSize:"11px",color:"#6b788c",marginTop:"3px"}}>
              {A.firstLabel} ← {A.lastLabel} · {fmtN(A.periodCount)} فترة
            </div>
          </div>
          <div style={{display:"flex",gap:"6px",flexShrink:0}}>
            <button onClick={()=>setShowMgr(true)} title="ارفع أو احذف"
              style={{background:"rgba(255,255,255,0.06)",border:"none",color:"#cbd5e1",
                borderRadius:"10px",padding:"8px 11px",fontWeight:700,fontSize:"12px",
                cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>📂</button>
            <button onClick={()=>{
                const r = printSeason(A, {...settings, __seasonName: meta.name}, images);
                if (!r.ok) alert(r.error); }}
              style={{background:C.gold,color:"#0b0f16",border:"none",borderRadius:"10px",
                padding:"8px 14px",fontWeight:900,fontSize:"12px",cursor:"pointer",
                fontFamily:"Cairo,sans-serif"}}>طباعة</button>
          </div>
        </div>

        <Timeline points={A.timeline} avg={A.avg} thr={thr} height={104} />

        {/* ثلاثة أرقام فقط — الباقي داخل التبويبات */}
        <div style={{display:"flex",gap:"18px",marginTop:"16px",paddingTop:"14px",
          borderTop:"1px solid rgba(255,255,255,0.06)"}}>
          {[["مباع", fmtN(A.grandQty)],
            ["ربح", fmtM(A.grandProfit)],
            ["فروع", fmtN(A.branches.length)]].map(([l,v])=>(
            <div key={l}>
              <div style={{fontSize:"17px",fontWeight:900,color:"#e8edf4"}}>{v}</div>
              <div style={{fontSize:"10.5px",color:"#5b6878",marginTop:"1px"}}>{l}</div>
            </div>
          ))}
        </div>

        {!A.dateParsed && (
          <div style={{marginTop:"12px",fontSize:"11px",color:"#fbbf24",lineHeight:1.8}}>
            أسماء الفترات ما فيها تواريخ، فالترتيب حسب الرفع.
            سمّها بالتاريخ أو «رمضان 1» لترتيب مضبوط.
          </div>
        )}
      </div>

      {/* تنبيهان فقط، ومختصران */}
      {(A.totalLost > 0 || A.deadCount > 0) && (
        <div onClick={()=>setTab("status")}
          style={{display:"flex",gap:"8px",cursor:"pointer"}}>
          {A.totalLost > 0 && (
            <div style={{flex:1,background:"rgba(56,189,248,0.07)",borderRadius:"14px",
              padding:"12px",border:"1px solid rgba(56,189,248,0.2)"}}>
              <div style={{fontSize:"19px",fontWeight:900,color:C.sky}}>{fmtN(A.totalLost)}</div>
              <div style={{fontSize:"11px",color:"#8b97a8",marginTop:"2px"}}>ضاعت بالنفاد</div>
            </div>
          )}
          {A.deadCount > 0 && (
            <div style={{flex:1,background:"rgba(248,113,113,0.07)",borderRadius:"14px",
              padding:"12px",border:"1px solid rgba(248,113,113,0.2)"}}>
              <div style={{fontSize:"19px",fontWeight:900,color:C.red}}>{fmtM(A.tiedValue)}</div>
              <div style={{fontSize:"11px",color:"#8b97a8",marginTop:"2px"}}>واقفة في الرفوف</div>
            </div>
          )}
        </div>
      )}

      {/* التبويبات — نص فقط، بلا أيقونات */}
      <div style={{display:"flex",gap:"4px",background:"rgba(255,255,255,0.04)",
        borderRadius:"12px",padding:"4px"}}>
        {TABS.map(([k,lb])=>(
          <button key={k} onClick={()=>{ setTab(k); setPickCat(null); setPickPr(null); }}
            style={{flex:1,padding:"9px 4px",borderRadius:"9px",cursor:"pointer",
              fontFamily:"Cairo,sans-serif",fontSize:"12.5px",fontWeight:700,border:"none",
              background: tab===k ? "#e8edf4" : "transparent",
              color:      tab===k ? "#0b0f16" : "#6b788c",
              transition:"background .12s"}}>
            {lb}
          </button>
        ))}
      </div>

      {/* ══ عام ══ */}
      {tab === "overall" && (
        <div className="space-y-3">
          <Toggle value={metric} onChange={setMetric}
            options={[["qty","كمية"],["profit","ربح"]]} />

          <div>
            {(metric==="profit" ? A.topByProfit : A.topByQty).slice(0,30).map((r,i)=>{
              const val = metric==="profit" ? r.profit : r.qty;
              const max = (metric==="profit" ? A.topByProfit[0]?.profit : A.topByQty[0]?.qty) || 1;
              return (
                <Row key={r.barcode} r={r} rank={i} images={images} onImg={setViewImg}
                  value={metric==="profit" ? fmtM(val) : fmtN(val)}
                  unit={metric==="profit" ? "ريال" : "قطعة"}
                  color={metric==="profit" ? C.green : C.gold}
                  fill={(val/max)*100}
                  sub={`دوران ${fmtPct(r.turnPct)}`}>
                  <div>باع {fmtN(r.qty)} · إيراد {fmtM(r.rev)} · ربح {fmtM(r.profit)}</div>
                  <button onClick={e=>{ e.stopPropagation(); setPickPr(r); setPickCat(null); }}
                    style={{marginTop:"7px",background:"rgba(56,189,248,0.12)",border:"none",
                      borderRadius:"8px",padding:"7px 12px",color:C.sky,fontSize:"11.5px",
                      fontWeight:700,cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>
                    متى انتعش؟
                  </button>
                </Row>
              );
            })}
          </div>

          <div>
            <Head>الفئات</Head>
            {(metric==="profit" ? A.topCatsProfit : A.topCats).map((c,i)=>{
              const val = metric==="profit" ? c.profit : c.qty;
              const max = (metric==="profit" ? A.topCatsProfit[0]?.profit : A.topCats[0]?.qty) || 1;
              return (
                <div key={c.cat} onClick={()=>{ setPickCat(c); setPickPr(null); }}
                  style={{background:"rgba(255,255,255,0.028)",borderRadius:"14px",
                    marginBottom:"7px",cursor:"pointer",overflow:"hidden",
                    border:"1px solid rgba(255,255,255,0.05)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"12px",padding:"13px 14px"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"14px",fontWeight:700,color:"#f1f5f9"}}>{c.catName}</div>
                      <div style={{fontSize:"11px",color:"#7c8a9e",marginTop:"3px"}}>
                        {fmtN(c.items)} منتج · {fmtPct(A.grandQty>0?(c.qty/A.grandQty)*100:0)} من الموسم
                      </div>
                    </div>
                    <div style={{fontSize:"21px",fontWeight:900,color:C.purple,
                      letterSpacing:"-0.5px"}}>
                      {metric==="profit" ? fmtM(val) : fmtN(val)}
                    </div>
                  </div>
                  <div style={{height:"2.5px",background:"rgba(255,255,255,0.05)",display:"flex",justifyContent:"flex-start"}}>
                    <div style={{width:`${(val/max)*100}%`,height:"100%",background:C.purple}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ الفروع ══ */}
      {tab === "branches" && (
        <div>
          {!branch ? (
            <>
              <Head note="مرتبة بالأقوى — اضغط فرع لتحليله">الفروع</Head>
              {A.branches.map((b,i)=>(
                <div key={b.branch} onClick={()=>setBranch(b.branch)}
                  style={{background:"rgba(255,255,255,0.028)",borderRadius:"14px",
                    marginBottom:"7px",cursor:"pointer",overflow:"hidden",
                    border:"1px solid rgba(255,255,255,0.05)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"12px",padding:"13px 14px"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"14px",fontWeight:700,color:"#f1f5f9",
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {i===0 && "🥇 "}{b.branch}
                      </div>
                      <div style={{fontSize:"11px",color:"#7c8a9e",marginTop:"3px",
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        أقوى منتج · {b.topByQty[0]?.name ?? "—"}
                      </div>
                    </div>
                    <div style={{textAlign:"left",flexShrink:0}}>
                      <div style={{fontSize:"21px",fontWeight:900,color:C.gold,
                        letterSpacing:"-0.5px"}}>{fmtN(b.qty)}</div>
                      <div style={{fontSize:"10px",color:"#5b6878"}}>{fmtPct(b.sharePct)}</div>
                    </div>
                  </div>
                  <div style={{height:"2.5px",background:"rgba(255,255,255,0.05)",display:"flex",justifyContent:"flex-start"}}>
                    <div style={{width:`${b.sharePct}%`,height:"100%",background:C.gold}}/>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <button onClick={()=>setBranch(null)}
                style={{background:"none",border:"none",color:C.sky,fontWeight:700,
                  fontSize:"13px",cursor:"pointer",fontFamily:"Cairo,sans-serif",
                  padding:"4px 0",marginBottom:"8px"}}>
                ← كل الفروع
              </button>

              {/* زمن الفرع + أرقامه في بطاقة واحدة */}
              <div style={{background:"rgba(255,255,255,0.03)",borderRadius:"18px",
                padding:"16px",border:"1px solid rgba(255,255,255,0.06)",marginBottom:"4px"}}>
                <div style={{fontSize:"15px",fontWeight:900,color:"#fff",marginBottom:"14px"}}>
                  {branch}
                </div>
                <Timeline points={bA.timeline} avg={bA.avg} thr={thr} height={96}/>
                <div style={{display:"flex",gap:"18px",marginTop:"16px",paddingTop:"14px",
                  borderTop:"1px solid rgba(255,255,255,0.06)"}}>
                  {[["مباع", fmtN(bA.qty)],
                    ["ربح", fmtM(bA.profit)],
                    ["نصيبه", fmtPct(bA.sharePct)]].map(([l,v])=>(
                    <div key={l}>
                      <div style={{fontSize:"17px",fontWeight:900,color:"#e8edf4"}}>{v}</div>
                      <div style={{fontSize:"10.5px",color:"#5b6878",marginTop:"1px"}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>

              <Head>منتجاته</Head>
              <Toggle value={metric} onChange={setMetric}
                options={[["qty","كمية"],["profit","ربح"]]} />
              <div style={{marginTop:"10px"}}>
                {(metric==="profit" ? bA.topByProfit : bA.topByQty).slice(0,40).map((r,i)=>{
                  const val = metric==="profit" ? r.profit : r.qty;
                  const max = (metric==="profit" ? bA.topByProfit[0]?.profit : bA.topByQty[0]?.qty) || 1;
                  return (
                    <Row key={r.barcode} r={r} rank={i} images={images} onImg={setViewImg}
                      value={metric==="profit" ? fmtM(val) : fmtN(val)}
                      unit={metric==="profit" ? "ريال" : "قطعة"}
                      color={metric==="profit" ? C.green : C.gold}
                      fill={(val/max)*100}
                      sub={`دوران ${fmtPct(r.turnPct)}`}>
                      <div>باع {fmtN(r.qty)} · إيراد {fmtM(r.rev)} · ربح {fmtM(r.profit)}</div>
                      <button onClick={e=>{ e.stopPropagation(); setPickPr(r); setPickCat(null); }}
                        style={{marginTop:"7px",background:"rgba(56,189,248,0.12)",border:"none",
                          borderRadius:"8px",padding:"7px 12px",color:C.sky,fontSize:"11.5px",
                          fontWeight:700,cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>
                        متى انتعش في {branch}؟
                      </button>
                    </Row>
                  );
                })}
              </div>

              <Head>فئاته</Head>
              {bA.topCats.map(c=>(
                <div key={c.cat} onClick={()=>{ setPickCat(c); setPickPr(null); }}
                  style={{background:"rgba(255,255,255,0.028)",borderRadius:"14px",
                    marginBottom:"7px",cursor:"pointer",overflow:"hidden",
                    border:"1px solid rgba(255,255,255,0.05)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"12px",padding:"13px 14px"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"14px",fontWeight:700,color:"#f1f5f9"}}>{c.catName}</div>
                      <div style={{fontSize:"11px",color:"#7c8a9e",marginTop:"3px"}}>
                        {fmtPct(bA.qty>0?(c.qty/bA.qty)*100:0)} من الفرع
                      </div>
                    </div>
                    <div style={{fontSize:"21px",fontWeight:900,color:C.purple,
                      letterSpacing:"-0.5px"}}>{fmtN(c.qty)}</div>
                  </div>
                  <div style={{height:"2.5px",background:"rgba(255,255,255,0.05)",display:"flex",justifyContent:"flex-start"}}>
                    <div style={{width:`${(c.qty/(bA.topCats[0]?.qty||1))*100}%`,
                      height:"100%",background:C.purple}}/>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ══ الزمن ══ لوحة منبثقة عند اختيار منتج أو فئة */}
      {(pickPr || pickCat) && pickTL && (()=>{
        const avg  = pickTL.reduce((s,p)=>s+p.qty,0) / (pickTL.length||1);
        const up   = pickTL.filter(p=>p.vsAvgPct >=  thr);
        const down = pickTL.filter(p=>p.vsAvgPct <= -thr);
        return (
          <div onClick={()=>{ setPickPr(null); setPickCat(null); }}
            style={{position:"fixed",inset:0,background:"rgba(2,6,14,0.82)",zIndex:60,
              display:"flex",alignItems:"flex-end",justifyContent:"center",
              backdropFilter:"blur(3px)"}}>
            <div onClick={e=>e.stopPropagation()}
              style={{background:"#121824",borderRadius:"22px 22px 0 0",padding:"20px",
                width:"100%",maxWidth:"480px",maxHeight:"86vh",overflowY:"auto",
                border:"1px solid rgba(255,255,255,0.08)"}}>

              <div style={{width:"38px",height:"4px",background:"rgba(255,255,255,0.18)",
                borderRadius:"100px",margin:"0 auto 16px"}}/>

              <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"16px"}}>
                {pickPr && <Thumb src={images?.[pickPr.barcode]} size={52} onOpen={setViewImg} name={pickPr.name}/>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"15px",fontWeight:900,color:"#fff",
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {pickPr ? pickPr.name : pickCat.catName}
                  </div>
                  <div style={{fontSize:"11px",color:"#6b788c",marginTop:"3px"}}>
                    {branch ? branch : "كل الفروع"}
                    {pickCat ? ` · ${fmtN(pickCat.items)} منتج` : ""}
                  </div>
                </div>
                <button onClick={()=>{ setPickPr(null); setPickCat(null); }}
                  style={{background:"rgba(255,255,255,0.07)",border:"none",borderRadius:"9px",
                    padding:"8px 12px",color:"#94a3b8",fontSize:"14px",cursor:"pointer"}}>✕</button>
              </div>

              <Timeline points={pickTL} avg={avg} thr={thr} height={118}/>

              <div style={{marginTop:"18px",display:"flex",flexDirection:"column",gap:"10px"}}>
                <Line label="انتعش" color={C.green}
                  value={up.map(p=>p.label).join("، ") || "ما فيه ذروة واضحة"}/>
                <Line label="هبط" color={C.red}
                  value={down.map(p=>p.label).join("، ") || "ما فيه هبوط واضح"}/>
                <Line label="المتوسط" color="#8b97a8"
                  value={`${fmtN(Math.round(avg))} لكل فترة`}/>
              </div>
            </div>
          </div>
        );
      })()}


      {/* ══ الحالة ══ */}
      {tab === "status" && (
        <div className="space-y-3">
          <div style={{background:"rgba(56,189,248,0.07)",border:"1px solid rgba(56,189,248,0.22)",
            borderRadius:"13px",padding:"12px",fontSize:"11px",color:"#94a3b8",lineHeight:1.9}}>
            المنتج اللي <b style={{color:C.sky}}>نفد</b> مبيعاته تنزل آخر المدة — بس هذا
            مو ضعف طلب، هذا نقص بضاعة. والفرق يقلب القرار:
            النافد <b style={{color:C.sky}}>نزيده</b>، والضعيف <b style={{color:C.red}}>نقلله</b>.
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"6px"}}>
            <Stat label="ضاع بسبب النفاد" value={fmtN(A.totalLost)} color={C.sky} sub="قطعة تقديريًا"/>
            <Stat label="فلوس واقفة" value={fmtM(A.tiedValue)} color={C.red}
              sub={`${fmtN(A.deadCount)} منتج ما تحرك`}/>
          </div>

          {A.shortSeries && (
            <div style={{background:"rgba(148,163,184,0.09)",border:"1px solid rgba(148,163,184,0.28)",
              borderRadius:"13px",padding:"12px",fontSize:"11px",color:"#cbd5e1",lineHeight:1.8}}>
              ℹ️ عندك <b>{fmtN(A.periodCount)} فترة</b> فقط.
              كشف «توقف بيعه» معطّل لأنه يحتاج {fmtN(A.minPeriodsForStall)} فترة على الأقل —
              مع فترات قليلة، منتج ما باع كم يوم ما يعني إنه وقف.
              <div style={{marginTop:"5px",color:"#94a3b8",fontSize:"10px"}}>
                ارفع بقية أيام الموسم ويشتغل تلقائيًا.
              </div>
            </div>
          )}

          {A.overSold.length > 0 && (
            <div style={{background:"rgba(245,158,11,0.09)",border:"1px solid rgba(245,158,11,0.3)",
              borderRadius:"13px",padding:"12px",fontSize:"11px",color:"#fbbf24",lineHeight:1.8}}>
              ⚠️ <b>{fmtN(A.overSold.length)} منتج</b> باع أكثر من المسجّل وارد في المشتريات.
              يعني سجل مشترياتهم ناقص — كونتينر ما انرفع أو كمية ناقصة.
              <div style={{marginTop:"6px",color:"#94a3b8",fontSize:"10px"}}>
                راجعهم، لأن حسبة "نفد" و"ايش نجيب" تعتمد على الكمية الواردة:
                {" "}{A.overSold.slice(0,5).map(r=>r.name).join("، ")}
                {A.overSold.length > 5 ? ` و${fmtN(A.overSold.length-5)} غيرهم` : ""}
              </div>
            </div>
          )}

          <StatusGroup
            title="نفد قبل نهاية المدة"
            hint="خلصت بضاعته وباقي وقت — الطلب أعلى مما بعناه"
            color={C.sky} items={A.soldOut} images={images} onImg={setViewImg}
            right={r => ({ v: `+${fmtN(r.lc.lost)}`, u: "ضاع" })}
          />

          <StatusGroup
            title="وقف بيعه في النص"
            hint="آخر بيعة له بدري وبعدها صفر — راجع إذا نفد من الفرع"
            color="#fb923c" items={A.stalled} images={images} onImg={setViewImg}
            right={r => ({ v: fmtN(r.lc.trailingZeros), u: "فترة صفر" })}
          />

          <StatusGroup
            title="ضعف طلبه فعلًا"
            hint="عنده بضاعة وما انباعت — هذا اللي نقلله"
            color={C.red} items={A.declined} images={images} onImg={setViewImg}
            right={r => ({ v: fmtN(r.lc.left), u: "باقية" })}
          />

          {/* الراكد */}
          <div>
            <div style={{display:"flex",alignItems:"center",gap:"8px",margin:"20px 0 4px"}}>
              <span style={{width:"7px",height:"7px",borderRadius:"50%",
                background:"#64748b",flexShrink:0}}/>
              <span style={{fontSize:"14px",fontWeight:900,color:"#e8edf4",flex:1}}>
                ما تحرك أو حركته ضعيفة
              </span>
              <span style={{fontSize:"12px",fontWeight:900,color:"#94a3b8",
                background:"rgba(100,116,139,0.2)",borderRadius:"100px",
                padding:"2px 9px"}}>{fmtN(A.stagnant.length)}</span>
            </div>
            <div style={{fontSize:"11px",color:"#6b788c",marginBottom:"10px"}}>
              الأسوأ أول — اللي ما باع ولا قطعة، ثم الأعلى فلوسًا واقفة
            </div>
            {A.stagnant.length === 0 ? (
              <div style={{textAlign:"center",padding:"30px",color:"#4a5668",fontSize:"12px"}}>
                ما فيه منتج راكد
              </div>
            ) : A.stagnant.slice(0,60).map(r=>(
              <Row key={r.barcode} r={r} rank={-1} images={images} onImg={setViewImg}
                color={r.dead ? "#94a3b8" : "#fbbf24"}
                value={fmtM(r.tiedValue)} unit="واقفة"
                sub={`وارد ${fmtN(r.bought)} · باع ${fmtN(r.sold)} · باقي ${fmtN(r.left)}`}
                badge={
                  <span style={{display:"inline-block",marginTop:"5px",
                    background: r.dead ? "rgba(100,116,139,0.2)" : "rgba(245,158,11,0.14)",
                    borderRadius:"100px",padding:"2px 10px",fontSize:"10.5px",fontWeight:700,
                    color: r.dead ? "#cbd5e1" : "#fbbf24"}}>{r.status}</span>
                }>
                <div style={{color:"#cbd5e1"}}>
                  {r.note} · سعر الشراء {fmtM(r.buyPrice)}
                </div>
              </Row>
            ))}
            {A.stagnant.length > 60 && (
              <div style={{textAlign:"center",fontSize:"11px",color:"#4a5668",padding:"10px"}}>
                و{fmtN(A.stagnant.length - 60)} منتج آخر — كلهم في الطباعة
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ القرار ══ */}
      {tab === "decide" && (
        <div>
          {!branch ? (
            <>
              <Head note="الأساس = اللي باعه الفرع، مضروب في قوة المنتج، ومقرّب لدزينة">
                ايش نجيب لكل فرع
              </Head>
              {A.recs.map(r=>(
                <div key={r.branch} onClick={()=>setBranch(r.branch)}
                  style={{background:"rgba(255,255,255,0.028)",borderRadius:"14px",
                    marginBottom:"7px",cursor:"pointer",padding:"13px 14px",
                    border:"1px solid rgba(255,255,255,0.05)",
                    display:"flex",alignItems:"center",gap:"12px"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"14px",fontWeight:700,color:"#f1f5f9",
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {r.branch}
                    </div>
                    <div style={{fontSize:"11px",color:"#7c8a9e",marginTop:"3px"}}>
                      باع {fmtN(r.totalLastQty)}
                      {r.urgent.length ? ` · نفد عنده ${fmtN(r.urgent.length)}` : ""}
                    </div>
                  </div>
                  <div style={{textAlign:"left",flexShrink:0}}>
                    <div style={{fontSize:"21px",fontWeight:900,color:C.green,
                      letterSpacing:"-0.5px"}}>{fmtN(r.totalSuggest)}</div>
                    <div style={{fontSize:"10px",color:"#5b6878"}}>نجيب</div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <button onClick={()=>setBranch(null)}
                style={{background:"none",border:"none",color:C.sky,fontWeight:700,
                  fontSize:"13px",cursor:"pointer",fontFamily:"Cairo,sans-serif",
                  padding:"4px 0",marginBottom:"8px"}}>
                ← كل الفروع
              </button>

              <div style={{background:"rgba(255,255,255,0.03)",borderRadius:"18px",
                padding:"16px",border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{fontSize:"15px",fontWeight:900,color:"#fff"}}>{branch}</div>
                <div style={{display:"flex",gap:"18px",marginTop:"14px"}}>
                  {[["باع الموسم", fmtN(rc.totalLastQty)],
                    ["نجيب", fmtN(rc.totalSuggest)],
                    ["نصيبه", fmtPct(rc.sharePct)]].map(([l,v])=>(
                    <div key={l}>
                      <div style={{fontSize:"17px",fontWeight:900,color:"#e8edf4"}}>{v}</div>
                      <div style={{fontSize:"10.5px",color:"#5b6878",marginTop:"1px"}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>

              <Head note={`${fmtN(rc.bring.length)} منتج · الأعلى ${fmtN(Math.min(50,rc.bring.length))} هنا، وكلهم في الطباعة`}>نجيب</Head>
              {rc.bring.slice(0,50).map(r=>(
                <Row key={r.barcode} r={r} rank={-1} images={images} onImg={setViewImg}
                  color={C.green}
                  value={fmtN(r.suggest)}
                  unit={`${fmtN(Math.round(r.suggest/12))} دزينة`}
                  sub={`باع ${fmtN(r.qty)} · دوران ${fmtPct(r.turnPct)}`}
                  badge={
                    <span style={{display:"inline-block",marginTop:"5px",
                      background:`${r.color}1c`,borderRadius:"100px",padding:"2px 10px",
                      fontSize:"10.5px",fontWeight:700,color:r.color}}>
                      {r.tier} ×{r.grow}
                    </span>
                  }>
                  <div style={{color:"#cbd5e1"}}>{r.why}</div>
                  <div style={{marginTop:"4px"}}>
                    الفرق <span style={{color: r.delta>=0 ? C.green : C.red,
                      direction:"ltr",unicodeBidi:"isolate",fontWeight:700}}>
                      {r.delta>0?"+":""}{fmtN(r.delta)}</span>
                  </div>
                </Row>
              ))}

              {rc.stop.length > 0 && (
                <>
                  <Head note={`${fmtN(rc.stop.length)} منتج · باقية بضاعتها أو ما تتحرك`}>
                    نقلل أو نوقف
                  </Head>
                  {rc.stop.slice(0,30).map(r=>(
                    <Row key={r.barcode} r={r} rank={-1} images={images} onImg={setViewImg}
                      color={C.red}
                      value={fmtN(r.suggest)} unit="نجيب"
                      sub={`باع ${fmtN(r.qty)} · دوران ${fmtPct(r.turnPct)}`}
                      badge={
                        <span style={{display:"inline-block",marginTop:"5px",
                          background:"rgba(248,113,113,0.14)",borderRadius:"100px",
                          padding:"2px 10px",fontSize:"10.5px",fontWeight:700,
                          color:C.red}}>{r.tier}</span>
                      }>
                      <div style={{color:"#cbd5e1"}}>{r.why}</div>
                    </Row>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default SeasonReport;
