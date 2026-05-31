// ============================================================
// Sales.jsx — شاشة المبيعات
// ============================================================

import { useState, useMemo, memo, useCallback } from "react";
import {
  Card, Badge, StatPill, ConfirmModal,
  SearchBar, FilterChips, EmptyState, ExportBar,
  SectionHeader, BackBtn, fmtN, fmtM, fmtPct, useToast,
} from "../components/UI.jsx";
import { ProductImage } from "../components/ProductImage.jsx";
import { parseSalesFile } from "../lib/parsers.js";
import { exportGeneric, printBranchNeedReport } from "../lib/exporters.js";

// مرادفات بالأسماء المستخدمة داخل الملف
const exportToExcel = (rows, filename) => exportGeneric(rows, filename, filename);
const printBranchReport = (branch, items, brandName) => printBranchNeedReport(branch, items, brandName);

// ─── دوال محلية (مستقلة تماماً) ──────────────────────────────

// تحويل آمن لرقم
function num(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// مجموع مبيعات باركود في فترة واحدة
function soldInPeriod(barcode, period) {
  return Object.values(period.sales ?? {}).reduce(
    (s, branch) => s + num(branch[barcode]?.qty ?? 0), 0
  );
}

// رقم المصنع = أول 5 أرقام من الباركود
function getFactoryCode(barcode) {
  const m = String(barcode ?? "").match(/^(\d{5})/);
  return m ? m[1] : "";
}

// إجمالي المشتريات لمنتج
function totalPurchases(p) {
  return (p.purchases ?? []).reduce((s, x) => s + num(x.qty), 0);
}

// متوسط سعر الشراء
function avgBuyPrice(p) {
  const last = p.purchases?.slice(-1)[0];
  return num(last?.buyPrice ?? 0);
}

// بحث عربي بسيط
function arabicIncludes(text, search) {
  return String(text ?? "").toLowerCase().includes(String(search ?? "").toLowerCase());
}

// ─── UploadZone ──────────────────────────────────────────────

const UploadZone = memo(({ onFile, loading }) => {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]); }}
      className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all
        ${dragging ? "border-blue-400 bg-blue-900/20" : "border-slate-600 hover:border-slate-500"}`}
    >
      <div className="text-4xl mb-3">{loading ? "⏳" : "📊"}</div>
      <div className="font-bold text-slate-300 mb-1">
        {loading ? "جاري القراءة…" : "اسحب ملف المبيعات هنا"}
      </div>
      <div className="text-xs text-slate-500 mb-4">Excel (.xlsx) — تقرير المبيعات</div>
      {!loading && (
        <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm">
          اختر ملف
          <input
            type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => onFile(e.target.files[0])}
          />
        </label>
      )}
    </div>
  );
});

// ─── بطاقة فترة ─────────────────────────────────────────────

const PeriodCard = memo(({ period, products, onClick, onDelete }) => {
  const branches    = Object.keys(period.sales ?? {});
  const totalSold   = branches.reduce((s, b) =>
    s + Object.values(period.sales[b]).reduce((ss, v) => ss + num(v.qty), 0), 0);
  const totalRev    = branches.reduce((s, b) =>
    s + Object.values(period.sales[b]).reduce((ss, v) => ss + num(v.totalPrice), 0), 0);
  const activeBranches = branches.filter((b) =>
    Object.values(period.sales[b]).some((v) => num(v.qty) > 0));

  return (
    <Card className="!p-3">
      <div className="flex justify-between items-start mb-2">
        <div onClick={onClick} className="flex-1 cursor-pointer">
          <div className="font-black text-slate-100 text-base">{period.label}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            📅 {period.uploadDate} · {activeBranches.length} فرع نشط
          </div>
        </div>
        <button
          onClick={onDelete}
          className="text-slate-500 hover:text-red-400 text-lg w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-900/20"
        >✕</button>
      </div>

      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <StatPill label="إجمالي مباع"   value={fmtN(totalSold)}  color="text-amber-400" />
        <StatPill label="إجمالي إيرادات" value={fmtM(totalRev)}  color="text-emerald-400" />
      </div>

      <div className="flex gap-1 flex-wrap">
        {activeBranches.slice(0, 5).map((b) => (
          <Badge key={b} color="gray">{b}</Badge>
        ))}
        {activeBranches.length > 5 && (
          <Badge color="gray">+{activeBranches.length - 5}</Badge>
        )}
      </div>

      <div className="text-xs text-blue-400 mt-2 cursor-pointer" onClick={onClick}>
        ← اضغط للتفاصيل
      </div>
    </Card>
  );
});

// ─── تفاصيل فترة ────────────────────────────────────────────

const PeriodDetail = memo(({ period, products, periods, images, onSaveImage, onRemoveImage, onBack, settings }) => {
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [search,         setSearch]         = useState("");
  const [sortBy,         setSortBy]         = useState("sold");
  const [filterType,     setFilterType]     = useState("all");  // all | container | factory
  const [filterValue,    setFilterValue]    = useState("");
  const { show, ToastContainer }            = useToast();

  const branches = useMemo(() => Object.keys(period.sales ?? {}), [period]);

  // ملخص الفروع
  const branchSummaries = useMemo(() =>
    branches.map((branch) => {
      const data     = period.sales[branch] ?? {};
      const totalQty = Object.values(data).reduce((s, v) => s + num(v.qty), 0);
      const totalRev = Object.values(data).reduce((s, v) => s + num(v.totalPrice), 0);
      const items    = Object.keys(data).filter((bc) => num(data[bc].qty) > 0);
      return { branch, totalQty, totalRev, itemCount: items.length };
    }).sort((a, b) => b.totalRev - a.totalRev),
  [branches, period]);

  // منتجات الفرع المحدد
  const branchProducts = useMemo(() => {
    if (!selectedBranch) return [];
    const data = period.sales[selectedBranch] ?? {};

    let list = products.map((p) => {
      const entry    = data[p.barcode];
      const sold     = entry ? num(entry.qty)         : 0;
      const revenue  = entry ? num(entry.totalPrice)  : 0;
      const orders   = entry ? num(entry.orders)      : 0;
      const bought   = totalPurchases(p);
      const allSold  = periods.reduce((s, per) =>
        s + soldInPeriod(p.barcode, per), 0);
      const closing  = Math.max(0, bought - allSold);
      const soldPct  = bought > 0 ? (sold / bought * 100) : 0;
      const buyPrice = avgBuyPrice(p);

      return {
        ...p,
        sold, revenue, orders,
        bought, closing, soldPct, buyPrice,
        factoryCode: getFactoryCode(p.barcode),
        factoryName: settings?.factories?.[getFactoryCode(p.barcode)] ?? "",
      };
    }).filter((p) => p.sold > 0 || filterType !== "all");

    // فلترة
    if (filterType === "container" && filterValue) {
      list = list.filter((p) => p.container === filterValue);
    } else if (filterType === "factory" && filterValue) {
      list = list.filter((p) => p.factoryCode === filterValue);
    }

    if (search) {
      list = list.filter((p) =>
        arabicIncludes(p.name, search) || p.barcode.includes(search)
      );
    }

    // ترتيب
    if (sortBy === "sold")     list = [...list].sort((a, b) => b.sold - a.sold);
    if (sortBy === "revenue")  list = [...list].sort((a, b) => b.revenue - a.revenue);
    if (sortBy === "closing")  list = [...list].sort((a, b) => b.closing - a.closing);
    if (sortBy === "soldPct")  list = [...list].sort((a, b) => b.soldPct - a.soldPct);

    return list;
  }, [selectedBranch, period, products, periods, search, sortBy, filterType, filterValue, settings]);

  // قوائم الفلترة
  const containers = useMemo(() =>
    [...new Set(products.map((p) => p.container).filter(Boolean))].sort(),
  [products]);

  const factories = useMemo(() =>
    [...new Set(products.map((p) => getFactoryCode(p.barcode)).filter(Boolean))].sort(),
  [products]);

  // تصدير
  const handleExportBranch = () => {
    const rows = branchProducts.map((p) => ({
      "الباركود":           p.barcode,
      "الاسم":              p.name,
      "الكونتينر":          p.container,
      "المصنع":             p.factoryCode + (p.factoryName ? ` · ${p.factoryName}` : ""),
      "سعر الشراء ﷼":      num(p.buyPrice).toFixed(2),
      "سعر البيع ﷼":       num(p.sellPrice).toFixed(2),
      "مباع في الفرع":      num(p.sold),
      "إيرادات الفرع ﷼":   num(p.revenue).toFixed(2),
      "طلبات":              num(p.orders),
      "المتبقي (الكل)":     num(p.closing),
      "نسبة مبيعات%":       fmtPct(p.soldPct),
    }));
    const r = exportToExcel(rows, `مبيعات_${selectedBranch}_${period.label}`);
    if (!r.ok) show(r.error, "error"); else show("تم التصدير ✓");
  };

  // شاشة تفاصيل الفرع
  if (selectedBranch) {
    const summary = branchSummaries.find((b) => b.branch === selectedBranch);
    const sortOptions = [
      { key: "sold",    label: "الأكثر مبيعاً" },
      { key: "revenue", label: "الأعلى إيراداً" },
      { key: "closing", label: "الأكثر متبقياً" },
      { key: "soldPct", label: "أعلى نسبة%" },
    ];

    return (
      <div className="space-y-4">
        <ToastContainer />
        <BackBtn onClick={() => setSelectedBranch(null)} label="رجوع للفترة" />

        {/* هيدر الفرع */}
        <Card>
          <SectionHeader
            icon="🏪"
            title={selectedBranch}
            subtitle={`${period.label} · ${summary?.itemCount ?? 0} منتج`}
            right={
              <ExportBar
                onExcel={handleExportBranch}
                onPrint={() => {
                  const r = printBranchReport(selectedBranch, branchProducts, settings?.brandName);
                  if (!r.ok) show(r.error, "error");
                }}
              />
            }
          />
          <div className="grid grid-cols-2 gap-2">
            <StatPill label="إجمالي مباع"    value={fmtN(summary?.totalQty ?? 0)}  color="text-amber-400" />
            <StatPill label="إجمالي إيرادات" value={fmtM(summary?.totalRev ?? 0)}  color="text-emerald-400" />
          </div>
        </Card>

        {/* فلاتر */}
        <div className="space-y-2">
          <SearchBar value={search} onChange={(e) => setSearch(e.target.value)} />

          {/* فلتر الكونتينر / المصنع */}
          <div className="flex gap-2">
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setFilterValue(""); }}
              className="bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-2 py-2 text-xs focus:outline-none"
            >
              <option value="all">الكل</option>
              <option value="container">كونتينر</option>
              <option value="factory">مصنع</option>
            </select>

            {filterType === "container" && (
              <select
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                className="flex-1 bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-2 py-2 text-xs focus:outline-none"
              >
                <option value="">اختر كونتينر…</option>
                {containers.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}

            {filterType === "factory" && (
              <select
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                className="flex-1 bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-2 py-2 text-xs focus:outline-none"
              >
                <option value="">اختر مصنع…</option>
                {factories.map((f) => (
                  <option key={f} value={f}>
                    {f}{settings?.factories?.[f] ? ` · ${settings.factories[f]}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <FilterChips options={sortOptions} active={sortBy} onChange={setSortBy} label="ترتيب:" />
          <div className="text-xs text-slate-500">{branchProducts.length} منتج</div>
        </div>

        {/* قائمة المنتجات */}
        <div className="space-y-2">
          {branchProducts.map((p) => (
            <Card key={p.barcode} className="!p-3">
              <div className="flex items-start gap-2 mb-2">
                <ProductImage barcode={p.barcode} images={images} onSave={onSaveImage} onRemove={onRemoveImage} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-100 text-sm leading-tight">{p.name}</div>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">{p.barcode}</div>
                  <div className="text-xs text-blue-400">📦 {p.container}</div>
                  <div className="text-xs text-slate-500">
                    🏭 {p.factoryCode}{p.factoryName ? ` · ${p.factoryName}` : ""}
                  </div>
                  <div className="flex gap-2 text-xs mt-1">
                    <span className="text-red-300">شراء: {fmtM(p.buyPrice)}</span>
                    <span className="text-emerald-300">بيع: {fmtM(p.sellPrice)}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-xl font-black tabular-nums ${p.soldPct >= 70 ? "text-orange-400" : p.soldPct >= 40 ? "text-amber-400" : "text-blue-400"}`}>
                    {fmtPct(p.soldPct)}
                  </div>
                  <div className="text-xs text-slate-500">من المشتريات</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1 text-center mb-1">
                <StatPill label="مباع بالفرع"    value={fmtN(p.sold)}     color="text-amber-400" />
                <StatPill label="إيرادات الفرع"  value={fmtM(p.revenue)}  color="text-emerald-400" />
                <StatPill label="المتبقي (الكل)" value={fmtN(p.closing)}  color={p.closing <= 12 ? "text-red-400" : "text-slate-300"} />
                <StatPill label="الطلبات"        value={fmtN(p.orders)}   color="text-purple-400" />
              </div>
            </Card>
          ))}

          {branchProducts.length === 0 && (
            <EmptyState icon="📭" title="لا توجد مبيعات" subtitle="جرب تغيير الفلتر" />
          )}
        </div>
      </div>
    );
  }

  // شاشة الفروع في الفترة
  return (
    <div className="space-y-4">
      <ToastContainer />
      <BackBtn onClick={onBack} label="رجوع للفترات" />

      {/* ملخص الفترة */}
      <Card>
        <SectionHeader icon="📅" title={period.label} subtitle={`رُفع: ${period.uploadDate}`} />
        <div className="grid grid-cols-2 gap-2 mb-3">
          <StatPill label="الفروع النشطة"
            value={fmtN(branchSummaries.filter((b) => b.totalQty > 0).length)}
            color="text-blue-400" />
          <StatPill label="إجمالي وحدات مباعة"
            value={fmtN(branchSummaries.reduce((s, b) => s + b.totalQty, 0))}
            color="text-amber-400" />
          <StatPill label="إجمالي الإيرادات"
            value={fmtM(branchSummaries.reduce((s, b) => s + b.totalRev, 0))}
            color="text-emerald-400" />
          <StatPill label="المنتجات المباعة"
            value={fmtN(branchSummaries.reduce((s, b) => s + b.itemCount, 0))}
            color="text-purple-400" />
        </div>

        {/* تصدير الفترة كاملة */}
        <ExportBar
          onExcel={() => {
            const rows = [];
            Object.entries(period.sales).forEach(([branch, data]) => {
              Object.entries(data).forEach(([barcode, entry]) => {
                if (num(entry.qty) === 0) return;
                const p = products.find((pr) => pr.barcode === barcode);
                rows.push({
                  "الفترة":    period.label,
                  "الفرع":     branch,
                  "الباركود":  barcode,
                  "الاسم":     p?.name ?? "",
                  "الكونتينر": p?.container ?? "",
                  "الكمية":    num(entry.qty),
                  "الإيرادات": num(entry.totalPrice),
                  "الطلبات":   num(entry.orders),
                });
              });
            });
            const r = exportToExcel(rows, `فترة_${period.label}`);
            if (!r.ok) show(r.error, "error"); else show("تم التصدير ✓");
          }}
        />
      </Card>

      {/* قائمة الفروع */}
      <SectionHeader icon="🏪" title="الفروع" subtitle="اضغط فرع للتفاصيل" />
      <div className="space-y-2">
        {branchSummaries.map((b, i) => {
          const maxRev = branchSummaries[0]?.totalRev ?? 1;
          return (
            <Card key={b.branch} onClick={() => setSelectedBranch(b.branch)} className="!p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-7 h-7 rounded-full text-xs flex items-center justify-center font-black shrink-0
                  ${i === 0 ? "bg-amber-500 text-black" : i === 1 ? "bg-slate-400 text-black" : i === 2 ? "bg-amber-700 text-white" : "bg-slate-700 text-slate-400"}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-100">{b.branch}</div>
                  <div className="text-xs text-slate-500">{b.itemCount} منتج</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-black text-emerald-400 tabular-nums text-sm">{fmtM(b.totalRev)}</div>
                  <div className="text-xs text-slate-500 tabular-nums">{fmtN(b.totalQty)} وحدة</div>
                </div>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
                  style={{ width: `${(b.totalRev / maxRev) * 100}%` }} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
});

// ─── الشاشة الرئيسية ────────────────────────────────────────

export default function SalesScreen({ products, periods, settings, images, onSaveImage, onRemoveImage, onAddPeriod, onDeletePeriod, onDeleteAllPeriods }) {
  const [uploading,     setUploading]     = useState(false);
  const [label,         setLabel]         = useState("");
  const [log,           setLog]           = useState([]);
  const [selectedPeriod,setSelectedPeriod]= useState(null);
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const { show, ToastContainer }          = useToast();

  // ─ رفع الملف
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setUploading(true);
    setLog([]);

    try {
      const buffer   = await file.arrayBuffer();
      const periodLabel = label.trim() || new Date().toISOString().slice(0, 10);
      const { period, branchNames, errors, warnings } = parseSalesFile(buffer, periodLabel);

      if (errors.length > 0) {
        setLog(errors.map((e) => ({ type: "error", text: e })));
        setUploading(false);
        return;
      }

      const logs = [
        { type: "success", text: `✅ ${branchNames.length} فرع · ${Object.keys(period.sales).length} فرع نشط` },
        { type: "info",    text: `📅 الفترة: ${periodLabel}` },
        ...branchNames.slice(0, 8).map((b) => ({ type: "info", text: `🏪 ${b}` })),
        ...warnings.slice(0, 3).map((w) => ({ type: "warning", text: w })),
      ];
      setLog(logs);

      const result = await onAddPeriod(period);
      if (!result.ok) {
        setLog((prev) => [...prev, { type: "error", text: `فشل الحفظ: ${result.reason}` }]);
      } else {
        show(`تم حفظ الفترة "${periodLabel}" ✓`, "success");
        setLabel("");
      }
    } catch (e) {
      setLog([{ type: "error", text: `فشل القراءة: ${e.message}` }]);
    }

    setUploading(false);
  }, [label, onAddPeriod, show]);

  // ─ الفترة المحددة
  const selectedPeriodData = useMemo(
    () => periods.find((p) => p.id === selectedPeriod) ?? null,
    [periods, selectedPeriod]
  );

  if (selectedPeriodData) {
    return (
      <PeriodDetail
        period={selectedPeriodData}
        products={products}
        periods={periods}
        images={images}
        onSaveImage={onSaveImage}
        onRemoveImage={onRemoveImage}
        onBack={() => setSelectedPeriod(null)}
        settings={settings}
      />
    );
  }

  return (
    <div className="space-y-4">
      <ToastContainer />

      {/* تأكيد حذف الكل */}
      {showDeleteAll && (
        <ConfirmModal
          title="حذف كل فواتير المبيعات"
          message={`سيتم حذف كل الفترات (${periods.length}) نهائياً. لا يمكن التراجع.`}
          confirmLabel="احذف الكل"
          confirmColor="red"
          onConfirm={async () => {
            setShowDeleteAll(false);
            await onDeleteAllPeriods();
            show("تم حذف كل الفواتير", "success");
          }}
          onCancel={() => setShowDeleteAll(false)}
        />
      )}

      {/* تأكيد الحذف */}
      {deleteTarget && (
        <ConfirmModal
          title="حذف الفترة"
          message={`هل تريد حذف فترة "${deleteTarget.label}"؟ لا يمكن التراجع.`}
          confirmLabel="حذف"
          confirmColor="red"
          onConfirm={() => {
            onDeletePeriod(deleteTarget.id);
            setDeleteTarget(null);
            show("تم الحذف", "success");
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* رفع ملف */}
      <Card>
        <SectionHeader icon="📤" title="رفع ملف مبيعات" />

        <div className="text-xs text-slate-500 bg-slate-700/40 rounded-xl p-3 mb-3 font-mono space-y-0.5">
          <div>📌 صف 2: أسماء الفروع (كل فرع 4 أعمدة)</div>
          <div>📌 صف 5+: [باركود] اسم المنتج</div>
          <div>الأعمدة: طلبات | كمية | إجمالي | cost</div>
        </div>

        <div className="mb-3">
          <label className="block text-xs text-slate-400 mb-1">تسمية الفترة (اختياري)</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={`أسبوع ${new Date().toISOString().slice(0, 10)}`}
            className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        <UploadZone onFile={handleFile} loading={uploading} />

        {log.length > 0 && (
          <div className="mt-3 space-y-1">
            {log.map((l, i) => (
              <div key={i} className={`text-xs px-3 py-1.5 rounded-lg
                ${l.type === "success" ? "bg-emerald-900/50 text-emerald-300"
                : l.type === "error"   ? "bg-red-900/50 text-red-300"
                : l.type === "warning" ? "bg-amber-900/50 text-amber-300"
                :                        "bg-blue-900/50 text-blue-300"}`}>
                {l.text}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* قائمة الفترات */}
      {periods.length > 0 ? (
        <>
          <SectionHeader
            icon="📅"
            title="الفترات المحفوظة"
            subtitle={`${periods.length} فترة · الأحدث أولاً`}
          />
          <button
            onClick={() => setShowDeleteAll(true)}
            className="w-full mb-3 py-3 rounded-xl bg-red-900/30 border border-red-700/40 text-red-300 text-sm font-bold active:scale-95 transition-transform">
            🗑️ حذف كل فواتير المبيعات
          </button>
          <div className="space-y-3">
            {[...periods].reverse().map((period) => (
              <PeriodCard
                key={period.id}
                period={period}
                products={products}
                onClick={() => setSelectedPeriod(period.id)}
                onDelete={() => setDeleteTarget(period)}
              />
            ))}
          </div>
        </>
      ) : (
        <EmptyState icon="📊" title="لا توجد فترات مبيعات" subtitle="ارفع ملف مبيعات للبدء" />
      )}
    </div>
  );
}
