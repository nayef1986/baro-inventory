"""طبقة الحساب: تحويل الشموع الخام إلى أرقام قابلة للحكم.

كل دالة هنا نقية (تأخذ بيانات وتُرجع رقماً) حتى تكون قابلة للاختبار وحدها.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd

from .models import Features
from .providers.base import ET, MarketData, is_session_open


# ---------------------------------------------------------------- daily stats
def atr(daily: pd.DataFrame, period: int = 14) -> float:
    """المدى الحقيقي المتوسط — مقياس التقلّب الذي يُبنى عليه وقف الخسارة."""
    h, l, c = daily["High"], daily["Low"], daily["Close"]
    prev_c = c.shift(1)
    tr = pd.concat([h - l, (h - prev_c).abs(), (l - prev_c).abs()], axis=1).max(axis=1)
    val = tr.rolling(period).mean().iloc[-1]
    return float(val) if pd.notna(val) else float(tr.mean())


def sma(daily: pd.DataFrame, period: int) -> Optional[float]:
    if len(daily) < period:
        return None
    return float(daily["Close"].rolling(period).mean().iloc[-1])


def adv(daily: pd.DataFrame, period: int = 20) -> tuple[float, float]:
    """(متوسط قيمة التداول اليومية بالدولار، متوسط عدد الأسهم)."""
    tail = daily.tail(period)
    shares = float(tail["Volume"].mean())
    usd = float((tail["Close"] * tail["Volume"]).mean())
    return usd, shares


# ------------------------------------------------------------- intraday stats
def _today_slice(intraday: pd.DataFrame) -> tuple[pd.DataFrame, object]:
    day = intraday["_date"].max()
    return intraday[intraday["_date"] == day], day


def session_vwap(intraday: pd.DataFrame) -> Optional[float]:
    """VWAP الجلسة الجارية — المرجع الذي تقيس عليه المؤسسات تنفيذها."""
    today, _ = _today_slice(intraday)
    if today.empty or today["Volume"].sum() <= 0:
        return None
    tp = (today["High"] + today["Low"] + today["Close"]) / 3
    return float((tp * today["Volume"]).sum() / today["Volume"].sum())


def opening_range(intraday: pd.DataFrame, minutes: int = 30) -> tuple[Optional[float], Optional[float]]:
    today, _ = _today_slice(intraday)
    if today.empty:
        return None, None
    start = int(today["_mod"].min())
    win = today[today["_mod"] < start + minutes]
    if win.empty:
        return None, None
    return float(win["High"].max()), float(win["Low"].min())


def relative_volume(intraday: pd.DataFrame, lookback_sessions: int = 20) -> Optional[float]:
    """الحجم النسبي مقارَناً بنفس اللحظة من اليوم في الجلسات السابقة.

    مقارنة حجم الساعة 11 صباحاً بحجم يوم كامل خطأ شائع يجعل الرقم بلا معنى.
    """
    if intraday is None or intraday.empty:
        return None
    df = intraday.copy()
    df["_cum"] = df.groupby("_date")["Volume"].cumsum()
    today = df["_date"].max()
    cur = df[df["_date"] == today]
    if cur.empty:
        return None
    cutoff = int(cur["_mod"].max())
    today_cum = float(cur["_cum"].iloc[-1])

    prior = df[df["_date"] != today]
    prior = prior[prior["_mod"] <= cutoff]
    if prior.empty:
        return None
    per_day = prior.groupby("_date")["_cum"].max().tail(lookback_sessions)
    base = float(per_day.median())
    if base <= 0:
        return None
    return today_cum / base


def last_price_and_age(intraday: pd.DataFrame, asof: datetime) -> tuple[float, float]:
    last_ts = intraday.index[-1].to_pydatetime()
    price = float(intraday["Close"].iloc[-1])
    age_min = (asof.astimezone(ET) - last_ts).total_seconds() / 60.0
    return price, max(0.0, age_min)


def day_return(daily: pd.DataFrame, intraday: pd.DataFrame) -> float:
    prev_close = float(daily["Close"].iloc[-1])
    last = float(intraday["Close"].iloc[-1])
    return last / prev_close - 1.0


# ------------------------------------------------------------------ assembler
def build_features(md: MarketData) -> Features:
    asof = md.asof or datetime.now(ET)
    daily, intraday = md.daily, md.intraday

    price, age = last_price_and_age(intraday, asof)
    adv_usd, adv_shares = adv(daily)
    or_high, or_low = opening_range(intraday)

    bench_ret = day_return(md.bench_daily, md.bench_intraday)
    bench_ma50 = sma(md.bench_daily, 50)
    bench_last = float(md.bench_intraday["Close"].iloc[-1])

    sector_ret = None
    if md.sector_daily is not None and md.sector_intraday is not None:
        try:
            sector_ret = day_return(md.sector_daily, md.sector_intraday)
        except Exception:
            sector_ret = None

    return Features(
        symbol=md.symbol,
        asof=asof,
        session_open=is_session_open(asof),
        data_age_min=age,
        price=price,
        prev_close=float(daily["Close"].iloc[-1]),
        prev_high=float(daily["High"].iloc[-1]),
        prev_low=float(daily["Low"].iloc[-1]),
        vwap=session_vwap(intraday),
        opening_range_high=or_high,
        opening_range_low=or_low,
        rvol=relative_volume(intraday),
        adv_usd=adv_usd,
        adv_shares=adv_shares,
        atr14=atr(daily),
        ma20=sma(daily, 20) or price,
        ma50=sma(daily, 50) or price,
        ma200=sma(daily, 200),
        ret_today=day_return(daily, intraday),
        bench_ret_today=bench_ret,
        bench_above_ma50=bool(bench_ma50 and bench_last > bench_ma50),
        sector_ret_today=sector_ret,
        sector_symbol=md.sector_symbol,
        news_24h=md.news_24h,
        days_to_earnings=md.days_to_earnings,
        daily=daily,
    )
