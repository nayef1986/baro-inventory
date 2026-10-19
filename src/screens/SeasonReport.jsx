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
function Timeline({ points, avg, onPick, thr = 20 }) {
  if (!points.length) return null;
  const max = Math.max(...points.map(p=>p.qty), 1);
  const avgY = avg > 0 ? (avg / max) * 100 : 0;

  return (
    <div>
      <div style={{position:"relative",display:"flex",alignItems:"flex-end",gap:"3px",
        height:"150px",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.1)"}}>
        {/* خط المتوسط */}
        <div style={{position:"absolute",right:0,left:0,bottom:`${avgY*1.34}px`,
          borderTop:"1px dashed rgba(212,168,83,0.45)",pointerEvents:"none"}}>
          <span style={{position:"absolute",right:0,top:"-15px",fontSize:"9px",color:C.gold}}>
            متوسط {fmtN(Math.round(avg))}
          </span>
        </div>
        {points.map((p,i)=>{
          const h   = (p.qty / max) * 100;
          const col = p.vsAvgPct >= thr ? C.green : p.vsAvgPct <= -thr ? C.red : C.slate;
          return (
            <div key={i} onClick={()=>onPick?.(p)} title={`${p.label}: ${fmtN(p.qty)}`}
              style={{flex:1,minWidth:"5px",display:"flex",flexDirection:"column",
                justifyContent:"flex-end",height:"100%",cursor:onPick?"pointer":"default"}}>
              <div style={{height:`${Math.max(2,h)}%`,background:col,borderRadius:"3px 3px 0 0"}}/>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:"9px",
        color:"#475569",marginTop:"5px"}}>
        <span>{points[0]?.label}</span>
        {points.length > 2 && <span>{points[Math.floor(points.length/2)]?.label}</span>}
        <span>{points[points.length-1]?.label}</span>
      </div>
      <div style={{display:"flex",gap:"12px",justifyContent:"center",marginTop:"8px",fontSize:"10px"}}>
        <span style={{color:C.green}}>■ انتعاش</span>
        <span style={{color:C.slate}}>■ عادي</span>
        <span style={{color:C.red}}>■ هبوط</span>
      </div>
    </div>
  );
}

// ─── صف منتج ────────────────────────────────────────────────
function ProdRow({ r, i, maxQty, metric, images, extra }) {
  const val = metric === "profit" ? r.profit : r.qty;
  const max = maxQty || 1;
  return (
    <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",
      borderRadius:"12px",padding:"10px",marginBottom:"6px"}}>
      <div style={{display:"flex",alignItems:"center",gap:"9px"}}>
        <div style={{width:"22px",fontSize:"12px",fontWeight:900,
          color: i<3 ? C.gold : "#475569",textAlign:"center",flexShrink:0}}>{i+1}</div>
        {images?.[r.barcode]
          ? <img src={images[r.barcode]} alt="" style={{width:"54px",height:"54px",
              borderRadius:"9px",objectFit:"cover",flexShrink:0}}/>
          : <div style={{width:"54px",height:"54px",borderRadius:"9px",background:"rgba(255,255,255,0.06)",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:"22px",flexShrink:0}}>📦</div>}
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:"12px",fontWeight:700,color:"#e2e8f0",
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
          <div style={{fontSize:"9px",color:"#94a3b8",marginTop:"2px",
            fontFamily:"monospace",direction:"ltr",textAlign:"right"}}>{r.barcode}</div>
          <div style={{fontSize:"9px",color:"#64748b",marginTop:"2px",lineHeight:1.6}}>
            🏭 {r.fac}{r.facName ? ` · ${r.facName}` : ""}
          </div>
          <div style={{fontSize:"9px",color:"#64748b",lineHeight:1.6}}>
            📦 {r.cont || "—"} · 🏷️ {r.cat}
          </div>
        </div>
        <div style={{textAlign:"left",flexShrink:0}}>
          <div style={{fontSize:"15px",fontWeight:900,
            color: metric==="profit" ? C.green : C.gold}}>
            {metric==="profit" ? fmtM(val) : fmtN(val)}
          </div>
          <div style={{fontSize:"9px",color:"#475569"}}>دوران {fmtPct(r.turnPct)}</div>
        </div>
      </div>
      <div style={{marginTop:"7px"}}><Bar pct={(val/max)*100}
        color={metric==="profit" ? C.green : C.gold} /></div>
      {extra}
    </div>
  );
}

// ─── مجموعة حالة ────────────────────────────────────────────
function StatusGroup({ title, hint, color, items, images, right }) {
  const [open, setOpen] = useState(true);
  if (!items?.length) return null;

  return (
    <div>
      <div onClick={()=>setOpen(!open)}
        style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          cursor:"pointer",marginBottom:"3px"}}>
        <div style={{fontSize:"13px",fontWeight:900,color:"#e2e8f0"}}>
          {title} ({fmtN(items.length)})
        </div>
        <span style={{color:"#475569",fontSize:"12px"}}>{open?"▲":"▼"}</span>
      </div>
      <div style={{fontSize:"10px",color:"#64748b",marginBottom:"9px"}}>{hint}</div>

      {open && items.map(r=>(
        <div key={r.barcode} style={{background:`${color}0d`,border:`1px solid ${color}33`,
          borderRadius:"12px",padding:"10px",marginBottom:"6px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"9px"}}>
            {images?.[r.barcode]
              ? <img src={images[r.barcode]} alt="" style={{width:"50px",height:"50px",
                  borderRadius:"9px",objectFit:"cover",flexShrink:0}}/>
              : <div style={{width:"50px",height:"50px",borderRadius:"9px",
                  background:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",
                  justifyContent:"center",fontSize:"20px",flexShrink:0}}>📦</div>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:"12px",fontWeight:700,color:"#e2e8f0",
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
              <div style={{fontSize:"9px",color:"#94a3b8",marginTop:"2px",
                fontFamily:"monospace",direction:"ltr",textAlign:"right"}}>{r.barcode}</div>
              <div style={{fontSize:"9px",color:"#64748b",marginTop:"2px",lineHeight:1.6}}>
                🏭 {r.fac}{r.facName ? ` · ${r.facName}` : ""}
              </div>
              <div style={{fontSize:"9px",color:"#64748b",lineHeight:1.6}}>
                📦 {r.cont || "—"} · وارد {fmtN(r.lc?.bought ?? 0)} · باع {fmtN(r.qty)}
              </div>
            </div>
            <div style={{textAlign:"left",flexShrink:0}}>{right?.(r)}</div>
          </div>
          {r.lc?.note && (
            <div style={{marginTop:"7px",fontSize:"10px",color:"#94a3b8",lineHeight:1.7,
              background:"rgba(0,0,0,0.2)",borderRadius:"8px",padding:"6px 9px"}}>
              {r.lc.note}
            </div>
          )}
        </div>
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
    ["overall",  "🏆", "عام"],
    ["branches", "🏬", "الفروع"],
    ["time",     "📅", "الزمن"],
    ["status",   "⚠️", "الحالة"],
    ["decide",   "📦", "القرار"],
  ];

  const bA = branch ? A.branches.find(b=>b.branch===branch) : null;
  const rc = branch ? A.recs.find(r=>r.branch===branch)     : null;

  return (
    <div className="space-y-3">
      <BackBtn onClick={onBack} label="رجوع للتقارير" />

      {/* ترويسة */}
      <div style={{background:"linear-gradient(135deg,rgba(212,168,83,0.13),rgba(212,168,83,0.03))",
        border:"1px solid rgba(212,168,83,0.3)",borderRadius:"16px",padding:"14px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"10px"}}>
          <div style={{minWidth:0}}>
            <div style={{fontSize:"17px",fontWeight:900,color:"#fff"}}>
              📊 {meta.name?.trim() || "تقرير الموسم"}
            </div>
            <div style={{fontSize:"11px",color:"rgba(212,168,83,0.75)",marginTop:"3px"}}>
              {A.firstLabel} ← {A.lastLabel} · {fmtN(A.periodCount)} فترة
            </div>
          </div>
          <div style={{display:"flex",gap:"6px",flexShrink:0}}>
            <button onClick={()=>setShowMgr(true)}
              title="ارفع أيامًا أخرى أو احذف"
              style={{background:"rgba(16,185,129,0.15)",border:"1px solid rgba(16,185,129,0.35)",
                color:C.green,borderRadius:"11px",padding:"9px 12px",fontWeight:900,
                fontSize:"12px",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>
              📂 ملفات
            </button>
            <button onClick={()=>{
                const r = printSeason(A, {...settings, __seasonName: meta.name}, images);
                if (!r.ok) alert(r.error); }}
              style={{background:C.gold,color:"#000",border:"none",borderRadius:"11px",
                padding:"9px 13px",fontWeight:900,fontSize:"12px",cursor:"pointer",
                fontFamily:"Cairo,sans-serif"}}>
              🖨️ طباعة
            </button>
          </div>
        </div>
        {!A.dateParsed && (
          <div style={{marginTop:"9px",background:"rgba(248,113,113,0.1)",
            border:"1px solid rgba(248,113,113,0.3)",borderRadius:"9px",
            padding:"8px",fontSize:"10px",color:"#fca5a5",lineHeight:1.7}}>
            ⚠️ أسماء الفترات ما فيها تواريخ — الترتيب حسب الرفع.
            سمّ الملفات بالتاريخ (مثل <b>2026-03-15</b>) أو <b>رمضان 1</b> لترتيب زمني مضبوط.
          </div>
        )}
      </div>

      {/* أرقام الموسم */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"6px"}}>
        <Stat label="مباع"   value={fmtN(A.grandQty)}    color={C.gold} />
        <Stat label="إيراد"  value={fmtM(A.grandRev)}    color={C.sky} />
        <Stat label="ربح"    value={fmtM(A.grandProfit)} color={C.green} />
        <Stat label="فروع"   value={fmtN(A.branches.length)} color={C.purple} />
      </div>

      {/* تنبيه الحالة — يظهر لو فيه نافد أو راكد */}
      {(A.totalLost > 0 || A.deadCount > 0) && (
        <div onClick={()=>setTab("status")}
          style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",cursor:"pointer"}}>
          {A.totalLost > 0 && (
            <div style={{background:"rgba(56,189,248,0.08)",border:"1px solid rgba(56,189,248,0.28)",
              borderRadius:"13px",padding:"11px"}}>
              <div style={{fontSize:"17px",fontWeight:900,color:C.sky}}>{fmtN(A.totalLost)}</div>
              <div style={{fontSize:"10px",color:"#94a3b8",marginTop:"2px",lineHeight:1.5}}>
                قطعة ضاعت بسبب النفاد
              </div>
              <div style={{fontSize:"9px",color:C.sky,marginTop:"3px"}}>
                {fmtN(A.soldOut.length)} منتج خلص بدري ←
              </div>
            </div>
          )}
          {A.deadCount > 0 && (
            <div style={{background:"rgba(248,113,113,0.08)",border:"1px solid rgba(248,113,113,0.28)",
              borderRadius:"13px",padding:"11px"}}>
              <div style={{fontSize:"17px",fontWeight:900,color:C.red}}>{fmtM(A.tiedValue)}</div>
              <div style={{fontSize:"10px",color:"#94a3b8",marginTop:"2px",lineHeight:1.5}}>
                فلوس واقفة في الرفوف
              </div>
              <div style={{fontSize:"9px",color:C.red,marginTop:"3px"}}>
                {fmtN(A.deadCount)} منتج ما تحرك ←
              </div>
            </div>
          )}
        </div>
      )}

      {/* التبويبات */}
      <div style={{display:"flex",gap:"5px",background:"rgba(255,255,255,0.04)",
        borderRadius:"13px",padding:"4px"}}>
        {TABS.map(([k,ic,lb])=>(
          <button key={k} onClick={()=>{ setTab(k); setPickCat(null); setPickPr(null); }}
            style={{flex:1,padding:"8px 3px",borderRadius:"10px",cursor:"pointer",
              fontFamily:"Cairo,sans-serif",fontSize:"11px",fontWeight:700,
              background: tab===k ? "rgba(212,168,83,0.16)" : "transparent",
              color:      tab===k ? C.gold : "rgba(255,255,255,0.4)",
              border:     tab===k ? "1px solid rgba(212,168,83,0.35)" : "1px solid transparent"}}>
            <div style={{fontSize:"15px"}}>{ic}</div>
            <div style={{marginTop:"2px"}}>{lb}</div>
          </button>
        ))}
      </div>

      {/* ══ عام ══ */}
      {tab === "overall" && (
        <div className="space-y-3">
          <div style={{display:"flex",gap:"5px"}}>
            {[["qty","📦 الأكثر كمية"],["profit","💰 الأعلى ربحًا"]].map(([k,l])=>(
              <button key={k} onClick={()=>setMetric(k)}
                style={{flex:1,padding:"8px",borderRadius:"10px",cursor:"pointer",
                  fontFamily:"Cairo,sans-serif",fontSize:"11px",fontWeight:700,
                  background: metric===k ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)",
                  color:      metric===k ? C.green : "#64748b",
                  border:     metric===k ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(255,255,255,0.07)"}}>
                {l}
              </button>
            ))}
          </div>

          <div>
            <div style={{fontSize:"13px",fontWeight:900,color:"#e2e8f0",marginBottom:"8px"}}>
              🏆 أفضل المنتجات
            </div>
            {(metric==="profit" ? A.topByProfit : A.topByQty).slice(0,25).map((r,i)=>(
              <ProdRow key={r.barcode} r={r} i={i} metric={metric} images={images}
                maxQty={(metric==="profit" ? A.topByProfit[0]?.profit : A.topByQty[0]?.qty) ?? 1} />
            ))}
          </div>

          <div>
            <div style={{fontSize:"13px",fontWeight:900,color:"#e2e8f0",marginBottom:"8px"}}>
              🏷️ أفضل الفئات — اضغط فئة تشوف زمنها
            </div>
            {(metric==="profit" ? A.topCatsProfit : A.topCats).map((c,i)=>{
              const val = metric==="profit" ? c.profit : c.qty;
              const max = (metric==="profit" ? A.topCatsProfit[0]?.profit : A.topCats[0]?.qty) ?? 1;
              return (
                <div key={c.cat} onClick={()=>{ setPickCat(c); setPickPr(null); setTab("time"); }}
                  style={{background:"rgba(167,139,250,0.06)",border:"1px solid rgba(167,139,250,0.18)",
                    borderRadius:"12px",padding:"11px",marginBottom:"6px",cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"9px"}}>
                    <div style={{width:"22px",fontSize:"12px",fontWeight:900,
                      color: i<3 ? C.purple : "#475569",textAlign:"center"}}>{i+1}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"12px",fontWeight:700,color:"#e2e8f0"}}>{c.catName}</div>
                      <div style={{fontSize:"9px",color:"#64748b",marginTop:"1px"}}>
                        {fmtN(c.items)} منتج · {fmtPct(A.grandQty>0?(c.qty/A.grandQty)*100:0)} من الموسم
                      </div>
                    </div>
                    <div style={{textAlign:"left"}}>
                      <div style={{fontSize:"15px",fontWeight:900,color:C.purple}}>
                        {metric==="profit" ? fmtM(val) : fmtN(val)}
                      </div>
                      <div style={{fontSize:"9px",color:"#475569"}}>📅 زمنها ←</div>
                    </div>
                  </div>
                  <div style={{marginTop:"7px"}}><Bar pct={(val/max)*100} color={C.purple}/></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ الفروع ══ */}
      {tab === "branches" && (
        <div className="space-y-2">
          {!branch ? (
            <>
              <div style={{fontSize:"11px",color:"#64748b",marginBottom:"4px"}}>
                مرتبة بالأقوى مبيعًا — اضغط فرع لتحليله
              </div>
              {A.branches.map((b,i)=>(
                <div key={b.branch} onClick={()=>setBranch(b.branch)}
                  style={{background:"rgba(255,255,255,0.035)",border:"1px solid rgba(255,255,255,0.07)",
                    borderRadius:"14px",padding:"13px",cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                    <div style={{width:"26px",height:"26px",borderRadius:"8px",
                      background: i===0 ? C.gold : "rgba(255,255,255,0.07)",
                      color:      i===0 ? "#000" : "#64748b",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:"12px",fontWeight:900,flexShrink:0}}>{i+1}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"14px",fontWeight:900,color:"#f1f5f9"}}>🏬 {b.branch}</div>
                      <div style={{fontSize:"10px",color:"#64748b",marginTop:"2px"}}>
                        أقوى منتج: {b.topByQty[0]?.name ?? "—"}
                      </div>
                    </div>
                    <div style={{textAlign:"left",flexShrink:0}}>
                      <div style={{fontSize:"17px",fontWeight:900,color:C.gold}}>{fmtN(b.qty)}</div>
                      <div style={{fontSize:"9px",color:"#475569"}}>{fmtPct(b.sharePct)} من الموسم</div>
                    </div>
                  </div>
                  <div style={{marginTop:"9px"}}><Bar pct={b.sharePct} h={7}/></div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"5px",marginTop:"9px"}}>
                    <Stat label="إيراد" value={fmtM(b.rev)} color={C.sky}/>
                    <Stat label="ربح" value={fmtM(b.profit)} color={C.green}/>
                    <Stat label="أقوى فترة" value={b.best?.label ?? "—"} color={C.gold}/>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <button onClick={()=>setBranch(null)}
                style={{background:"none",border:"none",color:C.sky,fontWeight:700,
                  fontSize:"12px",cursor:"pointer",fontFamily:"Cairo,sans-serif",padding:0}}>
                ← كل الفروع
              </button>
              <div style={{fontSize:"16px",fontWeight:900,color:"#fff"}}>🏬 {branch}</div>

              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"5px"}}>
                <Stat label="مباع" value={fmtN(bA.qty)} color={C.gold}/>
                <Stat label="نصيبه" value={fmtPct(bA.sharePct)} color={C.purple}/>
                <Stat label="إيراد" value={fmtM(bA.rev)} color={C.sky}/>
                <Stat label="ربح" value={fmtM(bA.profit)} color={C.green}/>
              </div>

              {/* زمن الفرع */}
              <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",
                borderRadius:"14px",padding:"13px"}}>
                <div style={{fontSize:"12px",fontWeight:900,color:"#e2e8f0",marginBottom:"9px"}}>
                  📅 متى انتعش ومتى هبط
                </div>
                <Timeline points={bA.timeline} avg={bA.avg} thr={thr}/>
                <div style={{marginTop:"11px",fontSize:"11px",lineHeight:2,color:"#94a3b8"}}>
                  <div>🟢 انتعش: <b style={{color:C.green}}>
                    {bA.peaks.map(p=>p.label).join("، ") || "—"}</b></div>
                  <div>🔴 هبط: <b style={{color:C.red}}>
                    {bA.dips.map(p=>p.label).join("، ") || "—"}</b></div>
                  <div>⭐ أقوى: <b style={{color:C.gold}}>
                    {bA.best?.label} ({fmtN(bA.best?.qty)})</b></div>
                </div>
              </div>

              <div style={{display:"flex",gap:"5px"}}>
                {[["qty","📦 كمية"],["profit","💰 ربح"]].map(([k,l])=>(
                  <button key={k} onClick={()=>setMetric(k)}
                    style={{flex:1,padding:"7px",borderRadius:"9px",cursor:"pointer",
                      fontFamily:"Cairo,sans-serif",fontSize:"11px",fontWeight:700,
                      background: metric===k ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)",
                      color:      metric===k ? C.green : "#64748b",
                      border:     metric===k ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(255,255,255,0.07)"}}>
                    {l}
                  </button>
                ))}
              </div>

              <div style={{fontSize:"12px",fontWeight:900,color:"#e2e8f0"}}>
                🏆 أقوى منتجات {branch}
              </div>
              {(metric==="profit" ? bA.topByProfit : bA.topByQty).map((r,i)=>(
                <ProdRow key={r.barcode} r={r} i={i} metric={metric} images={images}
                  maxQty={(metric==="profit" ? bA.topByProfit[0]?.profit : bA.topByQty[0]?.qty) ?? 1}
                  extra={
                    <button onClick={()=>{ setPickPr(r); setPickCat(null); setTab("time"); }}
                      style={{marginTop:"7px",width:"100%",background:"rgba(56,189,248,0.1)",
                        border:"1px solid rgba(56,189,248,0.25)",borderRadius:"8px",
                        padding:"5px",color:C.sky,fontSize:"10px",fontWeight:700,
                        cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>
                      📅 متى انتعش هذا المنتج؟
                    </button>
                  }/>
              ))}

              <div style={{fontSize:"12px",fontWeight:900,color:"#e2e8f0",marginTop:"12px"}}>
                🏷️ أفضل فئات {branch}
              </div>
              {bA.topCats.map((c,i)=>(
                <div key={c.cat} onClick={()=>{ setPickCat(c); setPickPr(null); setTab("time"); }}
                  style={{background:"rgba(167,139,250,0.06)",border:"1px solid rgba(167,139,250,0.18)",
                    borderRadius:"11px",padding:"10px",marginBottom:"5px",cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                    <div style={{width:"20px",fontSize:"11px",fontWeight:900,
                      color:C.purple,textAlign:"center"}}>{i+1}</div>
                    <div style={{flex:1,minWidth:0,fontSize:"12px",fontWeight:700,color:"#e2e8f0"}}>
                      {c.catName}
                    </div>
                    <div style={{textAlign:"left"}}>
                      <div style={{fontSize:"14px",fontWeight:900,color:C.purple}}>{fmtN(c.qty)}</div>
                      <div style={{fontSize:"9px",color:"#475569"}}>
                        {fmtPct(bA.qty>0?(c.qty/bA.qty)*100:0)} من الفرع
                      </div>
                    </div>
                  </div>
                  <div style={{marginTop:"6px"}}>
                    <Bar pct={(c.qty/(bA.topCats[0]?.qty||1))*100} color={C.purple}/>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ══ الزمن ══ */}
      {tab === "time" && (
        <div className="space-y-3">
          {(pickPr || pickCat) && (
            <div style={{background:"rgba(56,189,248,0.07)",border:"1px solid rgba(56,189,248,0.25)",
              borderRadius:"14px",padding:"13px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"9px"}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:"13px",fontWeight:900,color:"#fff"}}>
                    {pickPr ? `📦 ${pickPr.name}` : `🏷️ ${pickCat.catName}`}
                  </div>
                  <div style={{fontSize:"10px",color:"#64748b",marginTop:"2px"}}>
                    {branch ? `في ${branch}` : "كل الفروع"} ·
                    {pickPr ? ` ${pickPr.barcode}` : ` ${fmtN(pickCat.items)} منتج`}
                  </div>
                </div>
                <button onClick={()=>{ setPickPr(null); setPickCat(null); }}
                  style={{background:"rgba(255,255,255,0.07)",border:"none",borderRadius:"8px",
                    padding:"5px 10px",color:"#94a3b8",fontSize:"11px",fontWeight:700,
                    cursor:"pointer",fontFamily:"Cairo,sans-serif",flexShrink:0}}>✕</button>
              </div>
              {pickTL && (()=>{
                const avg  = pickTL.reduce((s,p)=>s+p.qty,0) / (pickTL.length||1);
                const up   = pickTL.filter(p=>p.vsAvgPct>=  thr);
                const down = pickTL.filter(p=>p.vsAvgPct<= -thr);
                const best = pickTL.reduce((m,p)=>p.qty>m.qty?p:m, pickTL[0]);
                return (
                  <>
                    <div style={{marginTop:"11px"}}><Timeline points={pickTL} avg={avg} thr={thr}/></div>
                    <div style={{marginTop:"11px",fontSize:"11px",lineHeight:2,color:"#94a3b8"}}>
                      <div>🟢 انتعش: <b style={{color:C.green}}>
                        {up.map(p=>p.label).join("، ") || "—"}</b></div>
                      <div>🔴 هبط: <b style={{color:C.red}}>
                        {down.map(p=>p.label).join("، ") || "—"}</b></div>
                      <div>⭐ أقوى فترة: <b style={{color:C.gold}}>
                        {best?.label} ({fmtN(best?.qty)})</b></div>
                      <div>📊 المتوسط: <b>{fmtN(Math.round(avg))}</b> لكل فترة</div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* حساسية التصنيف */}
          <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",
            borderRadius:"13px",padding:"12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              marginBottom:"8px"}}>
              <span style={{fontSize:"11px",fontWeight:700,color:"#94a3b8"}}>
                حساسية الانتعاش / الهبوط
              </span>
              <span style={{fontSize:"13px",fontWeight:900,color:C.gold}}>±{thr}%</span>
            </div>
            <input type="range" min={10} max={80} step={5} value={thr}
              onChange={e=>setThr(+e.target.value)}
              style={{width:"100%",accentColor:C.gold}}/>
            <div style={{fontSize:"9px",color:"#64748b",marginTop:"5px",lineHeight:1.7}}>
              الفترة تُحسب انتعاشًا لو فوق المتوسط بهذي النسبة، وهبوطًا لو تحته بها.
              ارفعها لو الأيام الموسومة كثيرة.
            </div>
          </div>

          <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",
            borderRadius:"14px",padding:"13px"}}>
            <div style={{fontSize:"13px",fontWeight:900,color:"#e2e8f0",marginBottom:"3px"}}>
              📅 مبيعات الموسم — كل الفروع
            </div>
            <div style={{fontSize:"10px",color:"#64748b",marginBottom:"11px"}}>
              متوسط {fmtN(Math.round(A.avg))} قطعة · إجمالي {fmtN(A.total)}
            </div>
            <Timeline points={A.timeline} avg={A.avg} thr={thr}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"7px"}}>
            <div style={{background:"rgba(16,185,129,0.07)",border:"1px solid rgba(16,185,129,0.25)",
              borderRadius:"13px",padding:"12px"}}>
              <div style={{fontSize:"11px",fontWeight:900,color:C.green,marginBottom:"7px"}}>
                🟢 انتعشت ({A.peaks.length})
              </div>
              {A.peaks.length ? A.peaks.slice(0,8).map((p,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",
                  fontSize:"11px",padding:"3px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                  <span style={{color:"#cbd5e1"}}>{p.label}</span>
                  <span style={{color:C.green,fontWeight:900}}>{fmtN(p.qty)}</span>
                </div>
              )) : <div style={{fontSize:"10px",color:"#475569"}}>ما فيه ذرى واضحة</div>}
            </div>
            <div style={{background:"rgba(248,113,113,0.07)",border:"1px solid rgba(248,113,113,0.25)",
              borderRadius:"13px",padding:"12px"}}>
              <div style={{fontSize:"11px",fontWeight:900,color:C.red,marginBottom:"7px"}}>
                🔴 هبطت ({A.dips.length})
              </div>
              {A.dips.length ? A.dips.slice(0,8).map((p,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",
                  fontSize:"11px",padding:"3px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                  <span style={{color:"#cbd5e1"}}>{p.label}</span>
                  <span style={{color:C.red,fontWeight:900}}>{fmtN(p.qty)}</span>
                </div>
              )) : <div style={{fontSize:"10px",color:"#475569"}}>ما فيه هبوط واضح</div>}
            </div>
          </div>

          {/* كل الفترات */}
          <div>
            <div style={{fontSize:"12px",fontWeight:900,color:"#e2e8f0",marginBottom:"8px"}}>
              كل الفترات بالتفصيل
            </div>
            {A.timeline.map((t,i)=>{
              const col = t.vsAvgPct>=thr ? C.green : t.vsAvgPct<=-thr ? C.red : C.slate;
              return (
                <div key={i} style={{background:"rgba(255,255,255,0.03)",
                  border:`1px solid ${col}25`,borderRadius:"11px",padding:"10px",marginBottom:"5px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"9px"}}>
                    <div style={{width:"20px",fontSize:"10px",color:"#475569",
                      textAlign:"center",fontWeight:700}}>{i+1}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"12px",fontWeight:700,color:"#e2e8f0"}}>{t.label}</div>
                      <div style={{fontSize:"9px",color:"#64748b",marginTop:"1px"}}>
                        {fmtM(t.rev)} إيراد
                        {t.change!==null && ` · ${t.change>0?"▲":"▼"} ${fmtPct(Math.abs(t.change))} عن قبلها`}
                      </div>
                    </div>
                    <div style={{textAlign:"left",flexShrink:0}}>
                      <div style={{fontSize:"15px",fontWeight:900,color:col}}>{fmtN(t.qty)}</div>
                      <div style={{fontSize:"9px",color:col,direction:"ltr",
                        unicodeBidi:"isolate"}}>
                        {t.vsAvgPct>0?"+":""}{fmtPct(t.vsAvgPct)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

          {/* نفد مبكرًا */}
          <StatusGroup
            title="🔵 نفد قبل نهاية المدة"
            hint="خلصت بضاعته وباقي وقت — الطلب أعلى مما بعناه"
            color={C.sky} items={A.soldOut} images={images}
            right={r => (
              <>
                <div style={{fontSize:"15px",fontWeight:900,color:C.sky}}>
                  +{fmtN(r.lc.lost)}
                </div>
                <div style={{fontSize:"9px",color:"#475569"}}>ضاع تقديريًا</div>
              </>
            )}
          />

          {/* توقف */}
          <StatusGroup
            title="🟠 وقف بيعه في النص"
            hint="آخر بيعة له بدري وبعدها صفر — راجع إذا نفد من الفرع"
            color="#fb923c" items={A.stalled} images={images}
            right={r => (
              <>
                <div style={{fontSize:"15px",fontWeight:900,color:"#fb923c"}}>
                  {fmtN(r.lc.trailingZeros)}
                </div>
                <div style={{fontSize:"9px",color:"#475569"}}>فترة صفر</div>
              </>
            )}
          />

          {/* ضعف طلبه */}
          <StatusGroup
            title="🔴 ضعف طلبه فعلًا"
            hint="عنده بضاعة وما انباعت — هذا اللي نقلله"
            color={C.red} items={A.declined} images={images}
            right={r => (
              <>
                <div style={{fontSize:"15px",fontWeight:900,color:C.red}}>
                  {fmtN(r.lc.left)}
                </div>
                <div style={{fontSize:"9px",color:"#475569"}}>باقية عنده</div>
              </>
            )}
          />

          {/* الراكد */}
          <div>
            <div style={{fontSize:"13px",fontWeight:900,color:"#e2e8f0",marginBottom:"3px"}}>
              ⚫ ما تحرك أو حركته ضعيفة ({fmtN(A.stagnant.length)})
            </div>
            <div style={{fontSize:"10px",color:"#64748b",marginBottom:"9px"}}>
              مرتبة بالأسوأ — اللي ما باع ولا قطعة أول، ثم الأعلى فلوسًا واقفة
            </div>
            {A.stagnant.length === 0 ? (
              <div style={{textAlign:"center",padding:"26px",color:"#475569",fontSize:"11px"}}>
                ما فيه منتج راكد 👌
              </div>
            ) : A.stagnant.slice(0,60).map(r=>(
              <div key={r.barcode} style={{background: r.dead ? "rgba(71,85,105,0.14)" : "rgba(245,158,11,0.06)",
                border:`1px solid ${r.dead ? "rgba(100,116,139,0.3)" : "rgba(245,158,11,0.22)"}`,
                borderRadius:"12px",padding:"10px",marginBottom:"6px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"9px"}}>
                  {images?.[r.barcode]
                    ? <img src={images[r.barcode]} alt="" style={{width:"50px",height:"50px",
                        borderRadius:"9px",objectFit:"cover",flexShrink:0,
                        filter: r.dead ? "grayscale(0.7)" : "none"}}/>
                    : <div style={{width:"50px",height:"50px",borderRadius:"9px",
                        background:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",
                        justifyContent:"center",fontSize:"20px",flexShrink:0}}>📦</div>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"12px",fontWeight:700,color:"#e2e8f0",
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                    <div style={{fontSize:"9px",color:"#94a3b8",marginTop:"2px",
                      fontFamily:"monospace",direction:"ltr",textAlign:"right"}}>{r.barcode}</div>
                    <div style={{fontSize:"9px",color:"#64748b",marginTop:"2px",lineHeight:1.6}}>
                      🏭 {r.fac}{r.facName ? ` · ${r.facName}` : ""}
                    </div>
                    <div style={{fontSize:"9px",color:"#64748b",lineHeight:1.6}}>
                      📦 {r.cont || "—"} · وارد {fmtN(r.bought)} · باع {fmtN(r.sold)}
                    </div>
                    <span style={{display:"inline-block",marginTop:"4px",
                      background: r.dead ? "rgba(100,116,139,0.22)" : "rgba(245,158,11,0.16)",
                      border:`1px solid ${r.dead ? "rgba(148,163,184,0.35)" : "rgba(245,158,11,0.35)"}`,
                      borderRadius:"100px",padding:"1px 9px",fontSize:"9px",fontWeight:900,
                      color: r.dead ? "#cbd5e1" : "#fbbf24"}}>{r.status}</span>
                  </div>
                  <div style={{textAlign:"left",flexShrink:0}}>
                    <div style={{fontSize:"15px",fontWeight:900,color: r.dead ? "#94a3b8" : "#fbbf24"}}>
                      {fmtM(r.tiedValue)}
                    </div>
                    <div style={{fontSize:"9px",color:"#475569"}}>واقفة</div>
                    <div style={{fontSize:"9px",color:"#475569",marginTop:"2px"}}>
                      {fmtN(r.left)} قطعة
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {A.stagnant.length > 60 && (
              <div style={{textAlign:"center",fontSize:"10px",color:"#475569",padding:"7px"}}>
                … و{fmtN(A.stagnant.length - 60)} منتج آخر — كلهم في الطباعة
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ القرار ══ */}
      {tab === "decide" && (
        <div className="space-y-2">
          <div style={{background:"rgba(212,168,83,0.07)",border:"1px solid rgba(212,168,83,0.22)",
            borderRadius:"13px",padding:"12px",fontSize:"11px",color:"#94a3b8",lineHeight:1.9}}>
            الأساس = اللي باعه الفرع فعلًا هذا الموسم، مضروب في معامل حسب قوة المنتج،
            ومقرّب لدزينة كاملة.
            <div style={{marginTop:"7px",display:"flex",flexWrap:"wrap",gap:"5px"}}>
              {[["قوي","×1.35",C.green],["متعطش","×1.6",C.sky],
                ["جيد","×1",C.gold],["ضعيف","×0.5",C.red]].map(([t,m,c])=>(
                <span key={t} style={{background:`${c}18`,border:`1px solid ${c}35`,
                  borderRadius:"100px",padding:"2px 9px",fontSize:"10px",
                  fontWeight:700,color:c}}>{t} {m}</span>
              ))}
            </div>
            <div style={{marginTop:"7px",fontSize:"10px",color:"#64748b"}}>
              <b style={{color:C.sky}}>متعطش</b> = صفّى اللي عنده بس كميته كانت صغيرة — غالبًا نقص بضاعة.
            </div>
          </div>

          {!branch ? (
            <>
              <div style={{fontSize:"11px",color:"#64748b"}}>اضغط فرع تشوف قراره</div>
              {A.recs.map(r=>(
                <div key={r.branch} onClick={()=>setBranch(r.branch)}
                  style={{background:"rgba(255,255,255,0.035)",border:"1px solid rgba(255,255,255,0.07)",
                    borderRadius:"14px",padding:"13px",cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"9px"}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:"14px",fontWeight:900,color:"#f1f5f9"}}>🏬 {r.branch}</div>
                      <div style={{fontSize:"10px",color:"#64748b",marginTop:"2px"}}>
                        {fmtPct(r.sharePct)} من الموسم · {fmtN(r.bring.length)} منتج نجيبه
                        {r.stop.length ? ` · ${fmtN(r.stop.length)} نوقفه` : ""}
                      </div>
                    </div>
                    <div style={{textAlign:"left",flexShrink:0}}>
                      <div style={{fontSize:"18px",fontWeight:900,color:C.green}}>
                        {fmtN(r.totalSuggest)}
                      </div>
                      <div style={{fontSize:"9px",color:"#475569"}}>
                        باع {fmtN(r.totalLastQty)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <button onClick={()=>setBranch(null)}
                style={{background:"none",border:"none",color:C.sky,fontWeight:700,
                  fontSize:"12px",cursor:"pointer",fontFamily:"Cairo,sans-serif",padding:0}}>
                ← كل الفروع
              </button>
              <div style={{fontSize:"16px",fontWeight:900,color:"#fff"}}>📦 قرار {branch}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"5px"}}>
                <Stat label="باع الموسم" value={fmtN(rc.totalLastQty)} color={C.gold}/>
                <Stat label="المقترح" value={fmtN(rc.totalSuggest)} color={C.green}/>
                <Stat label="نصيب الفرع" value={fmtPct(rc.sharePct)} color={C.purple}/>
              </div>

              <div style={{fontSize:"12px",fontWeight:900,color:C.green,marginTop:"9px"}}>
                ✅ نجيب ({fmtN(rc.bring.length)})
              </div>
              {rc.bring.map((r,i)=>(
                <div key={r.barcode} style={{background:"rgba(255,255,255,0.03)",
                  border:`1px solid ${r.color}28`,borderRadius:"12px",padding:"10px",marginBottom:"6px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"9px"}}>
                    <div style={{width:"20px",fontSize:"11px",color:"#475569",
                      textAlign:"center",fontWeight:700}}>{i+1}</div>
                    {images?.[r.barcode]
                      ? <img src={images[r.barcode]} alt="" style={{width:"54px",height:"54px",
                          borderRadius:"9px",objectFit:"cover",flexShrink:0}}/>
                      : <div style={{width:"54px",height:"54px",borderRadius:"9px",
                          background:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",
                          justifyContent:"center",fontSize:"22px",flexShrink:0}}>📦</div>}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"12px",fontWeight:700,color:"#e2e8f0",
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                      <div style={{fontSize:"9px",color:"#94a3b8",marginTop:"2px",
                        fontFamily:"monospace",direction:"ltr",textAlign:"right"}}>{r.barcode}</div>
                      <div style={{fontSize:"9px",color:"#64748b",marginTop:"2px",lineHeight:1.6}}>
                        🏭 {r.fac}{r.facName ? ` · ${r.facName}` : ""}
                      </div>
                      <div style={{fontSize:"9px",color:"#64748b",lineHeight:1.6}}>
                        📦 {r.cont || "—"} · باع {fmtN(r.qty)} · دوران {fmtPct(r.turnPct)}
                      </div>
                      <span style={{display:"inline-block",marginTop:"4px",
                        background:`${r.color}18`,border:`1px solid ${r.color}35`,
                        borderRadius:"100px",padding:"1px 8px",fontSize:"9px",
                        fontWeight:900,color:r.color}}>{r.tier} ×{r.grow}</span>
                    </div>
                    <div style={{textAlign:"left",flexShrink:0}}>
                      <div style={{fontSize:"19px",fontWeight:900,color:C.green}}>
                        {fmtN(r.suggest)}
                      </div>
                      <div style={{fontSize:"9px",color: r.delta>=0 ? C.green : C.red,
                        direction:"ltr",unicodeBidi:"isolate"}}>
                        {r.delta>0?"+":""}{fmtN(r.delta)}
                      </div>
                      <div style={{fontSize:"8px",color:"#475569"}}>
                        {Math.round(r.suggest/12)} دزينة
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {rc.stop.length > 0 && (
                <>
                  <div style={{fontSize:"12px",fontWeight:900,color:C.red,marginTop:"13px"}}>
                    ⚠️ ضعيف — نقلل أو نوقف ({fmtN(rc.stop.length)})
                  </div>
                  {rc.stop.map((r,i)=>(
                    <div key={r.barcode} style={{background:"rgba(248,113,113,0.05)",
                      border:"1px solid rgba(248,113,113,0.2)",borderRadius:"11px",
                      padding:"9px",marginBottom:"5px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                        <div style={{width:"18px",fontSize:"10px",color:"#475569",
                          textAlign:"center"}}>{i+1}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:"11px",fontWeight:700,color:"#cbd5e1",
                            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                          <div style={{fontSize:"9px",color:"#64748b"}}>
                            باع {fmtN(r.qty)} فقط · دوران {fmtPct(r.turnPct)}
                          </div>
                        </div>
                        <div style={{fontSize:"13px",fontWeight:900,color:C.red,flexShrink:0}}>
                          {fmtN(r.suggest)}
                        </div>
                      </div>
                    </div>
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
