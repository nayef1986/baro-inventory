import { useState } from "react";
import { TYPES, S, fm, fp } from "./constants.js";

function GeminiGen({ productName, productImage, onAddToCard }) {
  const [style,    setStyle]    = useState("studio");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState("");

  const STYLES = [
    { key:"studio",    icon:"📸", label:"استوديو",  en:"white marble surface, soft studio lighting, clean background, luxury aesthetic" },
    { key:"model",     icon:"👗", label:"موديل",    en:"held by fashion model, lifestyle photography, natural lighting, modern aesthetic" },
    { key:"lifestyle", icon:"🌿", label:"لايف ستايل",en:"flat lay on aesthetic background, flowers and natural elements, soft pastel colors" },
    { key:"dramatic",  icon:"🔥", label:"دراما",    en:"dramatic dark background, cinematic lighting, luxury premium feel, moody atmosphere" },
  ];

  const buildPrompt = () => {
    const s = STYLES.find(x=>x.key===style);
    return "Professional product photography of " + productName + ", " + s.en + ", Instagram ready, high resolution, commercial quality photo";
  };

  const generate = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/gemini-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: buildPrompt(), imageBase64: productImage ?? null }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setResult(data.image);
    } catch(e) {
      setError("حدث خطأ: " + e.message);
    }
    setLoading(false);
  };

  const s = STYLES.find(x=>x.key===style);

  return (
    <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(168,159,196,0.25)",borderRadius:"16px",padding:"16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"14px"}}>
        <span style={{fontSize:"20px"}}>🤖</span>
        <div>
          <div style={{fontSize:"15px",fontWeight:"900",color:"#ffffff"}}>أنشئ صورة بـ Gemini</div>
          <div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)",marginTop:"2px"}}>{productName}</div>
        </div>
      </div>

      {/* الأسلوب */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"7px",marginBottom:"14px"}}>
        {STYLES.map(st=>(
          <button key={st.key} onClick={()=>setStyle(st.key)} style={{padding:"10px",borderRadius:"12px",border:"none",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontSize:"13px",fontWeight:"700",
            background:style===st.key?"rgba(168,159,196,0.2)":"rgba(255,255,255,0.04)",
            color:style===st.key?"#a89fc4":"rgba(255,255,255,0.4)",
            border:style===st.key?"1px solid rgba(168,159,196,0.4)":"1px solid rgba(255,255,255,0.07)",
            display:"flex",alignItems:"center",gap:"6px",justifyContent:"center",
          }}>
            <span style={{fontSize:"18px"}}>{st.icon}</span>{st.label}
          </button>
        ))}
      </div>

      {/* البرومت */}
      <div style={{background:"rgba(0,0,0,0.3)",borderRadius:"11px",padding:"10px 13px",marginBottom:"14px"}}>
        <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginBottom:"5px",fontWeight:"700",letterSpacing:"0.05em"}}>البرومت التلقائي</div>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.55)",lineHeight:"1.6",direction:"ltr",textAlign:"left"}}>{buildPrompt()}</div>
      </div>

      {/* زر الإنشاء */}
      <button onClick={generate} disabled={loading} style={{width:"100%",padding:"13px",borderRadius:"13px",border:"none",background:loading?"rgba(168,159,196,0.1)":"linear-gradient(135deg,#a89fc4,#8b82a8)",color:"#ffffff",fontSize:"14px",fontWeight:"900",cursor:loading?"not-allowed":"pointer",fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",opacity:loading?0.7:1}}>
        {loading ? <><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>⏳</span> جاري الإنشاء…</> : <><span>✨</span> أنشئ الصورة</>}
      </button>

      {/* النتيجة */}
      {result && (
        <div style={{marginTop:"14px"}}>
          <div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)",marginBottom:"8px",fontWeight:"700"}}>النتيجة:</div>
          {typeof result === "string" && result.startsWith("data:") ? (
            <img src={result} alt="AI" style={{width:"100%",borderRadius:"14px",marginBottom:"10px",maxHeight:"250px",objectFit:"cover"}} />
          ) : (
            <div style={{width:"100%",height:"180px",borderRadius:"14px",background:"linear-gradient(135deg,rgba(168,159,196,0.2),rgba(212,168,83,0.1))",border:"1px solid rgba(168,159,196,0.3)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"8px",marginBottom:"10px"}}>
              <span style={{fontSize:"40px"}}>🎨</span>
              <div style={{fontSize:"13px",color:"rgba(255,255,255,0.5)"}}>صورة {s.label} احترافية</div>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
            <button onClick={()=>onAddToCard&&onAddToCard("gemini-result")} style={{padding:"11px",borderRadius:"12px",border:"1px solid rgba(168,159,196,0.35)",background:"rgba(168,159,196,0.15)",color:"#ffffff",fontSize:"13px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>
              ➕ أضف للبطاقة
            </button>
            <button onClick={()=>{
              if(result&&result.startsWith("data:")){
                const a=document.createElement("a");a.href=result;
                a.download="product-ai-"+Date.now()+".jpg";a.click();
              }
            }} style={{padding:"11px",borderRadius:"12px",border:"1px solid rgba(37,211,102,0.3)",background:"rgba(37,211,102,0.08)",color:"#25d166",fontSize:"13px",fontWeight:"700",cursor:"pointer",fontFamily:"Cairo,sans-serif"}}>
              💾 حفظ الصورة
            </button>
          </div>
        </div>
      )}

      {error && <div style={{marginTop:"10px",fontSize:"13px",color:"#e8855a",textAlign:"center"}}>{error}</div>}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── البطاقة ──────────────────────────────────────────────────

function CardTab({ initType, initProd }) {
  const [type,   setType]   = useState(initType  ?? "discount");
  const [title,  setTitle]  = useState(initProd ? "خصم خاص — "+initProd.name : "");
  const [expiry, setExpiry] = useState("");
  const [oldP,   setOldP]   = useState(String(initProd?.sellPrice ?? ""));
  const [newP,   setNewP]   = useState(initProd ? String((initProd.sellPrice*0.75).toFixed(1)) : "");

  const t      = TYPES.find(x=>x.key===type) ?? TYPES[0];
  const oldNum = parseFloat(oldP)||0;
  const newNum = parseFloat(newP)||0;
  const disc   = oldNum>0&&newNum>0 ? Math.round((1-newNum/oldNum)*100) : 0;
  const buy    = initProd?.buyPrice ?? 0;
  const profit = newNum - buy;
  const margin = buy>0 ? ((newNum-buy)/buy)*100 : 0;
  const tl     = margin>=20?"green":margin>=0?"amber":"red";
  const TLC    = {green:"#8aab8e",amber:"#d4a853",red:"#e8855a"};
  const TLL    = {green:"🟢 آمن — ربح جيد",amber:"🟡 هامش ضعيف",red:"🔴 خطر — خسارة"};

  const TEMPLATES = [
    {type:"discount",title:"خصم [X]% على [المنتج]"},
    {type:"bundle",  title:"[منتج 1] + [منتج 2] كومبو"},
    {type:"clear",   title:"تصفية — [المنتج] بسعر التكلفة"},
    {type:"seasonal",title:"عرض [الموسم] — [المنتج]"},
    {type:"buy3",    title:"اشتري 3 واحصل على خصم"},
  ];

  const sendMsg = () => {
    const msg = "🎯 طلب عرض — البارو\n━━━━━━━━━━━━\n" +
      t.icon+" "+t.label+"\n"+
      (title?"العنوان: "+title+"\n":"") +
      (initProd?"المنتج: "+initProd.name+"\n":"") +
      (oldNum?"السعر القديم: "+oldNum+" ﷼\n":"") +
      (newNum?"السعر الجديد: "+newNum+" ﷼\n":"") +
      (disc?"الخصم: "+disc+"%\n":"") +
      (expiry?"ينتهي: "+expiry+"\n":"") +
      "━━━━━━━━━━━━\nيرجى التنفيذ في Odoo 🙏";
    navigator.clipboard.writeText(msg)
      .then(()=>alert("✅ تم النسخ — افتح واتساب وألصق"))
      .catch(()=>alert(msg));
  };

  const inp = (val, set, label, ph, type="text") => (
    <div>
      <div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)",marginBottom:"6px"}}>{label}</div>
      <input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph}
        style={{width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(212,168,83,0.15)",borderRadius:"12px",padding:"11px 14px",color:S.white,fontSize:"14px",fontFamily:"Cairo,sans-serif",outline:"none"}} />
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>

      {/* نوع العرض */}
      <div style={{background:S.card,border:"1px solid "+S.border,borderRadius:S.rs,padding:"16px"}}>
        <div style={{fontSize:"13px",fontWeight:"700",color:"rgba(212,168,83,0.6)",marginBottom:"12px"}}>نوع العرض</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px"}}>
          {TYPES.map(ot=>(
            <button key={ot.key} onClick={()=>setType(ot.key)} style={{padding:"11px 6px",borderRadius:"13px",border:"none",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontSize:"12px",fontWeight:"700",background:type===ot.key?ot.color+"20":"rgba(255,255,255,0.04)",color:type===ot.key?ot.color:"rgba(255,255,255,0.35)",border:type===ot.key?"1px solid "+ot.color+"45":"1px solid rgba(255,255,255,0.07)",display:"flex",flexDirection:"column",alignItems:"center",gap:"5px",transition:"all 0.2s"}}>
              <span style={{fontSize:"22px"}}>{ot.icon}</span>{ot.label}
            </button>
          ))}
        </div>
      </div>

      {/* قوالب */}
      <div style={{background:S.card,border:"1px solid "+S.border,borderRadius:S.rs,padding:"16px"}}>
        <div style={{fontSize:"13px",fontWeight:"700",color:"rgba(212,168,83,0.6)",marginBottom:"11px"}}>⚡ قوالب جاهزة</div>
        {TEMPLATES.map((tm,i)=>{
          const tmT = TYPES.find(x=>x.key===tm.type);
          return (
            <button key={i} onClick={()=>{setType(tm.type);setTitle(tm.title);}} style={{display:"flex",alignItems:"center",gap:"10px",padding:"11px 13px",borderRadius:"12px",border:"1px solid rgba(255,255,255,0.07)",background:"rgba(255,255,255,0.03)",cursor:"pointer",fontFamily:"Cairo,sans-serif",textAlign:"right",width:"100%",marginBottom:"6px"}}>
              <span style={{fontSize:"18px",flexShrink:0}}>{tmT?.icon}</span>
              <div style={{flex:1,minWidth:0,fontSize:"14px",fontWeight:"700",color:"rgba(255,255,255,0.75)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tm.title}</div>
              <span style={{fontSize:"12px",color:"rgba(255,255,255,0.25)",flexShrink:0}}>←</span>
            </button>
          );
        })}
      </div>

      {/* التفاصيل */}
      <div style={{background:S.card,border:"1px solid "+S.border,borderRadius:S.rs,padding:"16px",display:"flex",flexDirection:"column",gap:"11px"}}>
        <div style={{fontSize:"13px",fontWeight:"700",color:"rgba(212,168,83,0.6)"}}>✏️ تفاصيل العرض</div>
        {inp(title,setTitle,"العنوان*","اكتب عنوان العرض")}
        {inp(expiry,setExpiry,"تاريخ الانتهاء","مثال: 30 مايو 2026")}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"9px"}}>
          {inp(oldP,setOldP,"السعر القديم ﷼","0","number")}
          {inp(newP,setNewP,"السعر الجديد ﷼","0","number")}
        </div>
      </div>

      {/* Gemini AI */}
      {initProd && <GeminiGen productName={initProd.name} productImage={initProd.barcode && images?.[initProd.barcode] || null} onAddToCard={(img)=>{}} />}

      {/* حاسبة الربح */}
      {oldNum>0&&newNum>0&&buy>0 && (
        <div style={{padding:"16px",borderRadius:"14px",background:TLC[tl]+"08",border:"1px solid "+TLC[tl]+"25"}}>
          <div style={{fontSize:"15px",fontWeight:"900",color:TLC[tl],marginBottom:"12px"}}>{TLL[tl]}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px"}}>
            {[["سعر الشراء",buy+" ﷼","rgba(255,255,255,0.45)"],["الربح",profit.toFixed(1)+" ﷼",TLC[tl]],["الهامش",margin.toFixed(1)+"%",TLC[tl]]].map(([l,v,c])=>(
              <div key={l} style={{background:"rgba(255,255,255,0.04)",borderRadius:"10px",padding:"10px",textAlign:"center"}}>
                <div style={{fontSize:"15px",fontWeight:"900",color:c}}>{v}</div>
                <div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)",marginTop:"3px"}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* معاينة */}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
        <div style={{fontSize:"12px",color:"rgba(212,168,83,0.5)",fontWeight:"700",letterSpacing:"0.1em"}}>معاينة البطاقة — A5 عمودي</div>
        <div style={{width:"100%",maxWidth:"320px",background:"#0d0b06",borderRadius:"22px",overflow:"hidden",border:"1.5px solid "+t.color+"28",boxShadow:"0 8px 40px "+t.color+"12"}}>
          <div style={{background:"linear-gradient(135deg,"+t.color+"ee,"+t.color+"99)",padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:"9px"}}>
              <span style={{fontSize:"24px"}}>{t.icon}</span>
              <span style={{fontSize:"18px",fontWeight:"900",color:"#0a0804"}}>{t.label}</span>
            </div>
            <span style={{fontSize:"13px",color:"rgba(10,8,4,0.5)"}}>البارو</span>
          </div>
          <div style={{height:"120px",display:"flex",gap:"1px",borderBottom:"1px solid "+t.color+"15"}}>
            {[1,2,3].map(i=>(
              <div key={i} style={{flex:1,background:"rgba(255,245,220,0.03)",display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.12)",fontSize:"22px",borderLeft:i>1?"1px solid "+t.color+"10":"none"}}>📷</div>
            ))}
          </div>
          <div style={{padding:"16px 18px 14px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{fontSize:"18px",fontWeight:"900",color:S.white,lineHeight:"1.3"}}>{title||"عنوان العرض"}</div>
          </div>
          <div style={{padding:"14px 18px",background:t.color+"08",borderBottom:"1px solid "+t.color+"12",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              {oldNum>0&&<div style={{fontSize:"13px",color:"rgba(255,255,255,0.3)",textDecoration:"line-through",marginBottom:"4px"}}>{oldNum} ﷼</div>}
              <div style={{fontSize:"28px",fontWeight:"900",color:t.color,lineHeight:1}}>{newNum||"—"} <span style={{fontSize:"14px"}}>﷼</span></div>
            </div>
            {disc>0&&<div style={{background:"linear-gradient(135deg,"+t.color+","+t.color+"99)",borderRadius:"13px",padding:"10px 16px",textAlign:"center",color:"#0a0804",fontWeight:"900"}}><div style={{fontSize:"22px",lineHeight:1}}>{disc}%</div><div style={{fontSize:"10px",marginTop:"2px"}}>خصم</div></div>}
          </div>
          {expiry&&<div style={{padding:"11px 18px",background:"rgba(0,0,0,0.3)",fontSize:"13px",color:"rgba(255,255,255,0.3)",display:"flex",gap:"7px"}}><span>⏰</span><span>ينتهي: {expiry}</span></div>}
        </div>

        <div style={{width:"100%",maxWidth:"320px",display:"flex",flexDirection:"column",gap:"10px"}}>
          <button style={{width:"100%",padding:"14px",borderRadius:"14px",border:"none",background:"linear-gradient(135deg,#d4a853,#b8935a)",color:"#0a0804",fontSize:"15px",fontWeight:"900",cursor:"pointer",fontFamily:"Cairo,sans-serif",boxShadow:"0 4px 20px rgba(212,168,83,0.3)"}}>🖨️ طباعة A5 / حفظ PDF</button>
          <button onClick={sendMsg} style={{width:"100%",padding:"14px",borderRadius:"14px",border:"1px solid rgba(37,211,102,0.35)",background:"rgba(37,211,102,0.1)",color:"#25d166",fontSize:"15px",fontWeight:"900",cursor:"pointer",fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px"}}>
            <span style={{fontSize:"20px"}}>📋</span> نسخ رسالة Odoo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── الشاشة الرئيسية ─────────────────────────────────────────

export { GeminiGen, CardTab };
