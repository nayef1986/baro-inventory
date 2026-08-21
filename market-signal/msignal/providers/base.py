"""واجهة مزوّد البيانات + أدوات التوقيت المشتركة."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from typing import Optional, Protocol
from zoneinfo import ZoneInfo

import pandas as pd

ET = ZoneInfo("America/New_York")

SESSION_START = time(9, 30)
SESSION_END = time(16, 0)

# خريطة القطاع إلى صندوق المؤشر الممثّل له
SECTOR_ETF = {
    "Technology": "XLK",
    "Financial Services": "XLF",
    "Energy": "XLE",
    "Healthcare": "XLV",
    "Consumer Cyclical": "XLY",
    "Consumer Defensive": "XLP",
    "Industrials": "XLI",
    "Basic Materials": "XLB",
    "Utilities": "XLU",
    "Real Estate": "XLRE",
    "Communication Services": "XLC",
}


def now_et() -> datetime:
    return datetime.now(ET)


def is_session_open(ts: Optional[datetime] = None) -> bool:
    """جلسة عادية فقط. لا يعرف العطل الرسمية — بوابة تأخر البيانات تلتقطها."""
    ts = (ts or now_et()).astimezone(ET)
    if ts.weekday() >= 5:
        return False
    return SESSION_START <= ts.time() < SESSION_END


@dataclass
class MarketData:
    """كل ما تحتاجه طبقة الحساب عن رمز واحد."""

    symbol: str
    daily: pd.DataFrame          # جلسات مكتملة فقط
    intraday: pd.DataFrame       # شموع لحظية بتوقيت ET، تشمل اليوم الحالي
    bench_daily: pd.DataFrame
    bench_intraday: pd.DataFrame
    sector_symbol: Optional[str] = None
    sector_daily: Optional[pd.DataFrame] = None
    sector_intraday: Optional[pd.DataFrame] = None
    news_24h: Optional[int] = None
    days_to_earnings: Optional[int] = None
    asof: Optional[datetime] = None


class Provider(Protocol):
    def fetch(self, symbol: str, benchmark: str = "SPY") -> MarketData: ...


def drop_partial_session(daily: pd.DataFrame, asof: datetime) -> pd.DataFrame:
    """يحذف شمعة اليوم الجارية — بدونها يتسرّب المستقبل إلى الحساب."""
    if daily is None or daily.empty:
        return daily
    today = asof.astimezone(ET).date()
    idx = pd.to_datetime(daily.index)
    dates = idx.tz_convert(ET).date if idx.tz is not None else idx.date
    return daily[[d != today for d in dates]]


def normalize_intraday(df: pd.DataFrame) -> pd.DataFrame:
    """يضمن فهرساً بتوقيت ET ويضيف عمودَي التاريخ ودقيقة اليوم."""
    if df is None or df.empty:
        return df
    out = df.copy()
    idx = pd.to_datetime(out.index)
    if idx.tz is None:
        idx = idx.tz_localize(ET)
    else:
        idx = idx.tz_convert(ET)
    out.index = idx
    out["_date"] = out.index.date
    out["_mod"] = out.index.hour * 60 + out.index.minute
    return out
