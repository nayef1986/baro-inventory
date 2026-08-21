"""محرك القرار وخطة التنفيذ.

القرار قواعد صريحة قابلة للاختبار التاريخي — لا نموذج لغوي ولا صندوق أسود.
"""
from __future__ import annotations

import math

from . import gate
from .features import build_features
from .models import (CORE_SIGNALS, GRAY, GREEN, RED, Features, Plan, Signal,
                     Verdict)
from .providers.base import MarketData
from .signals import compute_all


def build_plan(f: Features, cfg: dict) -> Plan:
    """مستوى الإبطال وحجم المركز — الإشارة بدونهما ناقصة."""
    acct, risk = cfg.get("account", {}), cfg.get("risk", {})
    notes: list[str] = []

    # بلا ATR (حالة لقطة الشاشة) نستبدله بنسبة تقريبية من السعر
    atr = f.atr14
    if not atr or atr <= 0:
        atr = f.price * 0.02
        notes.append("⚠️ لا مقياس تقلّب — الهوامش مقدَّرة بنسبة تقريبية")

    below = [x for x in (f.vwap, f.opening_range_low, f.prev_low)
             if x is not None and x < f.price]
    if below:
        stop = max(below) - 0.1 * atr
        src = {f.vwap: "VWAP", f.opening_range_low: "قاع نطاق الافتتاح",
               f.prev_low: "قاع أمس"}.get(max(below), "أقرب مستوى")
        notes.append(f"الإبطال مبني على {src}")
    else:
        stop = f.price - 1.0 * atr
        notes.append("لا مستوى بنيوي قريب — الإبطال على مدى حقيقي واحد")

    # وقف أضيق من نصف المدى الحقيقي يُضرب بالضجيج وحده
    stop = min(stop, f.price - 0.5 * atr)

    risk_ps = max(f.price - stop, 1e-6)
    stop_pct = risk_ps / f.price
    if stop_pct > float(risk.get("max_stop_pct", 0.06)):
        notes.append(f"⚠️ مسافة الإبطال واسعة ({stop_pct*100:.1f}%) — حجم أصغر أو تجاوز الفرصة")

    equity = float(acct.get("equity", 0) or 0)
    risk_usd = equity * float(acct.get("risk_pct", 0.01))
    shares = math.floor(risk_usd / risk_ps) if risk_ps > 0 else 0

    if f.adv_shares:
        cap_adv = math.floor(float(risk.get("max_pct_of_adv", 0.01)) * f.adv_shares)
        if shares > cap_adv:
            shares = cap_adv
            notes.append("الحجم مقيَّد بسيولة السهم لا برأس المال")

    max_pos_pct = float(risk.get("max_position_pct", 0.25))
    cap_conc = math.floor((equity * max_pos_pct) / f.price) if f.price > 0 else 0
    if shares > cap_conc:
        shares = cap_conc
        notes.append(f"الحجم مقيَّد بسقف التركيز ({max_pos_pct*100:.0f}% من رأس المال)")

    cap_cash = math.floor(equity / f.price) if f.price > 0 else 0
    if shares > cap_cash:
        shares = cap_cash
        notes.append("الحجم مقيَّد برأس المال المتاح (بلا رافعة)")

    return Plan(
        invalidation=round(stop, 2),
        risk_per_share=round(risk_ps, 2),
        stop_pct=stop_pct,
        shares=int(max(shares, 0)),
        position_usd=round(max(shares, 0) * f.price, 2),
        risk_usd=round(max(shares, 0) * risk_ps, 2),
        notes=notes,
    )


def decide(signals: list[Signal], f: Features, cfg: dict) -> tuple[str, float, str, float, list[str]]:
    """يعيد (الضوء، النتيجة، السبب، نسبة الاكتمال، العوامل المفقودة).

    العوامل بلا بيانات تُستبعد ويُعاد توزيع أوزانها، فلا يُخفَّض الحكم لمجرد
    أن عاملاً لم تصل بياناته — لكن نسبة الاكتمال تُحسب وتُعرض دائماً.
    """
    d = cfg.get("decision", {})
    fresh = [s for s in signals if s.is_fresh]
    missing = [s.name for s in signals if not s.is_fresh]

    total_w = sum(s.weight for s in signals) or 1.0
    fresh_w = sum(s.weight for s in fresh)
    completeness = fresh_w / total_w

    min_comp = float(d.get("min_completeness", 0.60))
    if fresh_w <= 0:
        return GRAY, 0.0, "لا عامل واحد تتوفّر بياناته", 0.0, missing
    if completeness < min_comp:
        return (GRAY, 0.0,
                f"الأدلة ناقصة ({completeness*100:.0f}% من الأوزان) — لا حكم",
                completeness, missing)

    total = sum(s.contribution for s in fresh) / fresh_w
    by_name = {s.name: s for s in fresh}

    core_avail = [n for n in CORE_SIGNALS if n in by_name]
    agreeing = sum(1 for n in core_avail if by_name[n].score >= 0.5)
    ext = by_name.get("extension")
    ext_score = ext.score if ext else 0.0

    green_at = float(d.get("green_score", 0.35))
    red_at = float(d.get("red_score", -0.35))
    max_ext = float(d.get("max_extension_penalty", -0.6))

    # التوافق المطلوب يتناسب مع العوامل الأساسية المتاحة، وبحدٍّ أدنى اثنان
    need = int(d.get("min_agreeing_core", 3))
    need = max(2, min(need, len(core_avail)))
    if len(core_avail) < 2:
        return (GRAY, total, "أقل من عاملين أساسيين متاحين — لا حكم",
                completeness, missing)

    tail = f" · اكتمال الأدلة {completeness*100:.0f}%" if missing else ""

    if total >= green_at and agreeing >= need and ext_score > max_ext:
        return (GREEN, total,
                f"نتيجة {total:+.2f} مع توافق {agreeing} من {len(core_avail)} عوامل أساسية{tail}",
                completeness, missing)

    if total <= red_at:
        return RED, total, f"نتيجة سلبية {total:+.2f}{tail}", completeness, missing

    if total >= green_at and agreeing < need:
        return (GRAY, total,
                f"النتيجة {total:+.2f} كافية لكن التوافق ضعيف ({agreeing} من {need}){tail}",
                completeness, missing)
    if total >= green_at and ext_score <= max_ext:
        return (GRAY, total,
                f"النتيجة {total:+.2f} لكن السهم متمدّد عن متوسطه — مطاردة{tail}",
                completeness, missing)

    return GRAY, total, f"لا إعداد واضح (نتيجة {total:+.2f}){tail}", completeness, missing


def analyze(md: MarketData, cfg: dict) -> Verdict:
    """المسار الطبيعي: شموع من مزوّد أسعار."""
    return analyze_features(build_features(md), cfg)


def analyze_features(f: Features, cfg: dict) -> Verdict:
    """يقبل ميزات من أي مصدر — شموع أو لقطة شاشة مؤكَّدة."""
    weights = cfg.get("weights", {})
    signals = compute_all(f, weights)

    blocked = gate.check(f, cfg)
    if blocked:
        return Verdict(symbol=f.symbol, light=GRAY, score=0.0, reason=blocked,
                       signals=signals, features=f, plan=None, gated=True)

    light, score, reason, completeness, missing = decide(signals, f, cfg)
    plan = build_plan(f, cfg) if light == GREEN else None
    v = Verdict(symbol=f.symbol, light=light, score=score, reason=reason,
                signals=signals, features=f, plan=plan,
                completeness=completeness, missing=missing)
    if light == RED:
        v.reason += " — قراءة سلبية (تجنّب/خروج)، وليست دعوة للبيع على المكشوف"
    return v
