// ============================================================
// ProductImage.jsx — صورة المنتج (احترافي)
// ============================================================

import { memo, useState, useRef } from "react";

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
          <img src={imgSrc} alt={name} className="w-full h-full object-cover" />
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
            <img src={imgSrc} alt={name} className="w-full rounded-2xl object-contain max-h-96" />
            <div className="text-center mt-3 text-slate-300 font-bold">{name}</div>
            <button className="absolute top-2 left-2 w-8 h-8 bg-black/50 text-white rounded-full text-lg flex items-center justify-center">✕</button>
          </div>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </>
  );
});
