#!/usr/bin/env python3
"""أداة الإشارة الشخصية — واجهة سطر الأوامر.

أمثلة:
    python cli.py AAPL                 تحليل رمز واحد
    python cli.py --watchlist          كل رموز قائمة المراقبة
    python cli.py --demo bull          تجربة بلا شبكة ببيانات صناعية
    python cli.py --shot 2222 q.png c.png   تحليل من لقطات شاشة منصتك
    python cli.py --evaluate           ملء نتائج التشغيلات السابقة
    python cli.py --summary            هل الأداة تنفع فعلاً؟
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

from msignal import disclaimer, evaluate, store
from msignal.decide import analyze, analyze_features
from msignal.models import GRAY, GREEN, RED

ROOT = Path(__file__).resolve().parent
LIGHTS = {GREEN: "🟢 إشارة إيجابية", RED: "🔴 قراءة سلبية", GRAY: "⚪ لا إعداد"}
MARKS = {True: "✅", False: "❌", None: "⚪"}


def load_config(path: Path) -> dict:
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def ensure_ack() -> bool:
    if store.accepted_disclaimer():
        return True
    print(disclaimer.FULL)
    ans = input(f"\n{disclaimer.ACK_LINE} [y/N] ").strip().lower()
    if ans != "y":
        print("لم تُقبل الشروط — تم الإيقاف.")
        return False
    store.accept_disclaimer()
    return True


def mark(score: float) -> str:
    return MARKS[True] if score >= 0.5 else (MARKS[False] if score <= -0.3 else MARKS[None])


def render(v) -> str:
    f, w = v.features, 78
    L = ["", "─" * w, f"  {LIGHTS[v.light]}    {v.symbol}    النتيجة: {v.score:+.2f}", "─" * w]

    if f:
        vwap = f"{f.vwap:.2f}" if f.vwap else "—"
        rvol = f"{f.rvol:.1f}x" if f.rvol else "—"
        ret = f"{f.ret_today*100:+.2f}%" if f.ret_today is not None else "—"
        adv = f"${f.adv_usd/1e6:.1f}M" if f.adv_usd else "—"
        atr = f"{f.atr14:.2f}" if f.atr14 else "—"
        L += [f"  السعر {f.price:.2f}   VWAP {vwap}   حجم نسبي {rvol}   اليوم {ret}",
              f"  البيانات بعمر {f.data_age_min:.0f} دقيقة   "
              f"متوسط تداول {adv}   ATR {atr}", ""]

    for s in v.signals:
        flag = "" if s.is_fresh else "  (بيانات ناقصة)"
        L.append(f"  {mark(s.score)} {s.name:<13}{s.score:+.2f}  {s.evidence}{flag}")

    if v.features and v.features.origin == "shot":
        L += ["", f"  مصدر البيانات: لقطة شاشة مؤكَّدة يدوياً   "
                  f"اكتمال الأدلة: {v.completeness*100:.0f}%"]
        for k, note in (v.features.read_notes or {}).items():
            if k in ("rvol", "regime"):
                L.append(f"    · {k}: {note}")

    L += ["", f"  ▸ {v.reason}"]

    if v.plan:
        p = v.plan
        L += ["", f"  مستوى الإبطال: {p.invalidation:.2f}  "
                  f"(مخاطرة {p.risk_per_share:.2f} للسهم = {p.stop_pct*100:.1f}%)",
              f"  الحجم المقترح: {p.shares} سهم ≈ ${p.position_usd:,.0f}  "
              f"— خسارة عند الإبطال ${p.risk_usd:,.0f}"]
        L += [f"  • {n}" for n in p.notes]

    L += ["─" * w, f"  {disclaimer.SHORT}", "─" * w, ""]
    return "\n".join(L)


PRIVACY = """
قبل الرفع — اقتصّ الصورة:
  • أخفِ رصيد الحساب والمراكز المملوكة ورقم الحساب والاسم.
  • تكفي شاشة السهم (السعر، التغيّر، الحجم، أعلى/أدنى) وشاشة المؤشر العام.
الصورة تُرسل إلى واجهة Claude لقراءة الأرقام منها. لا ترفع ما لا تريد إرساله.
"""


def edit_field(label: str, value):
    """يعرض ما قُرئ ويقبل تصحيحاً. Enter يُبقي القيمة، كلمة 'لا' تجعلها فارغة."""
    shown = "—" if value is None else value
    raw = input(f"    {label:<24} [{shown}] : ").strip()
    if raw == "":
        return value
    if raw in ("لا", "-", "none", "null"):
        return None
    try:
        return float(raw) if raw.replace(".", "", 1).replace("-", "", 1).isdigit() else raw
    except ValueError:
        return raw


def run_shot(argv: list[str], cfg: dict, log: bool = True) -> int:
    from msignal import snapshot as snap_mod
    from msignal import vision

    symbol, paths = argv[0], argv[1:]
    if not paths:
        print("  ⚠️  أعطِ مسار صورة واحدة على الأقل بعد الرمز.")
        return 1

    print(PRIVACY)
    if input("متابعة؟ [y/N] ").strip().lower() != "y":
        return 1

    print("\n  جاري قراءة الصور…")
    try:
        ex = vision.read_screens(symbol, paths)
    except Exception as exc:
        print(f"  ⚠️  تعذّرت القراءة: {exc}")
        return 1

    if ex.contains_account_info:
        print("\n  🔒 تنبيه: الصورة تحتوي على معلومات حساب. اقتصّها قبل أي مشاركة.")
    if ex.symbol_seen and symbol.upper() not in str(ex.symbol_seen).upper():
        print(f"\n  ⚠️  الرمز في الصورة يبدو '{ex.symbol_seen}' لا '{symbol}' — تأكّد.")

    print("\n  ── راجع ما قُرئ من الصورة ──")
    print("  Enter للقبول · اكتب القيمة الصحيحة للتصحيح · 'لا' لتفريغ الحقل\n")
    for key, label in vision.REVIEW_FIELDS:
        setattr(ex, key, edit_field(label, getattr(ex, key)))

    if ex.unreadable:
        print(f"\n  حقول لم تُقرأ: {'، '.join(ex.unreadable)}")

    if input("\n  أؤكّد أن الأرقام أعلاه مطابقة لشاشتي [y/N] ").strip().lower() != "y":
        print("  لم تُؤكَّد القراءة — تم الإيقاف بلا تحليل.")
        return 1

    try:
        snap = vision.to_snapshot(symbol, ex)
    except ValueError as exc:
        print(f"  ⚠️  {exc}")
        return 1

    con = snap_mod.connect()
    snap_mod.save(snap, con)
    v = analyze_features(snap_mod.to_features(snap, con=con), cfg)
    con.close()

    print(render(v))
    if log:
        store.log_run(v)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="أداة إشارة شخصية — تعليمية، ليست توصية")
    ap.add_argument("symbols", nargs="*", help="رموز الأسهم")
    ap.add_argument("--watchlist", action="store_true", help="استخدم قائمة config.yaml")
    ap.add_argument("--demo", metavar="SCENARIO",
                    help="بيانات صناعية: bull|bull_extended|bear|quiet|thin|stale")
    ap.add_argument("--shot", nargs="+", metavar="ARG",
                    help="رمز السهم ثم مسار صورة أو أكثر من منصتك")
    ap.add_argument("--evaluate", action="store_true", help="املأ نتائج التشغيلات السابقة")
    ap.add_argument("--summary", action="store_true", help="تقرير أداء الإشارات")
    ap.add_argument("--config", default=str(ROOT / "config.yaml"))
    ap.add_argument("--no-log", action="store_true", help="لا تسجّل هذه التشغيلة")
    args = ap.parse_args()

    cfg = load_config(Path(args.config))

    if args.summary:
        print(evaluate.summary())
        return 0

    if not ensure_ack():
        return 1

    if args.shot:
        return run_shot(args.shot, cfg, log=not args.no_log)

    if args.demo:
        from msignal.providers import SyntheticProvider
        provider = SyntheticProvider(args.demo)
        symbols = args.symbols or ["DEMO"]
        print("\n⚠️  وضع تجريبي ببيانات مولَّدة — لا علاقة لها بأي سوق حقيقي.")
    else:
        from msignal.providers import YahooProvider
        provider = YahooProvider()
        symbols = cfg.get("watchlist", []) if args.watchlist else args.symbols

    if args.evaluate:
        n = evaluate.fill_outcomes(provider, benchmark=cfg.get("benchmark", "SPY"))
        print(f"تم تحديث {n} تشغيلة.")
        return 0

    if not symbols:
        ap.print_help()
        return 1

    for sym in symbols:
        try:
            v = analyze(provider.fetch(sym, benchmark=cfg.get("benchmark", "SPY")), cfg)
        except Exception as exc:
            print(f"\n  ⚠️  {sym}: تعذّر التحليل — {exc}\n")
            continue
        print(render(v))
        if not args.no_log:
            store.log_run(v)
    return 0


if __name__ == "__main__":
    sys.exit(main())
