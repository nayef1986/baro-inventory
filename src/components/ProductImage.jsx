// ============================================================
// ProductImage.jsx — صورة المنتج (احترافي)
// ============================================================

import { memo, useState, useEffect, useRef, useCallback } from "react";

const MAX_SIZE = 500 * 1024;

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 400;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── مسح الباركود بالكاميرا ──────────────────────────────────

export function CameraScanner({ products, onFound, onClose }) {
  const videoRef    = useRef();
  const canvasRef   = useRef();
  const streamRef   = useRef(null);
  const intervalRef = useRef(null);
  const [scanning,  setScanning]  = useState(false);
  const [error,     setError]     = useState("");
  const [result,    setResult]    = useState(null);
  const [autoMode,  setAutoMode]  = useState(true);

  // صوت النجاح
  const playBeep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch {}
    try { navigator.vibrate?.(100); } catch {}
  }, []);

  const startCamera = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 }, height: { ideal: 720 },
          advanced: [{ torch: false }],
        }
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch { setError("تعذر فتح الكاميرا — تأكد من الصلاحيات"); }
  }, []);

  const stopCamera = useCallback(() => {
    clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useState(() => { startCamera(); return () => stopCamera(); });

  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || scanning) return;
    setScanning(true); setError("");
    const video = videoRef.current, canvas = canvasRef.current;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const base64 = canvas.toDataURL("image/jpeg", 0.8);
    try {
      const res  = await fetch("/api/scan-barcode", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const data = await res.json();
      if (data.barcode) {
        playBeep();
        const product = products?.find(p => p.barcode === data.barcode);
        setResult({ barcode: data.barcode, product });
        clearInterval(intervalRef.current);
        stopCamera();
      } else if (!autoMode) {
        setError("لم يُعثر على باركود — حاول مرة أخرى");
      }
    } catch { setError("خطأ في الاتصال"); }
    setScanning(false);
  }, [scanning, products, playBeep, stopCamera, autoMode]);

  // وضع تلقائي — مسح كل ثانيتين
  useEffect(() => {
    if (autoMode && !result) {
      intervalRef.current = setInterval(() => { capture(); }, 2000);
      return () => clearInterval(intervalRef.current);
    }
  }, [autoMode, result, capture]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 pt-12 pb-3 bg-black/80">
        <div className="text-white font-bold text-lg">📷 مسح الباركود</div>
        <button onClick={() => { stopCamera(); onClose(); }} className="text-white/70 text-2xl w-10 h-10 flex items-center justify-center">✕</button>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-40 border-2 border-amber-400 rounded-xl relative">
            <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br-lg" />
            <div className="absolute inset-x-0 top-1/2 h-0.5 bg-amber-400/60 animate-pulse" />
          </div>
        </div>
        <div className="absolute bottom-4 inset-x-0 text-center text-white/60 text-sm">وجّه الكاميرا نحو الباركود</div>
      </div>
      {result && (
        <div className="bg-slate-900 px-4 py-4">
          <div className="bg-emerald-900/40 border border-emerald-700/50 rounded-xl p-3 mb-3">
            <div className="text-emerald-400 font-bold text-sm mb-1">✅ تم القراءة</div>
            <div className="font-mono text-white text-lg font-black">{result.barcode}</div>
            {result.product && <div className="text-slate-300 text-sm mt-1">{result.product.name}</div>}
            {!result.product && <div className="text-amber-400 text-xs mt-1">⚠️ غير موجود في المخزون</div>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { onFound(result); onClose(); }} className="py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm">✅ استخدم هذا</button>
            <button onClick={() => { setResult(null); startCamera(); }} className="py-3 rounded-xl bg-slate-700 text-slate-200 font-bold text-sm">🔄 مسح مرة أخرى</button>
          </div>
        </div>
      )}
      {error && !result && (
        <div className="bg-slate-900 px-4 py-3">
          <div className="text-red-400 text-sm mb-2">{error}</div>
          <button onClick={capture} className="w-full py-3 rounded-xl bg-slate-700 text-white font-bold text-sm">🔄 حاول مرة أخرى</button>
        </div>
      )}
      {!result && (
        <div className="bg-black px-4 pb-8 pt-3 flex flex-col items-center gap-3">
          <div className="flex gap-3 items-center">
            <button onClick={() => setAutoMode(p => !p)}
              className={`px-4 py-2 rounded-full text-xs font-bold border transition-colors
                ${autoMode ? "bg-amber-600 text-white border-amber-500" : "bg-slate-700 text-slate-400 border-slate-600"}`}>
              {autoMode ? "⚡ تلقائي" : "👆 يدوي"}
            </button>
            {scanning && <span className="text-amber-400 text-xs animate-pulse">جاري المسح…</span>}
          </div>
          {!autoMode && (
            <button onClick={capture} disabled={scanning}
              className="w-20 h-20 rounded-full bg-white border-4 border-slate-400 flex items-center justify-center text-3xl disabled:opacity-50">
              {scanning ? "⏳" : "📷"}
            </button>
          )}
          {autoMode && (
            <div className="text-slate-500 text-xs text-center">الكاميرا تمسح تلقائياً كل ثانيتين</div>
          )}
        </div>
      )}
    </div>
  );
}

export const ProductImage = memo(({ barcode, images = {}, onSave, onRemove, size = "md", name = "" }) => {
  const [uploading,   setUploading]   = useState(false);
  const [preview,     setPreview]     = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [urlMode,     setUrlMode]     = useState(false);
  const [urlInput,    setUrlInput]    = useState("");
  const [confirmDel,  setConfirmDel]  = useState(false);
  const inputRef = useRef();

  const imgSrc = images[barcode];

  const SIZES = { sm: "w-10 h-10", md: "w-12 h-12", lg: "w-16 h-16" };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    setShowOptions(false);
    try {
      const compressed = await compressImage(file);
      await onSave?.(barcode, compressed);
    } catch {}
    setUploading(false);
    e.target.value = "";
  };

  const handleUrl = async () => {
    if (!urlInput.trim()) return;
    setUploading(true);
    try {
      const res  = await fetch(urlInput.trim());
      const blob = await res.blob();
      const compressed = await compressImage(new File([blob], "img.jpg", { type: blob.type }));
      await onSave?.(barcode, compressed);
      setUrlMode(false);
      setUrlInput("");
      setShowOptions(false);
    } catch { alert("فشل تحميل الصورة من الرابط"); }
    setUploading(false);
  };

  // ─── بدون صورة ───────────────────────────────────────────

  if (!imgSrc) {
    return (
      <div className={`${SIZES[size]} relative shrink-0`}>
        {urlMode ? (
          <div className="absolute right-0 top-full z-50 mt-1 bg-slate-800 border border-slate-600 rounded-xl p-3 w-60 shadow-xl">
            <div className="text-xs text-slate-400 mb-2 font-bold">رابط الصورة</div>
            <input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="https://..."
              className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none mb-2"
            />
            <div className="flex gap-1">
              <button onClick={handleUrl} disabled={uploading}
                className="flex-1 bg-blue-600 text-white text-xs rounded-lg py-1.5 font-bold disabled:opacity-40">
                {uploading ? "⏳" : "تحميل"}
              </button>
              <button onClick={() => { setUrlMode(false); setUrlInput(""); }}
                className="flex-1 bg-slate-700 text-slate-300 text-xs rounded-lg py-1.5">إلغاء</button>
            </div>
          </div>
        ) : null}

        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`${SIZES[size]} bg-slate-700 border-2 border-dashed border-slate-600 rounded-xl
            flex flex-col items-center justify-center text-slate-500 hover:border-blue-500 hover:text-blue-400
            transition-colors disabled:animate-pulse gap-0.5`}
          title="اضغط لرفع صورة"
        >
          <span className="text-lg">{uploading ? "⏳" : "📷"}</span>
        </button>

        {/* زر رابط */}
        <button
          onClick={() => setUrlMode(v => !v)}
          className="absolute -bottom-1 -left-1 w-5 h-5 bg-blue-600 hover:bg-blue-500 rounded-full text-white text-xs flex items-center justify-center shadow"
          title="رفع برابط"
        >🔗</button>

        <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      </div>
    );
  }

  // ─── مع صورة ─────────────────────────────────────────────

  return (
    <>
      <div className="shrink-0 flex flex-col items-center gap-1">
        {/* الصورة */}
        <button
          onClick={() => setPreview(true)}
          className={`${SIZES[size]} rounded-xl overflow-hidden border-2 border-slate-600 hover:border-blue-500 transition-colors`}
        >
          <img src={imgSrc} alt={name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
        </button>

        {/* أزرار التحكم */}
        <div className="flex gap-1">
          {/* تغيير */}
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-6 h-5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-md text-xs flex items-center justify-center"
            title="تغيير الصورة"
          >{uploading ? "⏳" : "📷"}</button>

          {/* رابط */}
          <button
            onClick={() => setUrlMode(v => !v)}
            className="w-6 h-5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-md text-xs flex items-center justify-center"
            title="رفع برابط"
          >🔗</button>

          {/* حذف */}
          {onRemove && (
            <button
              onClick={() => setConfirmDel(true)}
              className="w-6 h-5 bg-red-900/40 hover:bg-red-700 border border-red-800/60 rounded-md text-xs flex items-center justify-center"
              title="حذف الصورة"
            >🗑️</button>
          )}
        </div>

        {/* حقل الرابط */}
        {urlMode && (
          <div className="absolute z-50 mt-1 bg-slate-800 border border-slate-600 rounded-xl p-3 w-60 shadow-xl" style={{top: "100%", right: 0}}>
            <div className="text-xs text-slate-400 mb-2 font-bold">رابط الصورة</div>
            <input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="https://..."
              className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none mb-2"
            />
            <div className="flex gap-1">
              <button onClick={handleUrl} disabled={uploading}
                className="flex-1 bg-blue-600 text-white text-xs rounded-lg py-1.5 font-bold disabled:opacity-40">
                {uploading ? "⏳" : "تحميل"}
              </button>
              <button onClick={() => { setUrlMode(false); setUrlInput(""); }}
                className="flex-1 bg-slate-700 text-slate-300 text-xs rounded-lg py-1.5">إلغاء</button>
            </div>
          </div>
        )}
      </div>

      {/* تأكيد الحذف */}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-xs p-5 text-center">
            <div className="text-4xl mb-3">🗑️</div>
            <div className="font-black text-slate-100 mb-1">حذف الصورة؟</div>
            <div className="text-xs text-slate-400 mb-4">لا يمكن التراجع</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(false)}
                className="flex-1 bg-slate-700 text-slate-300 py-2 rounded-xl font-bold text-sm">إلغاء</button>
              <button onClick={() => { onRemove?.(barcode); setConfirmDel(false); }}
                className="flex-1 bg-red-600 text-white py-2 rounded-xl font-bold text-sm">احذف</button>
            </div>
          </div>
        </div>
      )}

      {/* معاينة كاملة */}
      {preview && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setPreview(false)}>
          <div className="relative max-w-sm w-full">
            <img src={imgSrc} alt={name} className="w-full rounded-2xl object-contain max-h-96" decoding="async" />
            <div className="text-center mt-3 text-slate-300 font-bold">{name}</div>
            <button className="absolute top-2 left-2 w-8 h-8 bg-black/50 text-white rounded-full text-lg flex items-center justify-center">✕</button>
          </div>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </>
  );
});
