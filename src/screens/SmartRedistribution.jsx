// ─── إعادة التوزيع الذكية بالمصنع (نقل بين الفروع) ───────────────
// يكتشف الراكد والسريع لكل مصنع عبر الفترات، يقترح نقل، وأنت تعدّل.
import { useState, useMemo } from "react";
import { getFactoryCode, num, allBranches, totalPurchases } from "../lib/calc.js";

const toDozen = (n, u) => Math.ceil(n / (u||12)) * (u||12);

// محرّك التحليل: لكل مصنع، من راكد ومن سريع
function analyze(products, periods, settings) {
  const closed = settings?.closedBranches ?? [];
  const fresh = settings?.newBranches ?? [];   // الفروع الجديدة — لا تُحسب راكدة
  const branchSet = new Set();
  periods.forEach(per => Object.keys(per.sales ?? {}).forEach(b => { if(!closed.includes(b)) branchSet.add(b); }));
  const nP = periods.length || 1;

  // مبيعات كل (فرع, منتج) عبر الفترات
  const factories = {};
  products.forEach(p => {
    const fc = getFactoryCode(p.barcode);
    if (!factories[fc]) factories[fc] = { code: fc, name: settings?.factories?.[fc] ?? "", brSold: {}, prods: {} };
    branchSet.forEach(b => {
      let sold = 0;
      periods.forEach(per => { sold += num(per.sales?.[b]?.[p.barcode]?.qty ?? 0); });
      if (sold <= 0) return;
      factories[fc].brSold[b] = (factories[fc].brSold[b] ?? 0) + sold;
      if (!factories[fc].prods[b]) factories[fc].prods[b] = [];
      factories[fc].prods[b].push({ barcode: p.barcode, name: p.name, sold, p });
    });
  });

  const out = [];
  Object.values(factories).forEach(fac => {
    const brs = Object.entries(fac.brSold).map(([branch,sold])=>({ branch, sold }));
    if (brs.length < 2) return;
    const totalSold = brs.reduce((s,b)=>s+b.sold,0);
    const avg = totalSold / brs.length;
    brs.forEach(b => { b.vsAvg = avg>0?(b.sold/avg)*100:0; });
    const stale = brs.filter(b=>b.sold < avg*0.5 && !fresh.includes(b.branch)).sort((a,b)=>a.vsAvg-b.vsAvg);
    const hot   = brs.filter(b=>b.sold > avg).sort((a,b)=>b.vsAvg-a.vsAvg);
    if (stale.length===0 || hot.length===0) return;
    // كونتينر المصنع (أول منتج له كونتينر)
    let container = "";
    products.forEach(p => { if(getFactoryCode(p.barcode)===fac.code && p.container && !container) container = p.container; });
    out.push({ ...fac, container: container || "بدون كونتينر", totalSold, avg, stale, hot, brCount: brs.length });
  });
  return out.sort((a,b)=>b.stale.length-a.stale.length);
}

// مدينة الفرع (مع تخصيص يدوي)
function cityOf(branch, overrides = {}) {
  if (overrides[branch]) return overrides[branch];
  const parts = String(branch).split("-").map(p=>p.trim());
  if (parts.length >= 3) return parts[parts.length - 2];
  return "";
}

// 🎯 عبّي فرع: لكل منتج ناقص عند الفرع، من وين نجيبه (فرع فائض نفس المدينة أولوية، ثم أي فائض، ثم المستودع)
function fillBranch(targetBranch, products, periods, settings, needRem, surplusRem, priority = "warehouse") {
  const cityOverrides = settings?.cityOverrides ?? {};
  const newBranches = settings?.newBranches ?? [];
  const closed = settings?.closedBranches ?? [];
  const overrides = settings?.stockOverrides ?? {};
  const tCity = cityOf(targetBranch, cityOverrides);

  // مبيعات كل فرع لكل منتج (عبر الفترات)
  const salesByProd = {}; // barcode -> {branch -> sold}
  periods.forEach(per => {
    Object.entries(per.sales ?? {}).forEach(([br, d]) => {
      if (closed.includes(br)) return;
      Object.keys(d).forEach(bc => {
        if (!salesByProd[bc]) salesByProd[bc] = {};
        salesByProd[bc][br] = (salesByProd[bc][br] ?? 0) + num(d[bc]?.qty ?? 0);
      });
    });
  });

  const fromSources = {}; // sourceBranch -> [items]
  const fromWarehouse = [];
  let needCount = 0;

  products.forEach(p => {
    const bc = p.barcode;
    const brSales = salesByProd[bc] ?? {};
    const targetSold = brSales[targetBranch] ?? 0;
    if (targetSold <= 0) return; // الفرع ما باعه أصلاً

    const unit = num(p.unitQty) || 12;
    const targetGiven = toDozen(targetSold, unit);
    const ovKey = targetBranch + "|" + bc;
    const targetRem = overrides[ovKey] !== undefined ? num(overrides[ovKey]) : Math.max(0, targetGiven - targetSold);
    if (targetRem >= needRem) return; // مو ناقص
    needCount++;

    let needQty = toDozen(Math.max(needRem - targetRem, targetSold), unit);

    const item = {
      barcode: bc, name: p.name, container: p.container ?? "",
      factory: getFactoryCode(bc),
      targetSold, targetGiven, targetRem,
      sellPrice: num(p.sellPrice),
    };

    // مخزون المستودع = المشترى − مجموع الموزّع لكل الفروع
    const bought = totalPurchases(p);
    let totalGiven = 0;
    Object.values(brSales).forEach(sold => { totalGiven += toDozen(sold, unit); });
    const warehouseStock = Math.max(0, bought - totalGiven);
    item.bought = bought;          // كم جاء (المشترى الكلي)
    item.whStock = warehouseStock; // كم باقي في المستودع

    // الفروع الراكدة (مصدر محتمل): باع أقل من نص معدّل المنتج، أو متبقيه المعدّل كبير
    const allBr = Object.entries(brSales).filter(([br]) => !closed.includes(br));
    const totalProdSold = allBr.reduce((s,[,sold])=>s+sold, 0);
    const avgProdSold = allBr.length > 0 ? totalProdSold / allBr.length : 0;
    const candidates = allBr
      .filter(([br]) => br !== targetBranch && !newBranches.includes(br))
      .map(([br, sold]) => {
        const given = toDozen(sold, unit);
        const srcKey = br + "|" + bc;
        const rem = overrides[srcKey] !== undefined ? num(overrides[srcKey]) : Math.max(0, given - sold);
        return { br, sold, rem, city: cityOf(br, cityOverrides) };
      })
      .filter(s => (avgProdSold > 0 && s.sold < avgProdSold * 0.5 && s.rem > 0) || s.rem >= surplusRem)
      .sort((a,b) => {
        const aCity = a.city === tCity ? 0 : 1;
        const bCity = b.city === tCity ? 0 : 1;
        return aCity - bCity || b.rem - a.rem;
      });

    const takeFromBranch = () => {
      if (candidates.length === 0) return;
      const src = candidates[0];
      const moveQty = Math.min(Math.max(src.rem, unit), needQty);
      if (moveQty >= unit/2) {
        const sameCity = src.city === tCity;
        if (!fromSources[src.br]) fromSources[src.br] = { sameCity, city: src.city, items: [] };
        fromSources[src.br].items.push({ ...item, qty: moveQty, srcBranch: src.br, srcRem: src.rem, srcSold: src.sold, srcStale: avgProdSold > 0 && src.sold < avgProdSold * 0.5 });
        needQty -= moveQty;
      }
    };
    const takeFromWarehouse = () => {
      if (warehouseStock >= unit && needQty >= unit/2) {
        const fromWh = Math.min(warehouseStock, needQty);
        fromWarehouse.push({ ...item, qty: fromWh });
        needQty -= fromWh;
      }
    };

    // قاعدة أساسية: لو المستودع يغطّي الحاجة كاملة → خذ منه فقط (لا تظهره في الفروع)
    if (warehouseStock >= needQty) {
      takeFromWarehouse();
    } else if (priority === "stale") {
      // الراكد أولاً: حرّك راكد الفروع، ثم المستودع يكمّل
      takeFromBranch();
      takeFromWarehouse();
    } else {
      // المستودع أولاً: خذ ما فيه، ثم الفروع تكمّل
      takeFromWarehouse();
      if (needQty >= unit/2) takeFromBranch();
    }
  });

  // ترتيب: نفس المدينة أولاً
  const sources = Object.entries(fromSources).map(([br, d]) => ({ branch: br, ...d }))
    .sort((a,b) => (a.sameCity?0:1) - (b.sameCity?0:1) || b.items.length - a.items.length);

  return { sources, fromWarehouse, needCount, tCity };
}


export default function SmartRedistribution({ products=[], periods=[], settings={}, images={}, onSaveSettings }) {
  const [view, setView] = useState("fac");    // fac = النقل بالمصنع · fill = عبّي فرع
  const [cont, setCont] = useState(null);    // الكونتينر المختار
  const [sel, setSel] = useState(null);      // المصنع المختار
  const [edits, setEdits] = useState({});    // {barcode: qty معدّلة}
  const [removed, setRemoved] = useState({}); // {barcode: true} مستثنى
  const [viewImg, setViewImg] = useState(null); // صورة مكبّرة {src, name}
  // عبّي فرع
  const [fillTarget, setFillTarget] = useState(null);  // الفرع المختار لتعبئته
  const [needRem, setNeedRem] = useState(6);           // ناقص: متبقي أقل من
  const [surplusRem, setSurplusRem] = useState(12);    // فائض: متبقي أكثر من
  const [priority, setPriority] = useState("stale");   // stale = الراكد أولاً · warehouse = المستودع أولاً
  const [openSrc, setOpenSrc] = useState({});          // مصادر مفتوحة

  const analysis = useMemo(()=>analyze(products, periods, settings), [products, periods, settings]);

  const branchList = useMemo(()=>allBranches(periods).filter(b=>!(settings?.closedBranches??[]).includes(b)), [periods, settings]);
  const fillPlan = useMemo(
    ()=> fillTarget ? fillBranch(fillTarget, products, periods, settings, needRem, surplusRem, priority) : null,
    [fillTarget, products, periods, settings, needRem, surplusRem, priority]
  );

  // تعديل المتبقي داخل عبّي فرع (هدف أو مصدر) — يحفظ في stockOverrides والخطة تتحدّث فوراً
  const [editKey, setEditKey] = useState(null);   // "branch|barcode" قيد التعديل
  const [editVal, setEditVal] = useState("");
  const saveStock = async (br, barcode, val) => {
    const overrides = { ...(settings?.stockOverrides ?? {}) };
    const key = br + "|" + barcode;
    if (val === "" || val === null) delete overrides[key];
    else overrides[key] = Math.max(0, Number(val) || 0);
    if (onSaveSettings) await onSaveSettings({ ...settings, stockOverrides: overrides });
    setEditKey(null); setEditVal("");
  };

  // طباعة خطة تعبئة الفرع — mode: "all" | "warehouse" | "branches"
  const printFill = (mode = "all") => {
    if (!fillPlan) return;
    const showWh = mode === "all" || mode === "warehouse";
    const showBr = mode === "all" || mode === "branches";
    const d = new Date();
    const dnum = `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
    const imgCell = (bc) => { const im = images?.[bc]; return im ? `<img src="${im}" class="th"/>` : `<div class="noimg">📦</div>`; };
    const section = (title, cls, items) => `
      <div class="sec">
        <div class="sech ${cls}">${title} <span class="cnt">${items.length} منتج</span></div>
        <table><thead><tr><th>صورة</th><th>المنتج</th><th>الباركود</th><th>🏭</th><th>باع</th><th>أخذ</th><th>باقي</th><th>ينقل</th></tr></thead><tbody>
        ${items.map(m=>`<tr><td class="imgc">${imgCell(m.barcode)}</td><td class="nm">${m.name}</td><td class="bc">${m.barcode}</td><td>${m.factory}</td><td>${m.targetSold}</td><td>${m.targetGiven}</td><td>${m.targetRem}</td><td class="q">${m.qty}</td></tr>`).join("")}
        </tbody></table>
      </div>`;
    const srcHtml = showBr ? fillPlan.sources.map(s =>
      section(`📦 من فرع: ${s.branch}${s.sameCity?' <span style="color:#1e3a5f">✓ نفس المدينة</span>':''}`, "tr", s.items)
    ).join("") : "";
    const whHtml = (showWh && fillPlan.fromWarehouse.length) ? section("🏬 من المستودع الرئيسي", "wh", fillPlan.fromWarehouse) : "";
    const whCount = fillPlan.fromWarehouse.length;
    const brCount = fillPlan.sources.reduce((s,x)=>s+x.items.length,0);
    const totalItems = (showWh?whCount:0) + (showBr?brCount:0);
    if (totalItems === 0) { alert("لا منتجات في هذا القسم"); return; }
    const planLabel = mode==="warehouse" ? "من المستودع الرئيسي" : mode==="branches" ? "من الفروع" : "الكاملة";
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>تعبئة ${fillTarget}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        *{font-family:'Cairo',sans-serif;box-sizing:border-box;margin:0;padding:0}
        body{background:#f1f5f9;color:#1a1a1a}
        .tb{position:fixed;top:0;left:0;right:0;background:#0f172a;padding:10px;display:flex;gap:10px;justify-content:center;z-index:99}
        .tb button{font-family:'Cairo';font-size:14px;font-weight:700;border:none;border-radius:10px;padding:10px 20px;cursor:pointer}
        .bk{background:#334155;color:#fff}.pr{background:#1e3a5f;color:#fff}
        .page{max-width:820px;margin:70px auto 30px;background:#fff;padding:24px;border-radius:14px}
        .hd{border-bottom:3px solid #0f172a;padding-bottom:14px;margin-bottom:18px;text-align:center}
        .brand{font-size:24px;font-weight:900;color:#0f172a}
        .ttl{font-size:16px;color:#475569;margin-top:4px;font-weight:700}
        .sec{margin-bottom:22px;page-break-inside:avoid}
        .sech{padding:11px 16px;border-radius:10px 10px 0 0;font-weight:900;font-size:15px;color:#fff;display:flex;justify-content:space-between;align-items:center}
        .sech.wh{background:#1e3a5f}
        .sech.tr{background:#475569}
        .cnt{font-size:12px;font-weight:700;background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:100px}
        table{width:100%;border-collapse:collapse}
        th{background:#e2e8f0;padding:8px 6px;font-size:11px;color:#334155}
        td{border:1px solid #e2e8f0;padding:7px 6px;text-align:center;font-size:12px;vertical-align:middle}
        td.imgc{width:50px;padding:3px}
        .th{width:44px;height:44px;object-fit:cover;border-radius:7px;border:1px solid #e2e8f0}
        .noimg{width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:20px;background:#f1f5f9;border-radius:7px;margin:0 auto}
        td.nm{text-align:right;font-weight:700;color:#0f172a}
        td.bc{font-family:monospace;font-size:10px;color:#64748b}
        td.q{font-size:18px;font-weight:900;color:#1e3a5f}
        tr:nth-child(even) td{background:#fafbfc}
        .warn{text-align:center;color:#475569;font-size:12px;margin-top:14px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:8px}
        @media print{body{background:#fff}.tb{display:none}.page{margin:0;max-width:100%}}
      </style></head><body>
      <div class="tb"><button class="bk" onclick="window.close();history.back()">← رجوع</button><button class="pr" onclick="window.print()">🖨️ طباعة</button></div>
      <div class="page">
        <div class="hd"><div class="brand">${settings?.brandName ?? "ALBAROO"}</div>
        <div class="ttl">🎯 خطة تعبئة فرع: ${fillTarget} — ${planLabel}</div>
        <div style="font-size:13px;color:#64748b;margin-top:6px">📅 ${dnum} · ${totalItems} منتج</div></div>
        ${whHtml}${srcHtml}
        <div class="warn">⚠️ الكميات تقديرية من المبيعات — تأكد من الرف الفعلي قبل النقل</div>
      </div></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  // بناء HTML لمصدر واحد (للطباعة أو الصورة)
  const buildSourceHtml = (srcLabel, items, forImage = false) => {
    const d = new Date();
    const dnum = `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
    const imgCell = (bc) => { const im = images?.[bc]; return im ? `<img src="${im}" class="th"/>` : `<div class="noimg">📦</div>`; };
    const rows = items.map(m=>`<tr><td class="imgc">${imgCell(m.barcode)}</td><td class="nm">${m.name}</td><td class="bc">${m.barcode}</td><td>${m.factory}</td><td>${m.targetSold}</td><td>${m.targetGiven}</td><td>${m.targetRem}</td><td class="q">${m.qty}</td></tr>`).join("");
    return `<div class="page">
      <div class="hd"><div class="brand">${settings?.brandName ?? "ALBAROO"}</div>
      <div class="ttl">🎯 تعبئة ${fillTarget} ← ${srcLabel}</div>
      <div style="font-size:13px;color:#64748b;margin-top:6px">📅 ${dnum} · ${items.length} منتج</div></div>
      <table><thead><tr><th>صورة</th><th>المنتج</th><th>الباركود</th><th>🏭</th><th>باع</th><th>أخذ</th><th>باقي</th><th>ينقل</th></tr></thead><tbody>${rows}</tbody></table>
      ${forImage?"":'<div class="warn">⚠️ الكميات تقديرية — تأكد من الرف الفعلي قبل النقل</div>'}
    </div>`;
  };

  const sourceStyle = `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
    *{font-family:'Cairo',sans-serif;box-sizing:border-box;margin:0;padding:0}
    body{background:#f1f5f9;color:#1a1a1a}
    .page{max-width:820px;margin:0 auto;background:#fff;padding:24px;border-radius:14px}
    .hd{border-bottom:3px solid #0f172a;padding-bottom:14px;margin-bottom:18px;text-align:center}
    .brand{font-size:24px;font-weight:900;color:#0f172a}.ttl{font-size:16px;color:#475569;margin-top:4px;font-weight:700}
    table{width:100%;border-collapse:collapse}
    th{background:#e2e8f0;padding:8px 6px;font-size:11px;color:#334155}
    td{border:1px solid #e2e8f0;padding:7px 6px;text-align:center;font-size:12px;vertical-align:middle}
    td.imgc{width:50px;padding:3px}.th{width:44px;height:44px;object-fit:cover;border-radius:7px;border:1px solid #e2e8f0}
    .noimg{width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:20px;background:#f1f5f9;border-radius:7px;margin:0 auto}
    td.nm{text-align:right;font-weight:700;color:#0f172a}td.bc{font-family:monospace;font-size:10px;color:#64748b}
    td.q{font-size:18px;font-weight:900;color:#1e3a5f}tr:nth-child(even) td{background:#fafbfc}
    .warn{text-align:center;color:#475569;font-size:12px;margin-top:14px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:8px}`;

  // طباعة مصدر واحد
  const printSource = (srcLabel, items) => {
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>${srcLabel}</title>
      <style>${sourceStyle}
        .tb{position:fixed;top:0;left:0;right:0;background:#0f172a;padding:10px;display:flex;gap:10px;justify-content:center;z-index:99}
        .tb button{font-family:'Cairo';font-size:14px;font-weight:700;border:none;border-radius:10px;padding:10px 20px;cursor:pointer}
        .bk{background:#334155;color:#fff}.pr{background:#1e3a5f;color:#fff}
        .page{margin:70px auto 30px}
        @media print{body{background:#fff}.tb{display:none}.page{margin:0;max-width:100%}}
      </style></head><body>
      <div class="tb"><button class="bk" onclick="window.close();history.back()">← رجوع</button><button class="pr" onclick="window.print()">🖨️ طباعة</button></div>
      ${buildSourceHtml(srcLabel, items)}
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  // حفظ صورة لمصدر واحد
  const saveSourceImage = async (srcLabel, items) => {
    try {
      const h2c = await new Promise((resolve, reject) => {
        if (window.html2canvas) return resolve(window.html2canvas);
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
        s.onload = () => resolve(window.html2canvas); s.onerror = reject;
        document.head.appendChild(s);
      });
      const holder = document.createElement("div");
      holder.style.cssText = "position:fixed;left:-9999px;top:0;width:820px;background:#f1f5f9";
      holder.innerHTML = `<style>${sourceStyle}</style>${buildSourceHtml(srcLabel, items, true)}`;
      document.body.appendChild(holder);
      const canvas = await h2c(holder.querySelector(".page"), { scale:2, backgroundColor:"#fff", useCORS:true });
      document.body.removeChild(holder);
      const fn = `تعبئة-${fillTarget}-${srcLabel}.jpg`.replace(/[^\w\u0600-\u06FF.-]/g,"_");
      const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.92));
      if (blob && navigator.canShare) {
        const file = new File([blob], fn, { type:"image/jpeg" });
        if (navigator.canShare({ files:[file] })) { await navigator.share({ files:[file] }); return; }
      }
      const a = document.createElement("a");
      a.href = blob ? URL.createObjectURL(blob) : canvas.toDataURL("image/jpeg",0.92);
      a.download = fn; a.click();
    } catch { alert("تعذّر حفظ الصورة — استخدم الطباعة"); }
  };

  // تجميع بالكونتينر
  const byContainer = useMemo(()=>{
    const map = {};
    analysis.forEach(f => {
      const c = f.container || "بدون كونتينر";
      if (!map[c]) map[c] = { name: c, factories: [] };
      map[c].factories.push(f);
    });
    return Object.values(map).sort((a,b)=>b.factories.length-a.factories.length);
  }, [analysis]);

  // منتجات النقل المقترحة للمصنع المختار
  const plan = useMemo(()=>{
    if (!sel) return null;
    const fac = analysis.find(f=>f.code===sel);
    if (!fac) return null;
    const closed = settings?.closedBranches ?? [];
    // من كل فرع راكد: منتجاته اللي عنده فائض
    const source = fac.stale[0];   // أكثر فرع ركوداً
    const dest = fac.hot[0];        // أكثر فرع طلباً
    // منتجات المصنع في الفرع الراكد
    const facProds = {};
    products.forEach(p => {
      if (getFactoryCode(p.barcode) !== sel) return;
      let soldSrc = 0;
      periods.forEach(per => { soldSrc += num(per.sales?.[source.branch]?.[p.barcode]?.qty ?? 0); });
      if (soldSrc <= 0) return;
      const given = toDozen(soldSrc, 12);
      const surplus = given - soldSrc;
      if (surplus < 1) return;
      facProds[p.barcode] = { barcode:p.barcode, name:p.name, soldSrc, surplus, suggest: Math.max(12, toDozen(surplus,12)) };
    });
    return { fac, source, dest, items: Object.values(facProds) };
  }, [sel, analysis, products, periods, settings]);

  // طباعة خطة النقل
  // اعتمد + احفظ + اطبع
  const approveAndPrint = async () => {
    if (!plan) return;
    const items = plan.items.filter(it=>!removed[it.barcode]);
    if (items.length === 0) return;
    // نحفظ النقل في settings.transfers (نفس آلية النقل اليدوي)
    const existing = settings?.transfers ?? [];
    const newTransfers = items.map(it => ({
      barcode: it.barcode,
      name: it.name,
      from: plan.source.branch,
      to: plan.dest.branch,
      qty: edits[it.barcode] ?? it.suggest,
      factory: plan.fac.code,
      smart: true,
      ts: Date.now(),
    }));
    if (onSaveSettings) {
      try { await onSaveSettings({ ...settings, transfers: [...existing, ...newTransfers] }); } catch(e){}
    }
    printPlan();
  };

  const printPlan = () => {
    if (!plan) return;
    const items = plan.items.filter(it=>!removed[it.barcode]);
    const d = new Date();
    const ds = `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
    const rows = items.map((it,i)=>{
      const qty = edits[it.barcode] ?? it.suggest;
      const img = images?.[it.barcode];
      const imgCell = img ? `<img src="${img}" class="pimg"/>` : `<div class="pnoimg">📦</div>`;
      return `<tr><td class="rn">${i+1}</td><td class="im">${imgCell}</td><td class="bc">${it.barcode}</td><td class="nm">${it.name}</td><td class="q">${qty}</td></tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>نقل_${plan.source.branch}_${ds.replace(/\//g,"-")}</title>
      <style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
      *{font-family:'Cairo';box-sizing:border-box;margin:0;padding:0}body{padding:20px;color:#000}
      .h{text-align:center;border-bottom:2px solid #1e3a5f;padding-bottom:12px;margin-bottom:14px}
      .lg{font-size:24px;font-weight:900;letter-spacing:3px}.t{font-size:16px;font-weight:700;margin-top:4px}
      .route{display:flex;justify-content:center;gap:14px;align-items:center;margin:14px 0;font-size:15px;font-weight:900}
      .from{color:#475569}.to{color:#1e3a5f}.ar{color:#64748b}
      .meta{text-align:center;font-size:12px;color:#555;margin-bottom:12px}
      table{width:100%;border-collapse:collapse}th{background:#1e3a5f;color:#fff;padding:8px;font-size:13px;border:1px solid #94a3b8}
      td{border:1px solid #cbd5e1;padding:8px;text-align:center;font-size:14px}td.nm{text-align:right;font-weight:700}td.bc{font-family:monospace;font-size:12px}td.q{font-size:18px;font-weight:900;color:#1e3a5f}td.rn{color:#888;width:30px}
      td.im{width:54px;padding:4px}.pimg{width:46px;height:46px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1}.pnoimg{width:46px;height:46px;border-radius:6px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto}
      .tb{position:fixed;top:0;left:0;right:0;background:#0f172a;padding:12px;display:flex;gap:8px;justify-content:center}
      .tb button{font-family:'Cairo';font-weight:900;border:none;border-radius:10px;padding:11px 24px;cursor:pointer;font-size:14px}
      .pr{background:#2563eb;color:#fff}.bk{background:#475569;color:#fff}
      @media print{.tb{display:none}body{padding:6px}}
      .wrap{padding-top:70px}</style></head><body>
      <div class="tb"><button class="bk" onclick="window.close()">✕ إغلاق</button><button class="pr" onclick="window.print()">🖨️ طباعة</button></div>
      <div class="wrap">
        <div class="h"><div class="lg">ALBAROO</div><div class="t">📋 خطة نقل بضاعة</div></div>
        <div class="route"><span class="from">📤 ${plan.source.branch}</span><span class="ar">←</span><span class="to">📥 ${plan.dest.branch}</span></div>
        <div class="meta">🏭 مصنع ${plan.fac.code}${plan.fac.name?` · ${plan.fac.name}`:""} · 📅 ${ds} · ${items.length} منتج</div>
        <table><thead><tr><th>#</th><th>صورة</th><th>الباركود</th><th>المنتج</th><th>الكمية</th></tr></thead><tbody>${rows}</tbody></table>
      </div></body></html>`;
    const w = window.open("","_blank");
    if (w){ w.document.write(html); w.document.close(); }
  };

  // ─── معاينة الصورة المكبّرة (مشتركة) ───
  const imgModal = viewImg ? (
    <div onClick={()=>setViewImg(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:1000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <img src={viewImg.src} alt="" style={{maxWidth:"90%",maxHeight:"70vh",borderRadius:"12px",objectFit:"contain"}} />
      <div style={{color:"#fff",fontSize:"14px",fontWeight:700,marginTop:"12px",textAlign:"center"}}>{viewImg.name}</div>
      <div style={{display:"flex",gap:"10px",marginTop:"14px"}}>
        <a href={viewImg.src} download={`${viewImg.name||"صورة"}.jpg`} onClick={e=>e.stopPropagation()}
          style={{background:"#16a34a",color:"#fff",borderRadius:"10px",padding:"11px 22px",fontSize:"14px",fontWeight:900,textDecoration:"none",fontFamily:"Cairo"}}>💾 حفظ الصورة</a>
        <button onClick={()=>setViewImg(null)} style={{background:"#475569",color:"#fff",border:"none",borderRadius:"10px",padding:"11px 22px",fontSize:"14px",fontWeight:900,fontFamily:"Cairo",cursor:"pointer"}}>✕ إغلاق</button>
      </div>
    </div>
  ) : null;

  // ─── شاشة تفاصيل المصنع ───
  if (view==="fac" && sel && plan) {
    const items = plan.items.filter(it=>!removed[it.barcode]);
    return (
      <div className="space-y-3">
        {imgModal}
        <button onClick={()=>{setSel(null);setEdits({});setRemoved({});}} className="text-blue-400 font-bold text-sm">← رجوع للمصانع</button>
        <div style={{background:"#0f1626",border:"1px solid #2d3a52",borderRadius:"14px",padding:"14px"}}>
          <div style={{fontWeight:900,color:"#f0e6d0",fontSize:"15px",marginBottom:"8px"}}>🏭 {plan.fac.code}{plan.fac.name?` · ${plan.fac.name}`:""}</div>
          <div style={{display:"flex",alignItems:"center",gap:"10px",fontSize:"14px",fontWeight:900}}>
            <span style={{color:"#f87171"}}>📤 {plan.source.branch}</span>
            <span style={{color:"#64748b"}}>←</span>
            <span style={{color:"#4ade80"}}>📥 {plan.dest.branch}</span>
          </div>
          <div style={{display:"flex",gap:"8px",marginTop:"10px"}}>
            <div style={{flex:1,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:"10px",padding:"8px",textAlign:"center"}}>
              <div style={{fontSize:"20px",fontWeight:900,color:"#f87171"}}>{plan.source.sold}</div>
              <div style={{fontSize:"10px",color:"#94a3b8"}}>باع الراكد ({plan.source.vsAvg.toFixed(0)}%)</div>
            </div>
            <div style={{flex:1,background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.3)",borderRadius:"10px",padding:"8px",textAlign:"center"}}>
              <div style={{fontSize:"20px",fontWeight:900,color:"#4ade80"}}>{plan.dest.sold}</div>
              <div style={{fontSize:"10px",color:"#94a3b8"}}>باع السريع ({plan.dest.vsAvg.toFixed(0)}%)</div>
            </div>
          </div>
        </div>

        {items.length===0 ? (
          <div style={{textAlign:"center",padding:"30px",color:"#64748b"}}>ما فيه منتجات للنقل</div>
        ) : (
          <>
            <div style={{fontSize:"12px",color:"#94a3b8",fontWeight:700}}>المنتجات المقترحة للنقل ({items.length}) — عدّل أو احذف:</div>
            {items.map(it => {
              const qty = edits[it.barcode] ?? it.suggest;
              return (
                <div key={it.barcode} style={{background:"#0f1626",border:"1px solid #2d3a52",borderRadius:"12px",padding:"10px",display:"flex",alignItems:"center",gap:"10px"}}>
                  {images?.[it.barcode]
                    ? <img src={images[it.barcode]} alt="" onClick={()=>setViewImg({src:images[it.barcode],name:it.name})} style={{width:"48px",height:"48px",borderRadius:"8px",objectFit:"cover",border:"1px solid #2d3a52",flexShrink:0,cursor:"pointer"}} />
                    : <div style={{width:"48px",height:"48px",borderRadius:"8px",background:"#1a2236",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"22px",flexShrink:0}}>📦</div>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,color:"#f0e6d0",fontSize:"13px"}}>{it.name}</div>
                    <div style={{fontFamily:"monospace",fontSize:"11px",color:"#64748b"}}>{it.barcode}</div>
                    <div style={{fontSize:"10px",color:"#94a3b8",marginTop:"2px"}}>فائض: {it.surplus}</div>
                  </div>
                  <input type="number" value={qty} min="0" step="12"
                    onChange={e=>setEdits({...edits,[it.barcode]:Math.max(0,num(e.target.value))})}
                    style={{width:"60px",background:"#1a2236",border:"1px solid #2d3a52",color:"#4ade80",borderRadius:"8px",padding:"7px",fontSize:"15px",fontWeight:900,textAlign:"center",fontFamily:"Cairo"}} />
                  <button onClick={()=>setRemoved({...removed,[it.barcode]:true})}
                    style={{background:"rgba(239,68,68,0.15)",color:"#fca5a5",border:"none",borderRadius:"8px",padding:"7px 10px",fontSize:"12px",fontWeight:700,cursor:"pointer",fontFamily:"Cairo"}}>حذف</button>
                </div>
              );
            })}
            <button onClick={approveAndPrint}
              style={{width:"100%",background:"#16a34a",color:"#fff",border:"none",borderRadius:"12px",padding:"13px",fontSize:"15px",fontWeight:900,cursor:"pointer",fontFamily:"Cairo",marginTop:"6px"}}>
              ✅ اعتمد + احفظ + اطبع
            </button>
          </>
        )}
      </div>
    );
  }

  // ─── شاشة المصانع داخل كونتينر مختار ───
  if (view==="fac" && cont && !sel) {
    const c = byContainer.find(x=>x.name===cont);
    return (
      <div className="space-y-3">
        {imgModal}
        <button onClick={()=>setCont(null)} className="text-blue-400 font-bold text-sm">← رجوع للكونتينرات</button>
        <div style={{fontWeight:900,color:"#f0e6d0",fontSize:"15px"}}>📦 {cont}</div>
        {(c?.factories ?? []).map(f => (
          <button key={f.code} onClick={()=>setSel(f.code)}
            style={{width:"100%",background:"#0f1626",border:"1px solid #2d3a52",borderRadius:"14px",padding:"14px",textAlign:"right",cursor:"pointer",fontFamily:"Cairo"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:900,color:"#f0e6d0",fontSize:"14px"}}>🏭 {f.code}{f.name?` · ${f.name}`:""}</div>
                <div style={{fontSize:"11px",color:"#94a3b8",marginTop:"3px"}}>📤 {f.stale.length} فرع راكد · 📥 {f.hot.length} فرع يطلب</div>
              </div>
              <div style={{color:"#3b82f6",fontWeight:900,fontSize:"18px"}}>←</div>
            </div>
          </button>
        ))}
      </div>
    );
  }

  // ─── شاشة الكونتينرات (الفرص) ───
  return (
    <div className="space-y-3">
      {imgModal}

      {/* تبويبان */}
      <div style={{display:"flex",gap:"6px",background:"rgba(255,255,255,0.04)",borderRadius:"14px",padding:"4px"}}>
        {[["fac","🔄 النقل بالمصنع"],["fill","🎯 عبّي فرع"]].map(([k,l])=>(
          <button key={k} onClick={()=>setView(k)} style={{
            flex:1,padding:"9px",borderRadius:"11px",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontSize:"13px",fontWeight:"700",
            background:view===k?"rgba(59,130,246,0.2)":"transparent",
            color:view===k?"#93c5fd":"rgba(255,255,255,0.4)",
            border:view===k?"1px solid rgba(59,130,246,0.4)":"1px solid transparent",
          }}>{l}</button>
        ))}
      </div>

      {/* 🎯 عبّي فرع */}
      {view==="fill" && (
        <div className="space-y-3">
          {!fillTarget ? (
            <>
              <div style={{background:"rgba(212,168,83,0.08)",border:"1px solid rgba(212,168,83,0.2)",borderRadius:"12px",padding:"12px",fontSize:"12px",color:"#d4a853"}}>
                🎯 اختر فرعاً تبي تعبّيه — والنظام يقول لك كل منتج ناقص من وين تجيبه (فرع فائض نفس المدينة أولوية، ثم المستودع).
              </div>
              <div style={{fontSize:"13px",fontWeight:"700",color:"#94a3b8"}}>اختر الفرع:</div>
              <div className="space-y-2">
                {branchList.map(b => (
                  <button key={b} onClick={()=>setFillTarget(b)}
                    style={{width:"100%",background:"#0f1626",border:"1px solid #2d3a52",borderRadius:"14px",padding:"14px",textAlign:"right",cursor:"pointer",fontFamily:"Cairo",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontWeight:"900",color:"#e2e8f0"}}>🏪 {b}</span>
                    <span style={{color:"#64748b",fontSize:"13px"}}>←</span>
                  </button>
                ))}
                {branchList.length===0 && <div style={{textAlign:"center",color:"#64748b",padding:"30px"}}>لا فروع</div>}
              </div>
            </>
          ) : (
            <>
              <button onClick={()=>setFillTarget(null)} style={{color:"#60a5fa",fontWeight:"700",fontSize:"13px",background:"none",border:"none",cursor:"pointer",fontFamily:"Cairo"}}>← كل الفروع</button>
              <div style={{background:"#0f1626",border:"1px solid #2d3a52",borderRadius:"14px",padding:"14px"}}>
                <div style={{fontSize:"18px",fontWeight:"900",color:"#fff"}}>🎯 تعبئة: {fillTarget}</div>
                {fillPlan?.tCity && <div style={{fontSize:"12px",color:"#94a3b8",marginTop:"2px"}}>📍 {fillPlan.tCity}</div>}
                <div style={{fontSize:"13px",color:"#d4a853",marginTop:"6px",fontWeight:"700"}}>🔴 ناقص عنده: {fillPlan?.needCount ?? 0} منتج</div>
              </div>

              {/* أرقام قابلة للتغيير */}
              <div style={{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"center",background:"#0f1626",border:"1px solid #2d3a52",borderRadius:"12px",padding:"10px",fontSize:"12px"}}>
                <span style={{color:"#94a3b8",fontWeight:"700"}}>ناقص لو المتبقي أقل من</span>
                <input type="number" value={needRem} min={0} onChange={e=>setNeedRem(Math.max(0,Number(e.target.value)||0))}
                  style={{width:"50px",background:"#1e293b",border:"1px solid #334155",color:"#f87171",borderRadius:"8px",padding:"6px",fontWeight:"900",textAlign:"center",fontFamily:"Cairo"}} />
                <span style={{color:"#94a3b8",fontWeight:"700"}}>· فائض لو أكثر من</span>
                <input type="number" value={surplusRem} min={0} onChange={e=>setSurplusRem(Math.max(0,Number(e.target.value)||0))}
                  style={{width:"50px",background:"#1e293b",border:"1px solid #334155",color:"#4ade80",borderRadius:"8px",padding:"6px",fontWeight:"900",textAlign:"center",fontFamily:"Cairo"}} />
              </div>

              {/* أولوية المصدر */}
              <div style={{background:"#0f1626",border:"1px solid #2d3a52",borderRadius:"12px",padding:"10px"}}>
                <div style={{fontSize:"12px",color:"#94a3b8",fontWeight:"700",marginBottom:"8px"}}>من وين نعبّي أول؟</div>
                <div style={{display:"flex",gap:"6px"}}>
                  {[["stale","🔄 الراكد بالفروع أول"],["warehouse","🏬 المستودع أول"]].map(([k,l])=>(
                    <button key={k} onClick={()=>setPriority(k)} style={{
                      flex:1,padding:"9px",borderRadius:"10px",cursor:"pointer",fontFamily:"Cairo",fontSize:"12px",fontWeight:"700",
                      background:priority===k?"rgba(59,130,246,0.2)":"transparent",
                      color:priority===k?"#93c5fd":"rgba(255,255,255,0.4)",
                      border:priority===k?"1px solid rgba(59,130,246,0.4)":"1px solid #2d3a52",
                    }}>{l}</button>
                  ))}
                </div>
                <div style={{fontSize:"10px",color:"#64748b",marginTop:"6px"}}>
                  {priority==="stale" ? "💡 يحرّك البضاعة الراكدة من الفروع أولاً، والمستودع يكمّل" : "💡 يوزّع من المستودع أولاً، والفروع تكمّل"}
                </div>
              </div>

              {fillPlan && (fillPlan.sources.length>0 || fillPlan.fromWarehouse.length>0) ? (
                <>
                  <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                    <div style={{display:"flex",gap:"8px"}}>
                      <button onClick={()=>printFill("warehouse")} disabled={fillPlan.fromWarehouse.length===0} style={{flex:1,padding:"12px",borderRadius:"12px",border:"none",background:fillPlan.fromWarehouse.length?"#1e3a5f":"#334155",color:"#fff",fontSize:"13px",fontWeight:"900",cursor:fillPlan.fromWarehouse.length?"pointer":"default",fontFamily:"Cairo",opacity:fillPlan.fromWarehouse.length?1:0.5}}>
                        🏬 اطبع المستودع ({fillPlan.fromWarehouse.length})
                      </button>
                      <button onClick={()=>printFill("branches")} disabled={fillPlan.sources.length===0} style={{flex:1,padding:"12px",borderRadius:"12px",border:"none",background:fillPlan.sources.length?"#475569":"#334155",color:"#fff",fontSize:"13px",fontWeight:"900",cursor:fillPlan.sources.length?"pointer":"default",fontFamily:"Cairo",opacity:fillPlan.sources.length?1:0.5}}>
                        📦 اطبع الفروع ({fillPlan.sources.reduce((s,x)=>s+x.items.length,0)})
                      </button>
                    </div>
                    <button onClick={()=>printFill("all")} style={{width:"100%",padding:"12px",borderRadius:"12px",border:"1px solid #475569",background:"transparent",color:"#94a3b8",fontSize:"12px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo"}}>
                      🖨️ اطبع الكل معاً
                    </button>
                  </div>

                  {/* المصادر */}
                  {fillPlan.sources.map(s => {
                    const open = openSrc[s.branch];
                    return (
                      <div key={s.branch} style={{background:"#0f1626",border:`1px solid ${s.sameCity?"#16a34a":"#ea580c"}40`,borderRadius:"14px",overflow:"hidden"}}>
                        <div onClick={()=>setOpenSrc(o=>({...o,[s.branch]:!o[s.branch]}))} style={{padding:"13px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div>
                            <div style={{fontWeight:"900",color:"#fff",fontSize:"14px"}}>📦 من {s.branch}</div>
                            <div style={{fontSize:"11px",color:s.sameCity?"#4ade80":"#fb923c",marginTop:"2px"}}>{s.sameCity?`✓ نفس المدينة (${s.city})`:`📍 ${s.city||"مدينة أخرى"}`}</div>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                            <span style={{background:"#1e293b",color:"#93c5fd",fontSize:"12px",fontWeight:"900",padding:"4px 10px",borderRadius:"100px"}}>{s.items.length} منتج</span>
                            <span style={{color:"#64748b"}}>{open?"▲":"▼"}</span>
                          </div>
                        </div>
                        {open && (
                          <div style={{padding:"0 10px 10px",display:"flex",flexDirection:"column",gap:"6px"}}>
                            <div style={{display:"flex",gap:"6px",marginBottom:"2px"}}>
                              <button onClick={()=>printSource(s.branch, s.items)} style={{flex:1,padding:"8px",borderRadius:"9px",border:"1px solid #334155",background:"#1e293b",color:"#93c5fd",fontSize:"11px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo"}}>🖨️ طباعة</button>
                              <button onClick={()=>saveSourceImage(s.branch, s.items)} style={{flex:1,padding:"8px",borderRadius:"9px",border:"1px solid #334155",background:"#1e293b",color:"#6ee7b7",fontSize:"11px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo"}}>📷 حفظ صورة</button>
                            </div>
                            {s.items.map(m => (
                              <div key={m.barcode} style={{display:"flex",alignItems:"center",gap:"10px",background:"rgba(255,255,255,0.03)",borderRadius:"10px",padding:"8px"}}>
                                {images?.[m.barcode]
                                  ? <img src={images[m.barcode]} alt="" onClick={()=>setViewImg({src:images[m.barcode],name:m.name})} style={{width:"44px",height:"44px",borderRadius:"8px",objectFit:"cover",cursor:"pointer",flexShrink:0}} />
                                  : <div style={{width:"44px",height:"44px",borderRadius:"8px",background:"#1e293b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px",flexShrink:0}}>📦</div>}
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{fontSize:"13px",fontWeight:"700",color:"#e2e8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
                                  <div style={{fontSize:"11px",color:"#64748b",fontFamily:"monospace"}}>{m.barcode}</div>
                                  <div style={{display:"flex",gap:"8px",marginTop:"3px",fontSize:"10px"}}>
                                    <span style={{color:"#fbbf24"}}>باع {m.targetSold}</span>
                                    <span style={{color:"#60a5fa"}}>أخذ {m.targetGiven}</span>
                                    <span style={{color:"#6ee7b7"}}>باقي {m.targetRem}</span>
                                  </div>
                                  <div style={{display:"flex",gap:"8px",marginTop:"2px",fontSize:"10px"}}>
                                    <span style={{color:"#94a3b8"}}>جاء {m.bought}</span>
                                    <span style={{color:"#c4b5fd"}}>المستودع {m.whStock}</span>
                                  </div>
                                  <div style={{marginTop:"3px",fontSize:"10px",display:"flex",gap:"6px",alignItems:"center",flexWrap:"wrap"}}>
                                    <span style={{background:m.srcStale?"rgba(239,68,68,0.2)":"rgba(34,197,94,0.2)",color:m.srcStale?"#fca5a5":"#6ee7b7",padding:"1px 7px",borderRadius:"100px",fontWeight:"700"}}>
                                      {m.srcStale?"🔴 المصدر راكد":"🟢 المصدر قوي"}
                                    </span>
                                    <span style={{color:"#94a3b8"}}>باقي عنده {m.srcRem}</span>
                                  </div>
                                  {/* تعديل المتبقي — الهدف والمصدر (خط كبير) */}
                                  <div style={{display:"flex",gap:"6px",marginTop:"8px",flexWrap:"wrap"}}>
                                    {editKey===(fillTarget+"|"+m.barcode) ? (
                                      <div style={{display:"flex",gap:"4px",alignItems:"center",background:"#0f172a",borderRadius:"10px",padding:"4px"}}>
                                        <span style={{fontSize:"13px",color:"#6ee7b7",fontWeight:"700"}}>🎯 باقي:</span>
                                        <input type="number" value={editVal} autoFocus onChange={e=>setEditVal(e.target.value)}
                                          style={{width:"60px",background:"#1e293b",border:"2px solid #10b981",color:"#fff",borderRadius:"8px",padding:"8px",fontSize:"18px",fontWeight:"900",textAlign:"center",fontFamily:"Cairo"}} />
                                        <button onClick={()=>saveStock(fillTarget, m.barcode, editVal)} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:"8px",padding:"9px 14px",fontSize:"14px",fontWeight:"900",cursor:"pointer",fontFamily:"Cairo"}}>حفظ</button>
                                        <button onClick={()=>{setEditKey(null);setEditVal("");}} style={{background:"#475569",color:"#fff",border:"none",borderRadius:"8px",padding:"9px 12px",fontSize:"14px",cursor:"pointer",fontFamily:"Cairo"}}>✕</button>
                                      </div>
                                    ) : (
                                      <button onClick={()=>{setEditKey(fillTarget+"|"+m.barcode);setEditVal(String(m.targetRem));}}
                                        style={{background:"rgba(16,185,129,0.15)",border:"1px solid rgba(16,185,129,0.4)",color:"#6ee7b7",borderRadius:"10px",padding:"7px 12px",fontSize:"13px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo"}}>
                                        🎯 عدّل باقي الهدف ({m.targetRem})
                                      </button>
                                    )}
                                    {editKey===(m.srcBranch+"|"+m.barcode) ? (
                                      <div style={{display:"flex",gap:"4px",alignItems:"center",background:"#0f172a",borderRadius:"10px",padding:"4px"}}>
                                        <span style={{fontSize:"13px",color:"#fbbf24",fontWeight:"700"}}>📦 باقي:</span>
                                        <input type="number" value={editVal} autoFocus onChange={e=>setEditVal(e.target.value)}
                                          style={{width:"60px",background:"#1e293b",border:"2px solid #f59e0b",color:"#fff",borderRadius:"8px",padding:"8px",fontSize:"18px",fontWeight:"900",textAlign:"center",fontFamily:"Cairo"}} />
                                        <button onClick={()=>saveStock(m.srcBranch, m.barcode, editVal)} style={{background:"#f59e0b",color:"#0a0804",border:"none",borderRadius:"8px",padding:"9px 14px",fontSize:"14px",fontWeight:"900",cursor:"pointer",fontFamily:"Cairo"}}>حفظ</button>
                                        <button onClick={()=>{setEditKey(null);setEditVal("");}} style={{background:"#475569",color:"#fff",border:"none",borderRadius:"8px",padding:"9px 12px",fontSize:"14px",cursor:"pointer",fontFamily:"Cairo"}}>✕</button>
                                      </div>
                                    ) : (
                                      <button onClick={()=>{setEditKey(m.srcBranch+"|"+m.barcode);setEditVal(String(m.srcRem));}}
                                        style={{background:"rgba(245,158,11,0.15)",border:"1px solid rgba(245,158,11,0.4)",color:"#fbbf24",borderRadius:"10px",padding:"7px 12px",fontSize:"13px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo"}}>
                                        📦 عدّل باقي المصدر ({m.srcRem})
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div style={{textAlign:"center",flexShrink:0}}>
                                  <div style={{fontSize:"18px",fontWeight:"900",color:"#60a5fa"}}>{m.qty}</div>
                                  <div style={{fontSize:"9px",color:"#64748b"}}>ينقل</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* المستودع */}
                  {fillPlan.fromWarehouse.length>0 && (
                    <div style={{background:"#0f1626",border:"1px solid #2563eb40",borderRadius:"14px",overflow:"hidden"}}>
                      <div onClick={()=>setOpenSrc(o=>({...o,__wh:!o.__wh}))} style={{padding:"13px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{fontWeight:"900",color:"#fff",fontSize:"14px"}}>🏬 من المستودع الرئيسي</div>
                        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                          <span style={{background:"#1e293b",color:"#93c5fd",fontSize:"12px",fontWeight:"900",padding:"4px 10px",borderRadius:"100px"}}>{fillPlan.fromWarehouse.length} منتج</span>
                          <span style={{color:"#64748b"}}>{openSrc.__wh?"▲":"▼"}</span>
                        </div>
                      </div>
                      {openSrc.__wh && (
                        <div style={{padding:"0 10px 10px",display:"flex",flexDirection:"column",gap:"6px"}}>
                          <div style={{display:"flex",gap:"6px",marginBottom:"2px"}}>
                            <button onClick={()=>printSource("المستودع الرئيسي", fillPlan.fromWarehouse)} style={{flex:1,padding:"8px",borderRadius:"9px",border:"1px solid #334155",background:"#1e293b",color:"#93c5fd",fontSize:"11px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo"}}>🖨️ طباعة</button>
                            <button onClick={()=>saveSourceImage("المستودع الرئيسي", fillPlan.fromWarehouse)} style={{flex:1,padding:"8px",borderRadius:"9px",border:"1px solid #334155",background:"#1e293b",color:"#6ee7b7",fontSize:"11px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo"}}>📷 حفظ صورة</button>
                          </div>
                          {fillPlan.fromWarehouse.map(m => (
                            <div key={m.barcode} style={{display:"flex",alignItems:"center",gap:"10px",background:"rgba(255,255,255,0.03)",borderRadius:"10px",padding:"8px"}}>
                              {images?.[m.barcode]
                                ? <img src={images[m.barcode]} alt="" onClick={()=>setViewImg({src:images[m.barcode],name:m.name})} style={{width:"44px",height:"44px",borderRadius:"8px",objectFit:"cover",cursor:"pointer",flexShrink:0}} />
                                : <div style={{width:"44px",height:"44px",borderRadius:"8px",background:"#1e293b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px",flexShrink:0}}>📦</div>}
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:"13px",fontWeight:"700",color:"#e2e8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
                                <div style={{fontSize:"11px",color:"#64748b",fontFamily:"monospace"}}>{m.barcode}</div>
                                <div style={{display:"flex",gap:"8px",marginTop:"3px",fontSize:"10px"}}>
                                  <span style={{color:"#fbbf24"}}>باع {m.targetSold}</span>
                                  <span style={{color:"#60a5fa"}}>أخذ {m.targetGiven}</span>
                                  <span style={{color:"#6ee7b7"}}>باقي {m.targetRem}</span>
                                </div>
                                <div style={{display:"flex",gap:"8px",marginTop:"2px",fontSize:"10px"}}>
                                  <span style={{color:"#94a3b8"}}>جاء {m.bought}</span>
                                  <span style={{color:"#c4b5fd"}}>المستودع {m.whStock}</span>
                                </div>
                                <div style={{marginTop:"8px"}}>
                                  {editKey===(fillTarget+"|"+m.barcode) ? (
                                    <div style={{display:"flex",gap:"4px",alignItems:"center",background:"#0f172a",borderRadius:"10px",padding:"4px",width:"fit-content"}}>
                                      <span style={{fontSize:"13px",color:"#6ee7b7",fontWeight:"700"}}>🎯 باقي:</span>
                                      <input type="number" value={editVal} autoFocus onChange={e=>setEditVal(e.target.value)}
                                        style={{width:"60px",background:"#1e293b",border:"2px solid #10b981",color:"#fff",borderRadius:"8px",padding:"8px",fontSize:"18px",fontWeight:"900",textAlign:"center",fontFamily:"Cairo"}} />
                                      <button onClick={()=>saveStock(fillTarget, m.barcode, editVal)} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:"8px",padding:"9px 14px",fontSize:"14px",fontWeight:"900",cursor:"pointer",fontFamily:"Cairo"}}>حفظ</button>
                                      <button onClick={()=>{setEditKey(null);setEditVal("");}} style={{background:"#475569",color:"#fff",border:"none",borderRadius:"8px",padding:"9px 12px",fontSize:"14px",cursor:"pointer",fontFamily:"Cairo"}}>✕</button>
                                    </div>
                                  ) : (
                                    <button onClick={()=>{setEditKey(fillTarget+"|"+m.barcode);setEditVal(String(m.targetRem));}}
                                      style={{background:"rgba(16,185,129,0.15)",border:"1px solid rgba(16,185,129,0.4)",color:"#6ee7b7",borderRadius:"10px",padding:"7px 12px",fontSize:"13px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo"}}>
                                      🎯 عدّل باقي الهدف ({m.targetRem})
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div style={{textAlign:"center",flexShrink:0}}>
                                <div style={{fontSize:"18px",fontWeight:"900",color:"#60a5fa"}}>{m.qty}</div>
                                <div style={{fontSize:"9px",color:"#64748b"}}>ينقل</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div style={{textAlign:"center",padding:"40px",color:"#64748b"}}>
                  <div style={{fontSize:"32px",marginBottom:"8px"}}>✓</div>
                  ما فيه نواقص لهذا الفرع<br/><span style={{fontSize:"11px"}}>أو ما فيه فروع فيها فائض</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {view==="fac" && (<>
      <div style={{background:"rgba(59,130,246,0.08)",border:"1px solid rgba(59,130,246,0.2)",borderRadius:"12px",padding:"12px",fontSize:"12px",color:"#93c5fd"}}>
        💡 النظام حلّل مبيعاتك عبر كل الفترات، واكتشف بضاعة <b>راكدة بفرع</b> + <b>طلب بفرع ثاني</b>. اختر كونتينر ثم مصنع لترى خطة النقل.
      </div>
      {byContainer.length===0 ? (
        <div style={{textAlign:"center",padding:"40px",color:"#64748b"}}>
          <div style={{fontSize:"32px",marginBottom:"8px"}}>✓</div>
          ما فيه فرص نقل واضحة حالياً<br/><span style={{fontSize:"11px"}}>التوزيع متوازن بين الفروع</span>
        </div>
      ) : (
        byContainer.map(c => (
          <button key={c.name} onClick={()=>setCont(c.name)}
            style={{width:"100%",background:"#0f1626",border:"1px solid #2d3a52",borderRadius:"14px",padding:"14px",textAlign:"right",cursor:"pointer",fontFamily:"Cairo"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:900,color:"#f0e6d0",fontSize:"14px"}}>📦 {c.name}</div>
                <div style={{fontSize:"11px",color:"#94a3b8",marginTop:"3px"}}>{c.factories.length} مصنع فيه فرصة نقل</div>
              </div>
              <div style={{color:"#3b82f6",fontWeight:900,fontSize:"18px"}}>←</div>
            </div>
          </button>
        ))
      )}
      </>)}
    </div>
  );
}
