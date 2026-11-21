// ============================================================
// TimingTab.jsx — قوة الأيام والشهور + خطة الموسم القادم
// يُركَّب داخل تقرير الموسم. يقرأ الخط الزمني ويربطه بالتقويمين.
// ============================================================

import { useMemo, useState } from "react";
import { parsePeriodDate } from "../lib/season.js";
import {
  timeStrength, seasonCurve, nextSeasonPlan, seasonDates,
  toHijri, hijriLabel, ymd, HIJRI_MONTHS,
} from "../lib/hijri.js";

const C = { gold:"#d4a853", green:"#8aab8e", red:"#e8855a", purple:"#a89fc4",
            txt:"#e8edf4", dim:"#6b788c", line:"rgba(255,255,255,.08)" };
const fmtN = n => Number(n||0).toLocaleString("en-US",{maximumFractionDigits:0});
const AR_D = d => { const [y,m,dd]=String(d).split("-"); return `${dd}/${m}/${y}`; };

/** يحوّل رقم ترتيب parsePeriodDate (YYYYMMDD) إلى تاريخ حقيقي. */
function ordToDate(ord) {
  if (typeof ord !== "number" || ord < 20000101) return null;   // رمضان ١٢ ونحوه
  const y = Math.floor(ord / 10000), m = Math.floor(ord / 100) % 100, d = ord % 100;
  if (y < 2015 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const x = new Date(y, m - 1, d);
  return isNaN(x) || x.getDate() !== d ? null : x;
}

function Card({ title, note, children }) {
  return (
    <div style={{background:"rgba(255,255,255,.03)",border:`1px solid ${C.line}`,
      borderRadius:14,padding:"13px 12px"}}>
      <div style={{fontSize:15,fontWeight:800,color:C.txt,marginBottom:note?2:9}}>{title}</div>
      {note && <div style={{fontSize:11.5,color:C.dim,marginBottom:9,lineHeight:1.5}}>{note}</div>}
      {children}
    </div>
  );
}

/** صف مؤشّر: ١.٠× هو المتوسط */
function IndexRow({ label, index, sub, max = 3 }) {
  const pct = Math.min(100, (index / max) * 100);
  const col = index >= 2 ? C.gold : index >= 1.15 ? C.green : index >= .85 ? C.dim : C.red;
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0"}}>
      <div style={{width:92,fontSize:12.5,color:C.txt,flexShrink:0}}>{label}</div>
      <div style={{flex:1,height:7,background:"rgba(255,255,255,.06)",borderRadius:4,overflow:"hidden"}}>
        <div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:4}} />
      </div>
      <div style={{width:48,textAlign:"left",fontSize:12.5,fontWeight:800,color:col,
        direction:"ltr",flexShrink:0}}>{index.toFixed(index>=10?0:2)}×</div>
      {sub && <div style={{width:62,textAlign:"left",fontSize:10.5,color:C.dim,
        direction:"ltr",flexShrink:0}}>{sub}</div>}
    </div>
  );
}

export default function TimingTab({ periods = [], metric = "qty" }) {
  const [hy, setHy] = useState(null);

  const data = useMemo(() => {
    const series = [];
    for (const p of periods) {
      // parsePeriodDate يرجع رقمًا للترتيب بصيغة YYYYMMDD — لا كائن تاريخ.
      // القيم الصغيرة (رمضان ١٢) وسنة 2000 الافتراضية لا تحمل تاريخًا حقيقيًا.
      const ord = parsePeriodDate(p.label ?? "");
      const d = ordToDate(ord);
      if (!d) continue;
      let v = 0;
      for (const bd of Object.values(p.sales ?? {}))
        for (const x of Object.values(bd ?? {}))
          v += Number(metric === "rev" ? (x?.totalPrice ?? 0) : (x?.qty ?? 0)) || 0;
      series.push({ date: d, value: v });
    }
    if (series.length < 14) return { series, short: true };
    return { series, short: false, st: timeStrength(series) };
  }, [periods, metric]);

  const plan = useMemo(() => {
    const now = toHijri(new Date());
    const base = hy ?? (now ? (now.m >= 9 ? now.y + 1 : now.y) : 1448);
    return { base, plan: nextSeasonPlan(base), dates: seasonDates(base) };
  }, [hy]);

  // منحنى رمضان من البيانات نفسها
  const curve = useMemo(() => {
    if (!data.st) return null;
    const years = new Set();
    for (const p of data.series) { const h = toHijri(p.date); if (h) years.add(h.y); }
    for (const y of [...years].sort()) {
      const s = seasonDates(y);
      if (!s.ramadanStart || !s.eidFitr) continue;
      const inside = data.series.filter(p => p.date >= s.ramadanStart && p.date < s.eidFitr);
      if (inside.length >= 15) return { hy: y, eid: s.eidFitr, rows: seasonCurve(inside, s.eidFitr) };
    }
    return null;
  }, [data]);

  if (data.short) {
    return (
      <Card title="قوة الأيام والشهور"
        note="يحتاج ١٤ فترة يومية على الأقل بتواريخ مقروءة. ارفع أرشيف المبيعات بالأيام من تبويب المبيعات.">
        <div style={{fontSize:12.5,color:C.dim}}>
          الفترات المقروءة الآن: {data.series.length}
        </div>
      </Card>
    );
  }

  const st = data.st;
  const P  = plan.plan;
  const unit = metric === "rev" ? "ريال" : "قطعة";

  // نقاط القطع في المنحنى
  const cuts = [];
  if (curve) {
    for (const t of [0.25, 0.50, 0.75, 0.90]) {
      const r = curve.rows.find(x => x.cum >= t);
      if (r) cuts.push({ t, r });
    }
  }

  return (
    <div className="space-y-3">

      {/* ══ خطة الموسم القادم ══ */}
      {P && (
        <Card title={`خطة رمضان ${plan.base}`}
          note="محسوبة من تقويم أم القرى — تتحرك مع التقويم كل سنة بلا تدخّل.">
          <div style={{display:"flex",gap:6,marginBottom:10}}>
            {[plan.base - 1, plan.base, plan.base + 1].map(y => (
              <button key={y} onClick={() => setHy(y)}
                style={{flex:1,padding:"6px 2px",borderRadius:8,border:"none",cursor:"pointer",
                  fontFamily:"Cairo,sans-serif",fontSize:12,fontWeight:700,
                  background: y === plan.base ? "#e8edf4" : "rgba(255,255,255,.05)",
                  color: y === plan.base ? "#0b0f16" : C.dim}}>{y} هـ</button>
            ))}
          </div>
          {[
            ["البضاعة في المستودع", P.warehouseBy,  C.dim,    null],
            ["كل شيء على الرف",     P.shelfDeadline, C.red,   "آخر موعد — بعده تفوّت الموسم"],
            ["بداية رمضان",         P.ramadanStart,  C.dim,    null],
            ["انطلاق الذروة",       P.peakFrom,      C.gold,  `${P.peakDays} يومًا حتى العيد`],
            ["أوقف الشراء",         P.stopBuying,    C.dim,    "لن يصل في وقته"],
            ["عيد الفطر",           P.eidFitr,       C.dim,    null],
            ["ابدأ التصريف",        P.clearFrom,     C.green, "لا تحمل بضاعة الموسم"],
            ["عيد الأضحى",          P.eidAdha,       C.purple, null],
          ].filter(r => r[1]).map(([lab, d, col, hint]) => (
            <div key={lab} style={{display:"flex",alignItems:"baseline",gap:8,
              padding:"6px 0",borderBottom:`1px solid ${C.line}`}}>
              <div style={{width:118,fontSize:12.5,fontWeight:700,color:col,flexShrink:0}}>{lab}</div>
              <div style={{fontSize:12.5,color:C.txt,direction:"ltr",width:88,flexShrink:0}}>{AR_D(ymd(d))}</div>
              <div style={{fontSize:11,color:C.dim,flex:1}}>{hijriLabel(d)}{hint ? ` · ${hint}` : ""}</div>
            </div>
          ))}
        </Card>
      )}

      {/* ══ الشهور الهجرية ══ */}
      <Card title="قوة الشهور — بالتقويم الهجري"
        note={`المؤشّر نسبة إلى اليوم العادي خارج المواسم (${fmtN(st.avgDay)} ${unit}/يوم).`}>
        {st.hijriMonths.map(m => (
          <IndexRow key={m.key} label={`${m.name} ${m.y}`} index={m.index}
            sub={`${m.days}ي`} max={Math.max(3, ...st.hijriMonths.map(x => x.index))} />
        ))}
      </Card>

      {/* ══ أيام الأسبوع ══ */}
      <Card title="قوة أيام الأسبوع" note="خارج المواسم حتى لا يشوّهها رمضان.">
        {st.weekdays.filter(w => w.n).map(w => (
          <IndexRow key={w.name} label={w.name} index={w.index} sub={`${w.n}ي`} max={1.6} />
        ))}
      </Card>

      {/* ══ دورة الراتب ══ */}
      <Card title="دورة الراتب — يوم الشهر الميلادي"
        note="معدَّلة على يوم الأسبوع، خارج المواسم. الراتب ينزل ٢٦–٢٧ والصرف يمتد بعده.">
        <div style={{display:"flex",alignItems:"flex-end",gap:1.5,height:92,
          padding:"0 2px",marginBottom:6}}>
          {st.monthDays.map(d => {
            const h = Math.max(3, Math.min(100, d.index * 55));
            const pay = d.day >= 26 || d.day <= 4;
            return (
              <div key={d.day} title={`${d.day}: ${(d.index*100).toFixed(0)}%`}
                style={{flex:1,height:`${h}%`,borderRadius:"2px 2px 0 0",
                  background: pay ? C.gold : "rgba(255,255,255,.18)"}} />
            );
          })}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.dim}}>
          <span>١</span><span>١٠</span><span>٢٠</span><span>٣١</span>
        </div>
        {(() => {
          const seg = (a,b) => {
            const g = st.monthDays.filter(d => a <= d.day && d.day <= b);
            return g.length ? g.reduce((s,d)=>s+d.index,0)/g.length : 0;
          };
          const peak = (seg(26,31) + seg(1,4)) / 2, trough = seg(13,20);
          return (
            <div style={{marginTop:9,fontSize:12.5,color:C.txt,lineHeight:1.7}}>
              نافذة الراتب (٢٦ → ٤): <b style={{color:C.gold}}>{(peak*100).toFixed(0)}%</b>
              {"  ·  "}قاع منتصف الشهر (١٣–٢٠): <b style={{color:C.red}}>{(trough*100).toFixed(0)}%</b>
              {trough > 0 && <div style={{fontSize:11.5,color:C.dim,marginTop:3}}>
                الفرق {(peak/trough).toFixed(1)}× — وزّع البضاعة الجديدة والعروض على نافذة الراتب.
              </div>}
            </div>
          );
        })()}
      </Card>

      {/* ══ نوافذ المواسم ══ */}
      {st.windows.length > 0 && (
        <Card title="قوة كل موسم" note="هجري متحرّك وميلادي ثابت — كما هي مواسم السعودية.">
          {st.windows.slice(0, 12).map(w => (
            <IndexRow key={w.key} label={w.label} index={w.index}
              sub={`${w.days}ي`} max={Math.max(3, st.windows[0].index)} />
          ))}
        </Card>
      )}

      {/* ══ منحنى رمضان ══ */}
      {curve && cuts.length > 0 && (
        <Card title={`منحنى رمضان ${curve.hy} — مقياس الأيام قبل العيد`}
          note="اعتمده للتخطيط: ينطبق على أي سنة لأنه لا يعتمد على التاريخ الميلادي.">
          {cuts.map(({ t, r }) => (
            <div key={t} style={{display:"flex",alignItems:"center",gap:8,
              padding:"6px 0",borderBottom:`1px solid ${C.line}`}}>
              <div style={{width:46,fontSize:14,fontWeight:900,color:C.gold}}>{t*100}%</div>
              <div style={{flex:1,fontSize:12.5,color:C.txt}}>
                يتحقق بحلول <b>{r.hijriDay} {r.hijriName}</b>
              </div>
              <div style={{fontSize:11.5,color:C.dim,direction:"ltr"}}>
                {r.before} يوم قبل العيد
              </div>
            </div>
          ))}
          <div style={{marginTop:9,fontSize:11.5,color:C.dim,lineHeight:1.6}}>
            نصف الموسم يتحقق في أيامه الأخيرة — فالبضاعة التي تصل متأخرة تفوّت أغلبه.
          </div>
        </Card>
      )}
    </div>
  );
}
