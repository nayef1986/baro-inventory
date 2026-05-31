// ============================================================
// App.jsx — التطبيق الرئيسي
// ============================================================

import { useState, useEffect, useCallback, useMemo, useReducer } from "react";
import {
  initStorage, loadAll,
  saveProducts, addPeriod, deletePeriod, deleteAllPeriods,
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

export default function App() {
  const [state,    dispatch] = useReducer(reducer, INIT_STATE);
  const [screen,   setScreen]   = useState("containers");
  const [showAI,   setShowAI]   = useState(false);
  const [aiModel,  setAiModel]  = useState("gemini");

  const branchSummary = useMemo(() => {
    const products = state.products;
    const periods  = state.periods;
    if (!products.length || !periods.length) return {};

    const productMap = {};
    products.forEach(p => {
      productMap[p.barcode] = Number(p.purchases?.slice(-1)[0]?.buyPrice ?? 0);
    });

    const allBranches = new Set();
    periods.forEach(per => {
      Object.keys(per.sales ?? {}).forEach(b => allBranches.add(b));
    });

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

  const handleUpdateProducts = useCallback(async (products) => {
    dispatch({ type: "SET_PRODUCTS", payload: products });
    await saveProducts(products);
  }, []);

  const handleDeleteContainer = useCallback(async (container) => {
    const updatedProducts = state.products.filter(p => p.container !== container);
    dispatch({ type: "SET_PRODUCTS", payload: updatedProducts });
    await saveProducts(updatedProducts);
    return { ok: true };
  }, [state.products]);

  const handleAddPeriod = useCallback(async (period) => {
    const result = await addPeriod(period);
    if (result.ok) {
      const withoutDup = state.periods.filter(p => p.id !== period.id);
      const newPeriods = [...withoutDup, period].slice(-52);
      dispatch({ type: "SET_PERIODS", payload: newPeriods });
    }
    return result;
  }, [state.periods]);

  const handleDeletePeriod = useCallback(async (periodId) => {
    await deletePeriod(periodId);
    dispatch({ type: "SET_PERIODS", payload: state.periods.filter(p => p.id !== periodId) });
  }, [state.periods]);

  const handleDeleteAllPeriods = useCallback(async () => {
    dispatch({ type: "SET_PERIODS", payload: [] });
    await deleteAllPeriods();
  }, []);

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

  const screenProps = {
    products:         state.products,
    periods:          state.periods,
    settings:         state.settings,
    images:           state.images,
    onUpdateProducts: handleUpdateProducts,
    onAddPeriod:      handleAddPeriod,
    onDeletePeriod:   handleDeletePeriod,
    onDeleteAllPeriods: handleDeleteAllPeriods,
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
      <header style={{
          position:"fixed",top:0,right:0,left:0,
          background:"rgba(15,23,42,0.92)",
          backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
          borderBottom:"1px solid rgba(255,255,255,0.06)",
          zIndex:20,padding:"10px 16px",
        }}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",maxWidth:"440px",margin:"0 auto"}}>

          <button onClick={() => setShowSettings(true)} style={{
            width:"38px",height:"38px",borderRadius:"12px",border:"1px solid rgba(255,255,255,0.1)",
            background:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:"18px",cursor:"pointer",flexShrink:0,
          }}>⚙️</button>

          <div style={{textAlign:"center",flex:1,padding:"0 12px"}}>
            <div style={{fontWeight:"900",color:"#ffffff",fontSize:"16px",lineHeight:1}}>{state.settings.brandName}</div>
            <div style={{fontSize:"11px",color:"rgba(148,163,184,0.6)",marginTop:"2px"}}>
              {state.products.length} منتج · {state.periods.length} فترة
            </div>
          </div>

          <div style={{display:"flex",gap:"6px",flexShrink:0}}>
            <button onClick={() => window.location.reload()}
              style={{width:"38px",height:"38px",borderRadius:"12px",background:"rgba(34,197,94,0.2)",border:"1px solid rgba(34,197,94,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px",cursor:"pointer"}}
              title="تحديث">
              🔄
            </button>
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

      <main className="pt-20 pb-24 px-4 max-w-lg mx-auto">
        {SCREENS[screen] ?? SCREENS.containers}
      </main>

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

      {showAI && (
        <AIChat
          products={state.products}
          periods={state.periods}
          settings={state.settings}
          model={aiModel}
          onClose={() => setShowAI(false)}
        />
      )}

      <NavBar active={screen} onChange={setScreen} />
    </div>
  );
}
