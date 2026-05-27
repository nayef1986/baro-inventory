// ============================================================
// AIChat.jsx — مساعد ذكاء اصطناعي عبر Vercel proxy
// ============================================================

import { useState, useRef, useEffect, memo } from "react";
import { allBranches, totalPurchases, soldAllPeriods, num } from "../lib/calc.js";

function buildContext(products, periods, settings) {
  const branches = allBranches(periods);

  const productSummaries = products.slice(0, 150).map(p => {
    const bought  = totalPurchases(p);
    const sold    = soldAllPeriods(p.barcode, periods);
    const closing = Math.max(0, bought - sold);
    const soldPct = bought > 0 ? Math.round((sold / bought) * 100) : 0;
    return `${p.name} (${p.barcode}) | ${p.container} | شراء:${p.buyPrice} | بيع:${p.sellPrice} | مشتريات:${bought} | مباع:${sold} | متبقي:${closing} | ${soldPct}%`;
  }).join("\n");

  const branchSummaries = branches.map(branch => {
    const totals = periods.reduce((s, per) => {
      const data = per.sales?.[branch] ?? {};
      Object.values(data).forEach(v => { s.qty += (v.qty || 0); s.rev += (v.totalPrice || 0); });
      return s;
    }, { qty: 0, rev: 0 });
    return `${branch}: ${totals.qty} وحدة | ${totals.rev.toFixed(0)} ريال`;
  }).join("\n");

  return `أنت مساعد ذكي لنظام مخزون اسمه "${settings?.brandName || "البارو"}". أجب بالعربي فقط وبشكل مختصر.

الإحصاءات:
- المنتجات: ${products.length}
- الفروع: ${branches.length}
- الفترات: ${periods.length}
- الحد الأدنى للمخزون: ${settings?.minStock ?? 12}

الفروع:
${branchSummaries}

الفترات:
${periods.map(p => `${p.label} (${p.uploadDate})`).join(", ")}

المنتجات (${Math.min(150, products.length)} من ${products.length}):
${productSummaries}

المصانع:
${Object.entries(settings?.factories ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n") || "لا يوجد"}`;
}

const Message = memo(({ msg }) => (
  <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} mb-3`}>
    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm
      ${msg.role === "user"
        ? "bg-blue-600 text-white rounded-br-sm"
        : "bg-slate-700 text-slate-100 rounded-bl-sm"}`}>
      {msg.role === "assistant" && (
        <div className="text-xs text-blue-400 mb-1 font-bold">🤖 المساعد</div>
      )}
      <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
    </div>
  </div>
));

export default function AIChat({ products, periods, settings, onClose, model = "gemini" }) {
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const bottomRef = useRef();

  useEffect(() => {
    setMessages([{
      role: "assistant",
      content: `مرحباً! أنا مساعدك الذكي لنظام ${settings?.brandName || "البارو"}.\n\nأقدر أساعدك في:\n• تحليل المبيعات والمخزون\n• مقارنة الفروع والمنتجات\n• توصيات التكرار والشراء\n\nاسألني أي شيء! 🎯`,
    }]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg    = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const endpoint = model === "gemini" ? "/api/gemini-chat" : "/api/chat";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: buildContext(products, periods, settings),
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data  = await response.json();
      const reply = data.content ?? data.error ?? "عذراً، لم أتمكن من الرد.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "❌ حدث خطأ في الاتصال." }]);
    }

    setLoading(false);
  };

  const quickQ = [
    "أي منتج الأكثر مبيعاً؟",
    "أي فرع الأقوى؟",
    "منتجات نفد مخزونها؟",
    "اقترح منتجات للتكرار",
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      <div className="bg-gradient-to-r from-blue-900 to-purple-900 px-4 pt-12 pb-4 flex items-center gap-3 shrink-0">
        <span className="text-2xl">{model === "gemini" ? "✨" : "🤖"}</span>
        <div className="flex-1">
          <div className="font-black text-white">{model === "gemini" ? "Gemini" : "آمرني"}</div>
          <div className="text-xs text-blue-300">{products.length} منتج · {periods.length} فترة · {allBranches(periods).length} فرع</div>
        </div>
        <button onClick={onClose} className="text-white/70 hover:text-white text-xl w-8 h-8 flex items-center justify-center">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((msg, i) => <Message key={i} msg={msg} />)}
        {loading && (
          <div className="flex justify-start mb-3">
            <div className="bg-slate-700 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length <= 1 && (
        <div className="px-4 pb-2 flex gap-2 flex-wrap shrink-0">
          {quickQ.map(q => (
            <button key={q} onClick={() => setInput(q)}
              className="bg-slate-700 text-blue-300 text-xs px-3 py-1.5 rounded-xl border border-slate-600">
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="px-4 pb-6 pt-2 bg-slate-800 border-t border-slate-700 shrink-0">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="اسألني عن منتجاتك أو فروعك…"
            rows={1}
            className="flex-1 bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5
              text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500 resize-none"
            style={{ maxHeight: 100 }}
          />
          <button onClick={send} disabled={!input.trim() || loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white w-10 h-10
              rounded-xl flex items-center justify-center shrink-0 self-end">
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
