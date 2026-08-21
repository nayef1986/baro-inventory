"""أنواع البيانات المشتركة بين كل الطبقات."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Any, Optional

import pandas as pd

GREEN = "GREEN"
RED = "RED"
GRAY = "GRAY"

# العوامل الأساسية التي يُشترط توافقها للضوء الأخضر
CORE_SIGNALS = ("regime", "rvol", "rel_strength", "levels")


@dataclass
class Signal:
    """نتيجة عامل واحد. score دائماً بين -1 و +1."""

    name: str
    score: float
    weight: float
    evidence: str
    is_fresh: bool = True

    @property
    def contribution(self) -> float:
        return self.score * self.weight

    def clamp(self) -> "Signal":
        self.score = max(-1.0, min(1.0, float(self.score)))
        return self


@dataclass
class Features:
    """كل الأرقام المشتقة التي تحتاجها الإشارات."""

    symbol: str
    asof: datetime
    session_open: bool
    data_age_min: float

    price: float
    prev_close: float
    prev_high: float
    prev_low: float

    vwap: Optional[float]
    opening_range_high: Optional[float]
    opening_range_low: Optional[float]

    rvol: Optional[float]
    adv_usd: float
    adv_shares: float

    atr14: float
    ma20: float
    ma50: float
    ma200: Optional[float]

    ret_today: float
    bench_ret_today: float
    bench_above_ma50: bool
    sector_ret_today: Optional[float]
    sector_symbol: Optional[str]

    news_24h: Optional[int]
    days_to_earnings: Optional[int]

    daily: pd.DataFrame = field(repr=False, default=None)

    def as_row(self) -> dict[str, Any]:
        d = asdict(self)
        d.pop("daily", None)
        d["asof"] = self.asof.isoformat()
        return d


@dataclass
class Plan:
    """خطة التنفيذ — الجزء الذي يجعل الإشارة قابلة للاستخدام."""

    invalidation: float
    risk_per_share: float
    stop_pct: float
    shares: int
    position_usd: float
    risk_usd: float
    notes: list[str] = field(default_factory=list)


@dataclass
class Verdict:
    symbol: str
    light: str  # GREEN / RED / GRAY
    score: float
    reason: str
    signals: list[Signal] = field(default_factory=list)
    features: Optional[Features] = None
    plan: Optional[Plan] = None
    gated: bool = False

    @property
    def is_actionable(self) -> bool:
        return self.light in (GREEN, RED) and not self.gated
