// AIChat.jsx — واجهة محادثة احترافية
import { useState, useRef, useEffect, useCallback, memo } from "react";

function buildContext(products, periods, settings) {
  const totalProducts = products?.length ?? 0;
  const totalPeriods  = periods?.length ?? 0;
  const lastPer = periods?.[periods.length - 1];
  const totalSold = lastPer
    ? Object.values(lastPer.sales ?? {}).reduce((s, b) =>
        s + Object.values(b).reduce((ss, v) => ss + (v.qty || 0), 0), 0)
    : 0;

  const topProducts = products?.slice(0, 10).map(p => p.name).join("، ") ?? "";

  return `أنت مساعد ذكي متخصص في نظام إدارة مخزون "البارو".

بيانات النظام:
- عدد المنتجات: ${totalProducts}
- عدد الفترات: ${totalPeriods}
- إجمالي مباع في آخر فترة: ${totalSold.toLocaleString()} وحدة
- أمثلة منتجات: ${topProducts}
- اسم البراند: ${settings?.brandName ?? "البارو"}

أجب بالعربية دائماً. كن مختصراً وعملياً. ساعد في قرارات المخزون والمبيعات.`;
}

// ─── رسالة واحدة ─────────────────────────────────────────────

const Message = memo(({ msg }) => {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display:"flex",
      justifyContent: isUser ? "flex-start" : "flex-end",
      marginBottom:"10px",
      padding:"0 4px",
    }}>
      <div style={{
        maxWidth:"82%",
        padding:"10px 14px",
        borderRadius: isUser ? "18px 18px 18px 4px" : "18px 18px 4px 18px",
        background: isUser
          ? "rgba(255,255,255,0.08)"
          : "linear-gradient(135deg,rgba(99,102,241,0.3),rgba(168,85,247,0.3))",
        border: isUser
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid rgba(99,102,241,0.3)",
        fontSize:"14px",
        lineHeight:"1.6",
        color:"#f1f5f9",
        wordBreak:"break-word",
        whiteSpace:"pre-wrap",
      }}>
        {msg.content}
      </div>
    </div>
  );
});

// ─── Typing Animation ─────────────────────────────────────────

const TypingDots = () => (
  <div style={{display:"flex",justifyContent:"flex-end",marginBottom:"10px",padding:"0 4px"}}>
    <div style={{
      padding:"12px 16px",borderRadius:"18px 18px 4px 18px",
      background:"linear-gradient(135deg,rgba(99,102,241,0.2),rgba(168,85,247,0.2))",
      border:"1px solid rgba(99,102,241,0.2)",
      display:"flex",gap:"5px",alignItems:"center",
    }}>
      {[0,1,2].map(i => (
        <div key={i} style={{
          width:"7px",height:"7px",borderRadius:"50%",
          background:"rgba(148,163,184,0.6)",
          animation:`bounce 1.2s ${i*0.2}s infinite`,
        }} />
      ))}
      <style>{`@keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}`}</style>
    </div>
  </div>
);

// ─── المحادثة الرئيسية ────────────────────────────────────────

export default function AIChat({ products, periods, settings, onClose, model = "gemini" }) {
  const [messages, setMessages] = useState([{
    role:"assistant",
    content: model === "gemini"
      ? "مرحباً! أنا Gemini — اسألني عن منتجاتك أو فروعك أو المبيعات 🚀"
      : "مرحباً! أنا آمرني — اسألني أي شيء عن نظامك 🤖",
  }]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const messagesEndRef = useRef(null);
  const textareaRef    = useRef(null);
  const abortRef       = useRef(null);

  // Scroll للأسفل عند رسالة جديدة
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages, loading]);

  // نضبط ارتفاع textarea تلقائياً
  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError("");
    if (textareaRef.current) textareaRef.current.style.height = "44px";

    const newMessages = [...messages, { role:"user", content:text }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const endpoint = model === "gemini" ? "/api/gemini-chat" : "/api/chat";
      const res = await fetch(endpoint, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          system: buildContext(products, periods, settings),
          messages: newMessages.filter(m => m.role !== "system"),
        }),
      });

      const data = await res.json();

      if (data.error) throw new Error(data.error);

      const reply = data.content?.[0]?.text ?? data.text ?? "حدث خطأ";
      setMessages(p => [...p, { role:"assistant", content:reply }]);

    } catch (err) {
      setError(err.message);
      setMessages(p => [...p, {
        role:"assistant",
        content:`❌ ${err.message.includes("not found") ? "الموديل غير متاح حالياً، جرب لاحقاً" : err.message}`,
      }]);
    }

    setLoading(false);
  }, [input, loading, messages, model, products, periods, settings]);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const isGemini = model === "gemini";
  const gradBg   = isGemini
    ? "linear-gradient(135deg,#4f46e5,#7c3aed)"
    : "linear-gradient(135deg,#1d4ed8,#4f46e5)";

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:60,
      background:"#0a0f1e",
      display:"flex", flexDirection:"column",
      fontFamily:"Cairo,sans-serif", direction:"rtl",
    }}>

      {/* ─── هيدر ─────────────────────────────────── */}
      <div style={{
        background: gradBg,
        padding:"14px 16px",
        paddingTop:"calc(14px + env(safe-area-inset-top, 0px))",
        display:"flex", alignItems:"center", gap:"12px",
        flexShrink:0,
        boxShadow:"0 2px 20px rgba(0,0,0,0.3)",
      }}>
        <span style={{fontSize:"24px"}}>{isGemini?"✨":"🤖"}</span>
        <div style={{flex:1}}>
          <div style={{fontWeight:"900",color:"#fff",fontSize:"16px"}}>
            {isGemini ? "Gemini" : "آمرني"}
          </div>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.6)",marginTop:"1px"}}>
            {products?.length} منتج · {periods?.length} فترة
          </div>
        </div>
        <button onClick={onClose} style={{
          width:"36px",height:"36px",borderRadius:"50%",
          background:"rgba(255,255,255,0.15)",border:"none",
          color:"#fff",fontSize:"18px",cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",
        }}>✕</button>
      </div>

      {/* ─── الرسائل ───────────────────────────────── */}
      <div style={{
        flex:1, overflowY:"auto", padding:"16px 8px",
        paddingBottom:"160px", // مساحة للـ input
        WebkitOverflowScrolling:"touch",
      }}>
        {messages.map((msg, i) => <Message key={i} msg={msg} />)}
        {loading && <TypingDots />}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── Input Bar ─────────────────────────────── */}
      <div style={{
        position:"fixed",
        bottom:"calc(0px + env(safe-area-inset-bottom, 0px))",
        right:0, left:0,
        background:"rgba(10,15,30,0.98)",
        backdropFilter:"blur(20px)",
        borderTop:"1px solid rgba(255,255,255,0.08)",
        padding:"10px 12px",
        zIndex:61,
      }}>
        <div style={{
          display:"flex",alignItems:"flex-end",gap:"8px",
          maxWidth:"440px",margin:"0 auto",
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => { setInput(e.target.value); adjustHeight(); }}
            onKeyDown={handleKey}
            placeholder={isGemini ? "اسأل Gemini…" : "اسألني…"}
            rows={1}
            style={{
              flex:1,
              background:"rgba(255,255,255,0.06)",
              border:"1px solid rgba(255,255,255,0.12)",
              borderRadius:"14px",
              padding:"11px 14px",
              color:"#f1f5f9",
              fontSize:"14px",
              fontFamily:"Cairo,sans-serif",
              outline:"none",
              resize:"none",
              lineHeight:"1.5",
              minHeight:"44px",
              maxHeight:"120px",
              direction:"rtl",
            }}
            autoFocus
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              width:"44px",height:"44px",borderRadius:"14px",border:"none",
              background: input.trim() && !loading ? gradBg : "rgba(255,255,255,0.06)",
              color:"#fff",fontSize:"18px",cursor: input.trim()?"pointer":"default",
              display:"flex",alignItems:"center",justifyContent:"center",
              flexShrink:0,transition:"background 0.2s",
              opacity: loading || !input.trim() ? 0.4 : 1,
            }}
          >{loading ? "⏳" : "↑"}</button>
        </div>
      </div>
    </div>
  );
}
