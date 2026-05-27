// ============================================================
// App.jsx — التطبيق الرئيسي
// ============================================================

import { useState, useEffect, useCallback, useMemo, useReducer } from "react";
import {
  initStorage, loadAll,
  saveProducts, addPeriod, deletePeriod,
  saveSettings, saveImage, deleteImage, clearAll,
} from "./lib/storage.js";
import ContainersScreen from "./screens/Containers.jsx";
import SalesScreen      from "./screens/Sales.jsx";
import BranchesScreen   from "./screens/Branches.jsx";
import CompareScreen    from "./screens/Compare.jsx";
import IdeasScreen      from "./screens/Ideas/index.jsx";
import ReportsScreen    from "./screens/Reports.jsx";
import SettingsScreen   from "./screens/Settings.jsx";
import AIChat           from "./components/AIChat.jsx";
import { LoadingSpinner, NavBar } from "./components/UI.jsx";

// ─── State ───────────────────────────────────────────────────

const INIT_STATE = {
  products: [],
  periods:  [],
  settings: { brandName: "البارو", minStock: 12, factories: {} },
  images:   {},
  loading:  true,
  error:    null,
};

function reducer(state, action) {
  switch (action.type) {
    case "LOADED":
      return { ...state, ...action.payload, loading: false };
    case "SET_PRODUCTS":
      return { ...state, products: action.payload };
    case "SET_PERIODS":
      return { ...state, periods: action.payload };
    case "SET_SETTINGS":
      return { ...state, settings: action.payload };
    case "SET_IMAGES":
      return { ...state, images: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };
    case "CLEAR":
      return { ...INIT_STATE, loading: false };
    default:
      return state;
  }
}

// ─── App ─────────────────────────────────────────────────────

export default function App() {
  const [state,    dispatch] = useReducer(reducer, INIT_STATE);
  const [screen,   setScreen]   = useState("containers");
  const [showAI,   setShowAI]   = useState(false);
  const [aiModel,  setAiModel]  = useState("gemini");

  // نحسب branchSummary مرة واحدة عند تغيير البيانات
  const branchSummary = useMemo(() => {
    const products = state.products;
    const periods  = state.periods;
    if (!products.length || !periods.length) return {};

    // productMap للأسعار
    const productMap = {};
    products.forEach(p => {
      productMap[p.barcode] = Number(p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
    });

    // نجمع كل الفروع
    const allBranches = new Set();
    periods.forEach(per => {
      Object.keys(per.sales ?? {}).forEach(b => allBranches.add(b));
    });

    // نحسب لكل فرع دفعة واحدة
    const summary = {};
    allBranches.forEach(branch => {
      let qty = 0, rev = 0, cost = 0;
      periods.forEach(per => {
        const data = per.sales?.[branch] ?? {};
        Object.entries(data).forEach(([barcode, v]) => {
          const q = Number(v.qty ?? 0);
          qty  += q;
          rev  += Number(v.totalPrice ?? 0);
          cost += q * (productMap[barcode] ?? 0);
        });
      });
      const profit   = rev - cost;
      const perfLevel = rev > 0
        ? (profit/rev > 0.3 ? "green" : profit/rev > 0.1 ? "amber" : "red")
        : "red";
      summary[branch] = { qty, rev, profit, perfLevel };
    });

    return summary;
  }, [state.products, state.periods]);
  const [showSettings, setShowSettings] = useState(false);

  // تحميل البيانات
  useEffect(() => {
    (async () => {
      try {
        await initStorage();
        const data = await loadAll();
        dispatch({ type: "LOADED", payload: data });
      } catch (e) {
        dispatch({ type: "SET_ERROR", payload: e.message });
      }
    })();
  }, []);

  // Handlers
  const handleUpdateProducts = useCallback(async (products) => {
    dispatch({ type: "SET_PRODUCTS", payload: products });
    await saveProducts(products);
  }, []);

  // حذف كونتينر مع عكس الكميات
  const handleDeleteContainer = useCallback(async (container) => {
    // نحذف كل المنتجات التابعة لهذا الكونتينر
    const updatedProducts = state.products.filter(p => p.container !== container);
    dispatch({ type: "SET_PRODUCTS", payload: updatedProducts });
    await saveProducts(updatedProducts);
    return { ok: true };
  }, [state.products]);

  const handleAddPeriod = useCallback(async (period) => {
    const result = await addPeriod(period);
    if (result.ok) {
      const newPeriods = [...state.periods, period].slice(-52);
      dispatch({ type: "SET_PERIODS", payload: newPeriods });
    }
    return result;
  }, [state.periods]);

  const handleDeletePeriod = useCallback(async (periodId) => {
    await deletePeriod(periodId);
    dispatch({ type: "SET_PERIODS", payload: state.periods.filter(p => p.id !== periodId) });
  }, [state.periods]);

  const handleSaveSettings = useCallback(async (settings) => {
    dispatch({ type: "SET_SETTINGS", payload: settings });
    return await saveSettings(settings);
  }, []);

  const handleSaveImage = useCallback(async (key, base64) => {
    const result = await saveImage(key, base64);
    if (result.ok) {
      dispatch({ type: "SET_IMAGES", payload: { ...state.images, [key]: base64 } });
    }
    return result;
  }, [state.images]);

  const handleBulkSaveImage = useCallback(async (barcode, base64) => {
    // نتحقق إذا الباركود موجود في المنتجات
    const exists = state.products.find(p => p.barcode === barcode);
    if (!exists) return { ok: false };
    const result = await saveImage(barcode, base64);
    if (result.ok) {
      dispatch({ type: "SET_IMAGES", payload: { ...state.images, [barcode]: base64 } });
    }
    return result;
  }, [state.products, state.images]);

  const handleRemoveImage = useCallback(async (key) => {
    const result = await deleteImage(key);
    if (result.ok) {
      const images = { ...state.images };
      delete images[key];
      dispatch({ type: "SET_IMAGES", payload: images });
    }
    return result;
  }, [state.images]);

  const handleClearAll = useCallback(async () => {
    await clearAll();
    dispatch({ type: "CLEAR" });
  }, []);

  // عرض
  if (state.loading) return <LoadingSpinner label="جاري التحميل…" />;

  if (state.error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <div className="text-5xl">❌</div>
        <div className="text-red-400 font-bold text-center">{state.error}</div>
        <button onClick={() => window.location.reload()}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const totalSold = state.periods.reduce((s, per) =>
    s + Object.values(per.sales ?? {}).reduce((ss, d) =>
      ss + Object.values(d).reduce((sss, v) => sss + (v.qty || 0), 0), 0), 0);

  const screenProps = {
    products:         state.products,
    periods:          state.periods,
    settings:         state.settings,
    images:           state.images,
    onUpdateProducts: handleUpdateProducts,
    onAddPeriod:      handleAddPeriod,
    onDeletePeriod:   handleDeletePeriod,
    onGetPeriods:     () => state.periods,
    onSaveSettings:   handleSaveSettings,
    branchSummary:    branchSummary,
    onSaveImage:      handleSaveImage,
    onRemoveImage:    handleRemoveImage,
    onClearAll:       handleClearAll,
  };

  const SCREENS = {
    containers: <ContainersScreen {...screenProps} />,
    sales:      <SalesScreen      {...screenProps} />,
    branches:   <BranchesScreen   {...screenProps} />,
    ideas:      <IdeasScreen     products={state.products} periods={state.periods} settings={state.settings} images={state.images} onSaveImage={handleSaveImage} onRemoveImage={handleRemoveImage} />,
    compare:    <CompareScreen     {...screenProps} images={state.images} onSaveImage={handleSaveImage} onRemoveImage={handleRemoveImage} />,
    reports:    <ReportsScreen     {...screenProps} />,
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* هيدر */}
      <header style={{
          position:"fixed",top:0,right:0,left:0,
          background:"rgba(15,23,42,0.92)",
          backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
          borderBottom:"1px solid rgba(255,255,255,0.06)",
          zIndex:20,padding:"10px 16px",
        }}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",maxWidth:"440px",margin:"0 auto"}}>

          {/* يسار: إعدادات */}
          <button onClick={() => setShowSettings(true)} style={{
            width:"38px",height:"38px",borderRadius:"12px",border:"1px solid rgba(255,255,255,0.1)",
            background:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:"18px",cursor:"pointer",flexShrink:0,
          }}>⚙️</button>

          {/* وسط: الاسم */}
          <div style={{textAlign:"center",flex:1,padding:"0 12px"}}>
            <div style={{fontWeight:"900",color:"#ffffff",fontSize:"16px",lineHeight:1}}>{state.settings.brandName}</div>
            <div style={{fontSize:"11px",color:"rgba(148,163,184,0.6)",marginTop:"2px"}}>
              {state.products.length} منتج · {state.periods.length} فترة
            </div>
          </div>

          {/* يمين: أزرار أيقونات فقط */}
          <div style={{display:"flex",gap:"6px",flexShrink:0}}>
            <a href="https://baro-ideas-gamma.vercel.app" target="_blank" rel="noopener noreferrer"
              style={{width:"38px",height:"38px",borderRadius:"12px",background:"rgba(217,119,6,0.2)",border:"1px solid rgba(217,119,6,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px",textDecoration:"none"}}>
              💡
            </a>
            <button onClick={() => { setAiModel("gemini"); setShowAI(true); }} style={{
              width:"38px",height:"38px",borderRadius:"12px",background:"rgba(168,85,247,0.2)",
              border:"1px solid rgba(168,85,247,0.3)",display:"flex",alignItems:"center",
              justifyContent:"center",fontSize:"18px",cursor:"pointer",
            }}>✨</button>
            <button onClick={() => { setAiModel("claude"); setShowAI(true); }} style={{
              width:"38px",height:"38px",borderRadius:"12px",background:"rgba(37,99,235,0.2)",
              border:"1px solid rgba(37,99,235,0.3)",display:"flex",alignItems:"center",
              justifyContent:"center",fontSize:"18px",cursor:"pointer",
            }}>🤖</button>
          </div>
        </div>
      </header>

      {/* المحتوى */}
      <main className="pt-20 pb-24 px-4 max-w-lg mx-auto">
        {SCREENS[screen] ?? SCREENS.containers}
      </main>

      {/* شاشة الإعدادات */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900 z-40 overflow-y-auto">
          <div className="px-4 pt-4 pb-24 max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setShowSettings(false)} className="text-blue-400 font-bold text-sm flex items-center gap-1">
                ← رجوع
              </button>
              <div className="font-black text-slate-100">الإعدادات</div>
              <div className="w-16" />
            </div>
            <SettingsScreen
              products={state.products}
              periods={state.periods}
              settings={state.settings}
              onSaveSettings={handleSaveSettings}
              onClearAll={handleClearAll}
              onBulkSaveImage={handleBulkSaveImage}
            />
          </div>
        </div>
      )}

      {/* AI Chat */}
      {showAI && (
        <AIChat
          products={state.products}
          periods={state.periods}
          settings={state.settings}
          model={aiModel}
          onClose={() => setShowAI(false)}
        />
      )}

      {/* شريط التنقل */}
      <NavBar active={screen} onChange={setScreen} />
    </div>
  );
}
