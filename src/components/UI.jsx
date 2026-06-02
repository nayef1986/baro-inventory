// ============================================================
// UI.jsx — مكونات الواجهة الأساسية
// ============================================================

import { memo, useState, useCallback, useEffect, useRef } from "react";
import { fmtN, fmtM, fmtPct } from "../lib/calc.js";

export { fmtN, fmtM, fmtPct };

export const Card = memo(({ children, className = "", onClick }) => (
  <div onClick={onClick} className={`bg-slate-800 border border-slate-700 rounded-2xl p-4 ${onClick ? "cursor-pointer active:scale-[0.98] transition-transform" : ""} ${className}`}>
    {children}
  </div>
));

const COLORS = {
  blue:   "bg-blue-600 hover:bg-blue-500 text-white",
  green:  "bg-emerald-600 hover:bg-emerald-500 text-white",
  red:    "bg-red-600 hover:bg-red-500 text-white",
  amber:  "bg-amber-500 hover:bg-amber-400 text-black",
  ghost:  "bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600",
  purple: "bg-purple-600 hover:bg-purple-500 text-white",
};

export const Btn = memo(({ children, onClick, color = "blue", className = "", disabled = false, sm = false }) => (
  <button onClick={onClick} disabled={disabled}
    className={`${COLORS[color] || COLORS.blue} ${sm ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm"} rounded-xl font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}>
    {children}
  </button>
));

const BADGE_COLORS = {
  green:  "bg-emerald-900/60 text-emerald-300 border-emerald-800/40",
  red:    "bg-red-900/60 text-red-300 border-red-800/40",
  amber:  "bg-amber-900/60 text-amber-300 border-amber-800/40",
  blue:   "bg-blue-900/60 text-blue-300 border-blue-800/40",
  slate:  "bg-slate-700 text-slate-300 border-slate-600",
};

export const Badge = memo(({ children, color = "slate" }) => (
  <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold border ${BADGE_COLORS[color] || BADGE_COLORS.slate}`}>
    {children}
  </span>
));

export const StatPill = memo(({ label, value, color = "text-slate-100" }) => (
  <div className="bg-slate-700/50 rounded-xl p-2 text-center">
    <div className={`font-black tabular-nums text-base ${color}`}>{value}</div>
    <div className="text-xs text-slate-500 mt-0.5">{label}</div>
  </div>
));

export const SearchBar = memo(({ value, onChange, placeholder = "🔍 بحث…" }) => (
  <input value={value} onChange={onChange} placeholder={placeholder}
    className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500" />
));

export const FilterChips = memo(({ options, active, onChange, label }) => (
  <div className="flex items-center gap-2 flex-wrap">
    {label && <span className="text-xs text-slate-500">{label}</span>}
    {options.map(({ key, label: lbl }) => (
      <button key={key} onClick={() => onChange(key)}
        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${active === key ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400 hover:text-slate-200"}`}>
        {lbl}
      </button>
    ))}
  </div>
));

export const EmptyState = memo(({ icon = "📭", title, subtitle }) => (
  <div className="text-center py-12">
    <div className="text-5xl mb-3">{icon}</div>
    <div className="font-black text-slate-300 text-base">{title}</div>
    {subtitle && <div className="text-sm text-slate-500 mt-1">{subtitle}</div>}
  </div>
));

export const ExportBar = memo(({ onExcel, onPrint }) => (
  <div className="flex gap-2">
    {onExcel && <Btn sm color="green" onClick={onExcel}>📊 Excel</Btn>}
    {onPrint && <Btn sm color="ghost" onClick={onPrint}>🖨️ طباعة</Btn>}
  </div>
));

export const SectionHeader = memo(({ icon, title, subtitle }) => (
  <div className="mb-3">
    <div className="flex items-center gap-2">
      {icon && <span className="text-lg">{icon}</span>}
      <span className="font-black text-slate-100 text-base">{title}</span>
    </div>
    {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
  </div>
));

export const BackBtn = memo(({ onClick, label = "رجوع" }) => (
  <button onClick={onClick} className="flex items-center gap-1.5 text-blue-400 text-sm font-bold mb-1 active:opacity-70">
    ← {label}
  </button>
));

export const ConfirmModal = memo(({ title, message, onConfirm, onCancel, confirmLabel = "تأكيد", confirmColor = "red" }) => (
  <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
    <div className="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-sm p-5">
      <div className="text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <h3 className="font-black text-slate-100 text-lg mb-2">{title}</h3>
        {message && <p className="text-sm text-slate-400 mb-5">{message}</p>}
        <div className="flex gap-2">
          <Btn color="ghost" onClick={onCancel} className="flex-1">إلغاء</Btn>
          <Btn color={confirmColor} onClick={onConfirm} className="flex-1">{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  </div>
));

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((msg, type = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2800);
  }, []);
  const ToastContainer = () => (
    <div className="fixed top-4 right-0 left-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
      {toasts.map(t => (
        <div key={t.id} className={`px-4 py-2.5 rounded-xl text-sm font-bold shadow-xl ${t.type === "error" ? "bg-red-600 text-white" : t.type === "warning" ? "bg-amber-500 text-black" : "bg-emerald-600 text-white"}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
  return { show, ToastContainer };
}

export const LoadingSpinner = memo(({ label = "جاري التحميل…" }) => (
  <div className="flex flex-col items-center justify-center min-h-screen gap-4">
    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    <div className="text-slate-400 text-sm">{label}</div>
  </div>
));

export const Select = memo(({ value, onChange, options, placeholder, className = "" }) => (
  <select value={value} onChange={onChange}
    className={`bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 ${className}`}>
    {placeholder && <option value="">{placeholder}</option>}
    {options.map(({ value: v, label: l }) => <option key={v} value={v}>{l}</option>)}
  </select>
));

export const NumberInput = memo(({ value, onChange, min, max, className = "" }) => (
  <input type="number" value={value} onChange={e => onChange(Number(e.target.value))} min={min} max={max}
    className={`bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm text-center font-black focus:outline-none focus:border-blue-500 ${className}`} />
));

export const ProgressBar = memo(({ value, max, color = "bg-blue-500" }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
});

// ─── NavBar ──────────────────────────────────────────────────

const NAV_ITEMS = [
  { key: "containers", icon: "📦", label: "كونتينر" },
  { key: "sales",      icon: "📊", label: "مبيعات" },
  { key: "branches",   icon: "🏪", label: "الفروع" },
  { key: "needs",      icon: "🔍", label: "احتياج" },
  { key: "reports",    icon: "📋", label: "تقارير" },
];

export const NavBar = memo(({ active, onChange }) => (
  <nav style={{
    position:"fixed", bottom:0, right:0, left:0, zIndex:50,
    paddingBottom:"env(safe-area-inset-bottom, 0px)",
    WebkitBackfaceVisibility:"hidden", transform:"translateZ(0)", willChange:"transform",
    background:"rgba(15,23,42,0.85)",
    backdropFilter:"blur(24px) saturate(1.8)", WebkitBackdropFilter:"blur(24px) saturate(1.8)",
    borderTop:"1px solid rgba(255,255,255,0.06)",
    boxShadow:"0 -1px 0 rgba(255,255,255,0.04), 0 -8px 32px rgba(0,0,0,0.3)",
  }}>
    <div style={{display:"flex",maxWidth:"440px",margin:"0 auto"}}>
      {NAV_ITEMS.map(({ key, icon, label }) => (
        <button key={key} onClick={() => onChange(key)}
          style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"3px",padding:"10px 4px 8px",border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit",WebkitTapHighlightColor:"transparent",transition:"transform 0.15s ease",transform:"scale(1)"}}
          onTouchStart={e => e.currentTarget.style.transform="scale(0.88)"}
          onTouchEnd={e => e.currentTarget.style.transform="scale(1)"}>
          <span style={{fontSize: active===key ? "26px" : "22px",lineHeight:1,padding:"6px 14px",borderRadius:"100px",background: active===key ? "rgba(96,165,250,0.15)" : "transparent",transition:"all 0.2s ease",display:"block",filter: active===key ? "none" : "opacity(0.5)"}}>{icon}</span>
        </button>
      ))}
    </div>
  </nav>
));
