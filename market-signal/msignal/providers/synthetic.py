"""مزوّد بيانات صناعي — لاختبار المحرك دون شبكة، وللتجربة قبل ربط مصدر حقيقي.

لا يستخدم أي بيانات سوق حقيقية. كل الأرقام مولَّدة، والغرض منها التحقق من أن
سلسلة (بوابة ← إشارات ← قرار ← خطة) تعمل كما هو متوقع.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd

from .base import ET, MarketData, normalize_intraday

BARS_PER_SESSION = 78  # شمعة 5 دقائق من 9:30 حتى 16:00


def _daily_series(
    n: int, start_price: float, drift: float, end_day: datetime, seed: int,
    volume: float = 2_000_000.0,
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    closes = start_price * np.cumprod(1 + drift + rng.normal(0, 0.004, n))
    idx = pd.date_range(end=end_day, periods=n, freq="B", tz=ET)
    rel_range = 0.015
    return pd.DataFrame(
        {
            "Open": closes * (1 - rel_range / 3),
            "High": closes * (1 + rel_range / 2),
            "Low": closes * (1 - rel_range / 2),
            "Close": closes,
            "Volume": np.full(n, volume),
        },
        index=idx,
    )


def _session_bars(
    day: datetime, n_bars: int, start: float, end: float, per_bar_volume: float
) -> pd.DataFrame:
    """مسار سعري خطي داخل الجلسة — يجعل موقع VWAP متوقَّعاً في الاختبار."""
    base = day.replace(hour=9, minute=30, second=0, microsecond=0)
    idx = pd.DatetimeIndex([base + timedelta(minutes=5 * i) for i in range(n_bars)])
    path = np.linspace(start, end, n_bars)
    return pd.DataFrame(
        {
            "Open": path,
            "High": path * 1.001,
            "Low": path * 0.999,
            "Close": path,
            "Volume": np.full(n_bars, per_bar_volume),
        },
        index=idx,
    )


class SyntheticProvider:
    """سيناريوهات: bull / bull_extended / bear / quiet / thin / stale."""

    def __init__(
        self,
        scenario: str = "bull",
        asof: Optional[datetime] = None,
        bars_today: int = 40,
        seed: int = 7,
    ):
        self.scenario = scenario
        self.bars_today = bars_today
        self.seed = seed
        # يوم ثلاثاء ثابت في منتصف الجلسة، حتى لا يعتمد الاختبار على وقت التشغيل
        self.asof = asof or datetime(2026, 3, 10, 12, 50, tzinfo=ET)

    # ---------------------------------------------------------------- helpers
    def _params(self) -> dict:
        s = self.scenario
        if s == "bull":
            # اتجاه صاعد معتدل — الإعداد النظيف
            return dict(drift=0.0009, day_move=0.018, rvol=2.6, bench_drift=0.0012,
                        bench_move=0.003, news=3, vol_mult=1.0)
        if s == "bull_extended":
            # نفس القوة لكن السهم تمدّد كثيراً عن متوسطه — يجب أن يُرفض
            return dict(drift=0.0025, day_move=0.020, rvol=2.6, bench_drift=0.0012,
                        bench_move=0.003, news=3, vol_mult=1.0)
        if s == "bear":
            return dict(drift=-0.0025, day_move=-0.022, rvol=2.4, bench_drift=-0.0015,
                        bench_move=-0.009, news=2, vol_mult=1.0)
        if s == "quiet":
            return dict(drift=0.0002, day_move=0.001, rvol=0.8, bench_drift=0.0002,
                        bench_move=0.000, news=0, vol_mult=1.0)
        if s == "thin":
            return dict(drift=0.002, day_move=0.02, rvol=2.5, bench_drift=0.001,
                        bench_move=0.002, news=1, vol_mult=0.001)
        if s == "stale":
            return dict(drift=0.002, day_move=0.02, rvol=2.5, bench_drift=0.001,
                        bench_move=0.002, news=1, vol_mult=1.0)
        raise ValueError(f"سيناريو غير معروف: {s}")

    def _build(self, symbol: str, start_price: float, p: dict, is_bench: bool):
        asof = self.asof
        last_completed = (asof - timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        drift = p["bench_drift"] if is_bench else p["drift"]
        move = p["bench_move"] if is_bench else p["day_move"]
        seed = self.seed + (100 if is_bench else 0)

        day_vol = 2_000_000.0 * (1.0 if is_bench else p["vol_mult"])
        daily = _daily_series(60, start_price, drift, last_completed, seed, day_vol)
        prev_close = float(daily["Close"].iloc[-1])

        per_bar_vol = 25_000.0 * (1.0 if is_bench else p["vol_mult"])
        sessions = []
        # جلسات سابقة بحجم مرجعي ثابت — تجعل الحجم النسبي قابلاً للتحقق
        for k in range(20, 0, -1):
            day = asof - timedelta(days=k)
            if day.weekday() >= 5:
                continue
            c = float(daily["Close"].iloc[-min(k, len(daily))])
            sessions.append(_session_bars(day, BARS_PER_SESSION, c * 0.998, c, per_bar_vol))

        today_end = prev_close * (1 + move)
        today = _session_bars(
            asof, self.bars_today, prev_close, today_end, per_bar_vol * p["rvol"]
        )
        sessions.append(today)
        intraday = pd.concat(sessions)
        return daily, intraday

    # ------------------------------------------------------------------ fetch
    def fetch(self, symbol: str, benchmark: str = "SPY") -> MarketData:
        p = self._params()
        daily, intraday = self._build(symbol, 100.0, p, is_bench=False)
        b_daily, b_intraday = self._build(benchmark, 400.0, p, is_bench=True)
        s_daily, s_intraday = self._build("XLK", 200.0, p, is_bench=True)

        asof = self.asof
        if self.scenario == "stale":
            # آخر شمعة قديمة عمداً لاختبار بوابة تأخر البيانات
            intraday = intraday.iloc[: -int(BARS_PER_SESSION / 2)]

        return MarketData(
            symbol=symbol,
            daily=daily,
            intraday=normalize_intraday(intraday),
            bench_daily=b_daily,
            bench_intraday=normalize_intraday(b_intraday),
            sector_symbol="XLK",
            sector_daily=s_daily,
            sector_intraday=normalize_intraday(s_intraday),
            news_24h=p["news"],
            days_to_earnings=30,
            asof=asof,
        )
