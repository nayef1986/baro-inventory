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
    prev_close: Optional[float]
    prev_high: Optional[float]
    prev_low: Optional[float]

    vwap: Optional[float]
    opening_range_high: Optional[float]
    opening_range_low: Optional[float]

    rvol: Optional[float]
    adv_usd: Optional[float]
    adv_shares: Optional[float]

    atr14: Optional[float]
    ma20: Optional[float]
    ma50: Optional[float]
    ma200: Optional[float]

    ret_today: Optional[float]
    bench_ret_today: Optional[float]
    bench_above_ma50: Optional[bool]
    sector_ret_today: Optional[float]
    sector_symbol: Optional[str]

    news_24h: Optional[int]
    days_to_earnings: Optional[int]

    # مصدر البيانات: "bars" من مزوّد أسعار، "shot" من لقطة شاشة مؤكَّدة
    origin: str = "bars"
    # ملاحظات دقة لكل حقل جاء من قراءة صورة
    read_notes: dict = field(default_factory=dict)

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
    completeness: float = 1.0        # نسبة أوزان العوامل التي توفّرت لها بيانات
    missing: list[str] = field(default_factory=list)

    @property
    def is_actionable(self) -> bool:
        return self.light in (GREEN, RED) and not self.gated
