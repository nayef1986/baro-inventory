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
    atr = f.atr14
    notes: list[str] = []

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


def decide(signals: list[Signal], f: Features, cfg: dict) -> tuple[str, float, str]:
    d = cfg.get("decision", {})
    total = sum(s.contribution for s in signals)
    by_name = {s.name: s for s in signals}

    agreeing = sum(1 for n in CORE_SIGNALS
                   if n in by_name and by_name[n].score >= 0.5)
    ext = by_name.get("extension")
    ext_score = ext.score if ext else 0.0

    green_at = float(d.get("green_score", 0.35))
    red_at = float(d.get("red_score", -0.35))
    need = int(d.get("min_agreeing_core", 3))
    max_ext = float(d.get("max_extension_penalty", -0.6))

    if total >= green_at and agreeing >= need and ext_score > max_ext:
        return GREEN, total, f"نتيجة {total:+.2f} مع توافق {agreeing} عوامل أساسية"

    if total <= red_at:
        return RED, total, f"نتيجة سلبية {total:+.2f}"

    if total >= green_at and agreeing < need:
        return GRAY, total, (f"النتيجة {total:+.2f} كافية لكن التوافق ضعيف "
                             f"({agreeing} من {need} عوامل أساسية)")
    if total >= green_at and ext_score <= max_ext:
        return GRAY, total, f"النتيجة {total:+.2f} لكن السهم متمدّد عن متوسطه — مطاردة"

    return GRAY, total, f"لا إعداد واضح (نتيجة {total:+.2f})"


def analyze(md: MarketData, cfg: dict) -> Verdict:
    f = build_features(md)
    weights = cfg.get("weights", {})
    signals = compute_all(f, weights)

    blocked = gate.check(f, cfg)
    if blocked:
        return Verdict(symbol=f.symbol, light=GRAY, score=0.0, reason=blocked,
                       signals=signals, features=f, plan=None, gated=True)

    light, score, reason = decide(signals, f, cfg)
    plan = build_plan(f, cfg) if light == GREEN else None
    v = Verdict(symbol=f.symbol, light=light, score=score, reason=reason,
                signals=signals, features=f, plan=plan)
    if light == RED:
        v.reason += " — قراءة سلبية (تجنّب/خروج)، وليست دعوة للبيع على المكشوف"
    return v
