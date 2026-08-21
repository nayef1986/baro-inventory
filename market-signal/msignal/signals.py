"""العوامل الستة. كل دالة تُرجع Signal بنتيجة بين -1 و +1.

مبدأ حاكم: العوامل غير الاتجاهية (الحجم، المحفّز) تُضرب في اتجاه السيطرة
داخل الجلسة. حجم ضخم في يوم هابط تأكيدٌ للبائع لا إشارة شراء.
"""
from __future__ import annotations

from .models import Features, Signal


def _clamp(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _direction(f: Features) -> float:
    """من يسيطر على الجلسة: +1 مشترون، -1 بائعون."""
    if f.vwap:
        return 1.0 if f.price >= f.vwap else -1.0
    return 1.0 if f.ret_today >= 0 else -1.0


# ---------------------------------------------------------------- 1. البيئة
def sig_regime(f: Features, w: float) -> Signal:
    trend = 0.5 if f.bench_above_ma50 else -0.5
    momo = _clamp(f.bench_ret_today / 0.01) * 0.35
    sect = 0.0
    sect_txt = ""
    if f.sector_ret_today is not None:
        sect = _clamp((f.sector_ret_today - f.bench_ret_today) / 0.01) * 0.15
        sect_txt = f"، القطاع {f.sector_symbol} {(f.sector_ret_today - f.bench_ret_today)*100:+.1f}% مقابل المؤشر"

    above = "فوق" if f.bench_above_ma50 else "تحت"
    ev = f"المؤشر {above} متوسط 50 يوماً، وأداؤه اليوم {f.bench_ret_today*100:+.2f}%{sect_txt}"
    return Signal("regime", _clamp(trend + momo + sect), w, ev).clamp()


# ------------------------------------------------------- 2. الحجم النسبي
def sig_rvol(f: Features, w: float) -> Signal:
    if f.rvol is None:
        return Signal("rvol", 0.0, w, "الحجم النسبي غير متاح", is_fresh=False)

    r = f.rvol
    if r < 0.7:
        # مشاركة ضعيفة: تحذير في الاتجاهين، لا إشارة اتجاهية
        return Signal("rvol", -0.4, w, f"حجم نسبي {r:.1f}x — لا مشاركة تُذكر")

    if r >= 3.0:
        mag = 1.0
    elif r >= 2.0:
        mag = 0.7
    elif r >= 1.3:
        mag = 0.3
    else:
        mag = 0.0

    d = _direction(f)
    side = "المشترون" if d > 0 else "البائعون"
    ev = f"حجم نسبي {r:.1f}x و{side} مسيطرون (السعر {'فوق' if d > 0 else 'تحت'} VWAP)"
    return Signal("rvol", mag * d, w, ev).clamp()


# ----------------------------------------------------- 3. القوة النسبية
def sig_rel_strength(f: Features, w: float) -> Signal:
    d = f.ret_today - f.bench_ret_today
    ev = (f"السهم {f.ret_today*100:+.2f}% مقابل المؤشر {f.bench_ret_today*100:+.2f}% "
          f"= أداء نسبي {d*100:+.2f}%")
    return Signal("rel_strength", _clamp(d / 0.02), w, ev).clamp()


# ---------------------------------------------------------- 4. المستويات
def sig_levels(f: Features, w: float) -> Signal:
    parts, notes = [], []

    if f.vwap and f.atr14 > 0:
        v = _clamp((f.price - f.vwap) / (0.5 * f.atr14))
        parts.append(v * 0.50)
        notes.append(f"{'فوق' if v >= 0 else 'تحت'} VWAP بـ{abs(f.price - f.vwap):.2f}")

    if f.opening_range_high and f.opening_range_low:
        if f.price > f.opening_range_high:
            parts.append(0.25); notes.append("اخترق نطاق أول 30 دقيقة صعوداً")
        elif f.price < f.opening_range_low:
            parts.append(-0.25); notes.append("كسر نطاق أول 30 دقيقة هبوطاً")
        else:
            parts.append(0.0); notes.append("داخل نطاق الافتتاح")

    rng = f.prev_high - f.prev_low
    if f.price > f.prev_high:
        parts.append(0.25); notes.append("فوق قمة أمس")
    elif f.price < f.prev_low:
        parts.append(-0.25); notes.append("تحت قاع أمس")
    elif rng > 0:
        pos = (f.price - f.prev_low) / rng            # 0..1 داخل مدى أمس
        parts.append((pos - 0.5) * 0.5 * 0.25)
        notes.append(f"داخل مدى أمس عند {pos*100:.0f}%")

    return Signal("levels", _clamp(sum(parts)), w, "، ".join(notes)).clamp()


# ------------------------------------------------------------ 5. المحفّز
def sig_catalyst(f: Features, w: float) -> Signal:
    if f.news_24h is None:
        return Signal("catalyst", 0.0, w, "بيانات الأخبار غير متاحة", is_fresh=False)

    r = f.rvol or 1.0
    if f.news_24h == 0:
        if r >= 2.0:
            return Signal("catalyst", 0.2 * _direction(f), w,
                          "حركة بحجم مرتفع دون خبر معلن — سبب غير معروف")
        return Signal("catalyst", -0.3, w, "لا محفّز اليوم")

    if r >= 2.0:
        mag = 0.8
    elif r >= 1.3:
        mag = 0.4
    else:
        mag = 0.1
    ev = f"{f.news_24h} خبر/أخبار خلال 24 ساعة مع حجم نسبي {r:.1f}x"
    return Signal("catalyst", mag * _direction(f), w, ev).clamp()


# --------------------------------------------------- 6. التمدد المفرط
def sig_extension(f: Features, w: float) -> Signal:
    """عقوبة سالبة فقط: مطاردة سهم تمدّد كثيراً عن متوسطه أسوأ صفقات المبتدئين."""
    if f.atr14 <= 0:
        return Signal("extension", 0.0, w, "التقلّب غير محسوب", is_fresh=False)

    ext = (f.price - f.ma20) / f.atr14
    a = abs(ext)
    if a > 4:
        s = -1.0
    elif a > 3:
        s = -0.6
    elif a > 2:
        s = -0.3
    else:
        s = 0.0
    ev = f"يبعد {ext:+.1f} مدى حقيقي عن متوسط 20 يوماً"
    return Signal("extension", s, w, ev).clamp()


ALL = {
    "regime": sig_regime,
    "rvol": sig_rvol,
    "rel_strength": sig_rel_strength,
    "levels": sig_levels,
    "catalyst": sig_catalyst,
    "extension": sig_extension,
}


def compute_all(f: Features, weights: dict[str, float]) -> list[Signal]:
    return [fn(f, float(weights.get(name, 0.0))) for name, fn in ALL.items()]
