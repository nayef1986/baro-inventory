// ============================================================
// App.jsx — التطبيق الرئيسي
// ============================================================

import { useState, useEffect, useCallback, useReducer } from "react";
import {
  initStorage, loadAll,
  saveProducts, addPeriod, deletePeriod,
  saveSettings, saveImage, deleteImage, clearAll,
} from "./lib/storage.js";
import ContainersScreen from "./screens/Containers.jsx";
import SalesScreen      from "./screens/Sales.jsx";
import BranchesScreen   from "./screens/Branches.jsx";
import CompareScreen    from "./screens/Compare.jsx";
import IdeasScreen      from "./screens/Ideas.jsx";
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
    onSaveSettings:   handleSaveSettings,
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
      <header className="fixed top-0 right-0 left-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 z-20 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowSettings(true)}
            className="w-10 h-10 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-xl
              flex items-center justify-center text-xl transition-colors"
          >⚙️</button>

          <div className="text-center">
            <div className="font-black text-slate-100 text-base leading-tight">
              {state.settings.brandName}
            </div>
            <div className="text-xs text-slate-500">
              {state.products.length} منتج · {state.periods.length} فترة
            </div>
          </div>

          <button
            onClick={() => setShowAI(true)}
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-3 py-2 rounded-xl
              text-sm font-bold flex items-center gap-1.5 hover:opacity-90 transition-opacity"
          >
            🤖 <span>آمرني</span>
          </button>
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
          onClose={() => setShowAI(false)}
        />
      )}

      {/* شريط التنقل */}
      <NavBar active={screen} onChange={setScreen} />
    </div>
  );
}
