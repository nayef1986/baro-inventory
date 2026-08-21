"""لقطة سوق مقروءة من شاشة منصة التداول.

الفكرة: البيانات معروضة أمامك حتى لو لم تتوفّر عبر أي واجهة برمجية. لكن
لقطة واحدة لا تحمل تاريخاً — لا متوسط حجم، ولا متوسطات متحركة، ولا تقلّب.
لذلك تُخزَّن كل لقطة مؤكَّدة، فتبني الأداة تاريخها الخاص مع الاستخدام.
"""
from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from statistics import median
from typing import Optional

from .models import Features
from .providers.base import ET, is_session_open

# تقدير الحجم النسبي حين لا يوجد تاريخ كافٍ — تصنيف بصري خشن، لا قياس
VOLUME_WORDS = {
    "much_higher": 3.0,
    "higher": 1.8,
    "normal": 1.0,
    "lower": 0.6,
    "much_lower": 0.3,
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol       TEXT NOT NULL,
    captured_at  TEXT NOT NULL,
    minute_of_day INTEGER,
    price        REAL,
    prev_close   REAL,
    day_high     REAL,
    day_low      REAL,
    volume_today REAL,
    vwap         REAL,
    index_change_pct REAL,
    payload_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_snap_sym ON snapshots(symbol, captured_at);
"""


@dataclass
class Snapshot:
    """ما يمكن قراءته فعلاً من شاشة منصة تداول. كل حقل قد يكون None."""

    symbol: str
    price: float

    prev_close: Optional[float] = None
    day_high: Optional[float] = None
    day_low: Optional[float] = None
    change_pct: Optional[float] = None
    volume_today: Optional[float] = None
    vwap: Optional[float] = None
    bid: Optional[float] = None
    ask: Optional[float] = None
    trades_today: Optional[int] = None

    # من شاشة المؤشر العام
    index_name: Optional[str] = None
    index_change_pct: Optional[float] = None

    # قراءات بصرية خشنة من صورة الشارت — تقديرات لا قياسات
    volume_vs_typical: Optional[str] = None   # مفاتيح VOLUME_WORDS
    price_vs_ma50: Optional[str] = None       # above | below
    price_vs_ma20: Optional[str] = None

    captured_at: Optional[datetime] = None
    unreadable: list[str] = field(default_factory=list)
    read_notes: dict = field(default_factory=dict)

    def __post_init__(self):
        if self.captured_at is None:
            self.captured_at = datetime.now(ET)
        if self.change_pct is None and self.prev_close:
            self.change_pct = (self.price / self.prev_close - 1) * 100
        if self.prev_close is None and self.change_pct is not None:
            self.prev_close = self.price / (1 + self.change_pct / 100)


# ------------------------------------------------------------------ التخزين
def connect(path=None) -> sqlite3.Connection:
    from .store import DB_PATH

    con = sqlite3.connect(path or DB_PATH)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    return con


def save(snap: Snapshot, con: Optional[sqlite3.Connection] = None) -> int:
    own = con is None
    con = con or connect()
    try:
        ts = snap.captured_at
        cur = con.execute(
            """INSERT INTO snapshots (symbol, captured_at, minute_of_day, price,
                   prev_close, day_high, day_low, volume_today, vwap,
                   index_change_pct, payload_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (snap.symbol, ts.isoformat(), ts.hour * 60 + ts.minute, snap.price,
             snap.prev_close, snap.day_high, snap.day_low, snap.volume_today,
             snap.vwap, snap.index_change_pct,
             json.dumps(asdict(snap), ensure_ascii=False, default=str)),
        )
        con.commit()
        return int(cur.lastrowid)
    finally:
        if own:
            con.close()


def volume_baseline(symbol: str, minute_of_day: int, window_min: int = 45,
                    con: Optional[sqlite3.Connection] = None) -> Optional[float]:
    """وسيط حجم اليوم من لقطات سابقة أُخذت قرب نفس اللحظة من اليوم.

    مقارنة حجم الساعة 11 بحجم يوم كامل خطأ يُفقد الرقم معناه — لذلك تُقيَّد
    المقارنة بنافذة زمنية حول نفس دقيقة اليوم.
    """
    own = con is None
    con = con or connect()
    try:
        today = datetime.now(ET).date().isoformat()
        rows = con.execute(
            """SELECT volume_today FROM snapshots
               WHERE symbol = ? AND volume_today IS NOT NULL
                 AND ABS(minute_of_day - ?) <= ?
                 AND date(captured_at) < ?
               ORDER BY captured_at DESC LIMIT 20""",
            (symbol, minute_of_day, window_min, today),
        ).fetchall()
    finally:
        if own:
            con.close()

    vals = [r["volume_today"] for r in rows if r["volume_today"]]
    return median(vals) if len(vals) >= 5 else None   # أقل من 5 أيام لا يصنع مرجعاً


# ------------------------------------------------------- تحويل إلى ميزات
def to_features(snap: Snapshot, con: Optional[sqlite3.Connection] = None,
                now: Optional[datetime] = None) -> Features:
    """يبني Features مما توفّر فقط. كل ما لم يُقرأ يبقى None فيُستبعد وزنه.

    `now` للاختبار فقط — يجعل حساب عمر اللقطة مستقلاً عن وقت التشغيل.
    """
    ts = snap.captured_at
    now = now or datetime.now(ET)
    notes = dict(snap.read_notes)

    rvol = None
    base = volume_baseline(snap.symbol, ts.hour * 60 + ts.minute, con=con)
    if snap.volume_today and base:
        rvol = snap.volume_today / base
        notes["rvol"] = f"محسوب من {'تاريخ لقطاتك'} — مرجع {base:,.0f}"
    elif snap.volume_vs_typical in VOLUME_WORDS:
        rvol = VOLUME_WORDS[snap.volume_vs_typical]
        notes["rvol"] = "تقدير بصري من ارتفاع أعمدة الحجم — ليس قياساً"

    ret = snap.change_pct / 100 if snap.change_pct is not None else None
    bench = snap.index_change_pct / 100 if snap.index_change_pct is not None else None

    above50 = None
    if snap.price_vs_ma50 in ("above", "below"):
        # موقع السهم من متوسطه بديل تقريبي عن حالة المؤشر حين لا تتوفّر
        above50 = snap.price_vs_ma50 == "above"
        notes["regime"] = "مبني على موقع السهم من متوسط 50، لا على المؤشر"

    return Features(
        symbol=snap.symbol,
        asof=ts,
        session_open=is_session_open(ts),
        data_age_min=max(0.0, (now - ts).total_seconds() / 60.0),
        price=snap.price,
        prev_close=snap.prev_close,
        prev_high=None, prev_low=None,          # لقطة اليوم لا تحمل مدى أمس
        vwap=snap.vwap,
        opening_range_high=None, opening_range_low=None,
        rvol=rvol,
        adv_usd=None, adv_shares=None,
        atr14=None, ma20=None, ma50=None, ma200=None,
        ret_today=ret,
        bench_ret_today=bench,
        bench_above_ma50=above50,
        sector_ret_today=None, sector_symbol=None,
        news_24h=None,
        days_to_earnings=None,
        origin="shot",
        read_notes=notes,
    )
