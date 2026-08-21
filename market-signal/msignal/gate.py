"""بوابة جودة البيانات — تُنفَّذ قبل أي حساب قرار.

فلسفتها: الرمادي عند أي شك. أداة تعطي حكماً على بيانات رديئة أسوأ من
أداة لا تعطي حكماً إطلاقاً.
"""
from __future__ import annotations

from typing import Optional

from .models import Features


def check(f: Features, cfg: dict) -> Optional[str]:
    """يعيد سبب الرفض، أو None إذا اجتازت البيانات كل الفحوص."""
    g = cfg.get("gate", {})

    if f.data_age_min > float(g.get("max_data_age_min", 20)):
        return f"البيانات متأخرة {f.data_age_min:.0f} دقيقة — لا حكم"

    if not f.session_open:
        return "السوق مغلق — الأرقام أدناه قراءة لآخر جلسة متاحة، لا إشارة"

    if f.price < float(g.get("min_price", 3.0)):
        return f"السعر {f.price:.2f} دون الحد الأدنى المقبول"

    min_adv = float(g.get("min_adv_usd", 5_000_000))
    if f.adv_usd is not None and f.adv_usd < min_adv:
        return (f"سيولة غير كافية: متوسط تداول يومي ${f.adv_usd/1e6:.2f}M "
                f"دون الحد ${min_adv/1e6:.1f}M")

    if f.origin == "shot":
        # لقطة الشاشة لا تحمل تاريخاً: يكفي سعر وأحد مرجعَي الاتجاه
        if f.vwap is None and f.ret_today is None:
            return "اللقطة لا تحمل VWAP ولا تغيّر اليوم — لا مرجع لاتجاه الجلسة"
        return None

    if f.atr14 is None or f.atr14 <= 0:
        return "تعذّر حساب التقلّب (ATR) — بيانات ناقصة"

    if f.rvol is None or f.vwap is None:
        return "بيانات لحظية ناقصة لهذه الجلسة"

    blackout = int(g.get("earnings_blackout_days", 2))
    if f.days_to_earnings is not None and 0 <= f.days_to_earnings <= blackout:
        return f"إعلان نتائج خلال {f.days_to_earnings} يوم — مخاطرة حدثية، لا حكم"

    return None
