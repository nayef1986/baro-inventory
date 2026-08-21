"""مزوّد بيانات عبر yfinance (مجاني، بلا مفتاح).

ملاحظات مهمة:
• yfinance واجهة غير رسمية لبيانات ياهو، قد تتغيّر أو تتوقف دون إشعار،
  وشروط الاستخدام تقصرها على الاستخدام الشخصي غير التجاري.
• البيانات قد تكون متأخرة. البوابة في gate.py هي التي تحمي من ذلك.
• لبناء أكثر ثباتاً استبدل هذا الملف بمزوّد مدفوع (Polygon / FMP / EODHD)
  مع الحفاظ على نفس الواجهة: fetch(symbol, benchmark) -> MarketData
"""
from __future__ import annotations

import time as _time
from datetime import datetime, timedelta
from typing import Optional

import pandas as pd

from .base import (ET, MarketData, SECTOR_ETF, drop_partial_session,
                   normalize_intraday, now_et)

_CACHE: dict[tuple, tuple[float, object]] = {}


def _cached(key: tuple, ttl: float, fn):
    hit = _CACHE.get(key)
    if hit and (_time.time() - hit[0]) < ttl:
        return hit[1]
    val = fn()
    _CACHE[key] = (_time.time(), val)
    return val


class YahooProvider:
    def __init__(self, intraday_interval: str = "5m", cache_ttl: float = 60.0):
        self.interval = intraday_interval
        self.cache_ttl = cache_ttl

    # ------------------------------------------------------------- primitives
    def _hist(self, symbol: str, period: str, interval: str) -> pd.DataFrame:
        import yfinance as yf

        def run():
            df = yf.Ticker(symbol).history(
                period=period, interval=interval, prepost=False, auto_adjust=True
            )
            return df if df is not None else pd.DataFrame()

        return _cached((symbol, period, interval), self.cache_ttl, run)

    def _daily(self, symbol: str, asof: datetime) -> pd.DataFrame:
        df = self._hist(symbol, "1y", "1d")
        if df.empty:
            raise RuntimeError(f"تعذّر جلب الشموع اليومية للرمز {symbol}")
        return drop_partial_session(df, asof)

    def _intraday(self, symbol: str) -> pd.DataFrame:
        df = self._hist(symbol, "1mo", self.interval)
        if df.empty:
            raise RuntimeError(f"تعذّر جلب الشموع اللحظية للرمز {symbol}")
        return normalize_intraday(df)

    # ------------------------------------------------------------------- meta
    def _sector_symbol(self, symbol: str) -> Optional[str]:
        import yfinance as yf

        try:
            info = _cached((symbol, "info"), 3600.0, lambda: yf.Ticker(symbol).info) or {}
            return SECTOR_ETF.get(info.get("sector"))
        except Exception:
            return None

    def _news_24h(self, symbol: str) -> Optional[int]:
        """عدد الأخبار خلال 24 ساعة. يعيد None إذا تعذّر — لا يُسقط التحليل."""
        import yfinance as yf

        try:
            items = _cached((symbol, "news"), 600.0, lambda: yf.Ticker(symbol).news) or []
        except Exception:
            return None

        cutoff = now_et() - timedelta(hours=24)
        count = 0
        for it in items:
            ts = None
            body = it.get("content", it) if isinstance(it, dict) else {}
            for key in ("providerPublishTime", "pubDate", "displayTime"):
                raw = body.get(key) or (it.get(key) if isinstance(it, dict) else None)
                if raw is None:
                    continue
                try:
                    ts = (
                        pd.to_datetime(raw, unit="s", utc=True)
                        if isinstance(raw, (int, float))
                        else pd.to_datetime(raw, utc=True)
                    )
                    break
                except Exception:
                    continue
            if ts is not None and ts.to_pydatetime() >= cutoff:
                count += 1
        return count

    def _days_to_earnings(self, symbol: str) -> Optional[int]:
        """أيام حتى أقرب إعلان نتائج. None إذا لم يتوفّر — البوابة تتساهل عندها."""
        import yfinance as yf

        today = now_et().date()

        def nearest(dates) -> Optional[int]:
            future = [d for d in dates if d is not None and d >= today]
            return (min(future) - today).days if future else None

        try:
            cal = _cached((symbol, "cal"), 3600.0, lambda: yf.Ticker(symbol).calendar)
            if isinstance(cal, dict):
                raw = cal.get("Earnings Date") or []
                raw = raw if isinstance(raw, (list, tuple)) else [raw]
                got = nearest([pd.to_datetime(d).date() for d in raw if d is not None])
                if got is not None:
                    return got
        except Exception:
            pass

        try:
            df = yf.Ticker(symbol).get_earnings_dates(limit=8)
            if df is not None and not df.empty:
                return nearest([pd.to_datetime(d).date() for d in df.index])
        except Exception:
            pass
        return None

    # ------------------------------------------------------------------ fetch
    def fetch(self, symbol: str, benchmark: str = "SPY") -> MarketData:
        symbol = symbol.strip().upper()
        asof = now_et()

        daily = self._daily(symbol, asof)
        intraday = self._intraday(symbol)
        b_daily = self._daily(benchmark, asof)
        b_intraday = self._intraday(benchmark)

        sector = self._sector_symbol(symbol)
        s_daily = s_intraday = None
        if sector:
            try:
                s_daily = self._daily(sector, asof)
                s_intraday = self._intraday(sector)
            except Exception:
                sector = None

        return MarketData(
            symbol=symbol,
            daily=daily,
            intraday=intraday,
            bench_daily=b_daily,
            bench_intraday=b_intraday,
            sector_symbol=sector,
            sector_daily=s_daily,
            sector_intraday=s_intraday,
            news_24h=self._news_24h(symbol),
            days_to_earnings=self._days_to_earnings(symbol),
            asof=asof,
        )
