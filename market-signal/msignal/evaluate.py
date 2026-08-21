"""قياس الأداء بعد وقوعه — الطبقة التي تفصل الأداة عن الديكور.

السؤال الوحيد المهم: هل الإشارات الخضراء أدّت لنتائج أفضل من الرمادية،
وأفضل من مجرد شراء المؤشر؟
"""
from __future__ import annotations

import sqlite3
from datetime import datetime
from statistics import mean, median
from typing import Optional

import pandas as pd

from .providers.base import ET

HORIZONS = (("ret_1d", "bench_1d", 1), ("ret_5d", "bench_5d", 5),
            ("ret_20d", "bench_20d", 20))


def _forward_return(daily: pd.DataFrame, run_ts: datetime, entry: float, n: int):
    """عائد بعد n جلسة مكتملة من وقت التشغيل. None إذا لم يمرّ الوقت بعد."""
    idx = pd.to_datetime(daily.index)
    dates = idx.tz_convert(ET).date if idx.tz is not None else idx.date
    run_date = run_ts.date()
    after = [i for i, d in enumerate(dates) if d > run_date]
    if len(after) < n:
        return None
    close = float(daily["Close"].iloc[after[n - 1]])
    return close / entry - 1.0


def fill_outcomes(provider, con: Optional[sqlite3.Connection] = None,
                  benchmark: str = "SPY", limit: int = 500) -> int:
    """يملأ العوائد اللاحقة للتشغيلات غير المقيَّمة. يعيد عدد الصفوف المحدَّثة."""
    from .store import connect

    own = con is None
    con = con or connect()
    updated = 0
    try:
        rows = con.execute(
            "SELECT * FROM runs WHERE gated=0 AND (ret_20d IS NULL) ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        if not rows:
            return 0

        cache: dict[str, pd.DataFrame] = {}

        def daily_for(sym: str) -> pd.DataFrame:
            if sym not in cache:
                cache[sym] = provider.fetch(sym, benchmark=benchmark).daily
            return cache[sym]

        bench_daily = daily_for(benchmark)

        for r in rows:
            try:
                d = daily_for(r["symbol"])
            except Exception:
                continue
            ts = datetime.fromisoformat(r["ts"])
            # المؤشر يُقاس من إغلاقه وقت التشغيل، لا من سعر السهم
            bentry = _bench_entry(bench_daily, ts)
            sets, vals = [], []
            for col, bcol, n in HORIZONS:
                sr = _forward_return(d, ts, r["price"], n)
                if sr is not None:
                    sets += [f"{col}=?"]; vals += [sr]
                if bentry:
                    b = _forward_return(bench_daily, ts, bentry, n)
                    if b is not None:
                        sets += [f"{bcol}=?"]; vals += [b]
            if sets:
                sets.append("evaluated_at=?"); vals.append(datetime.now().isoformat())
                con.execute(f"UPDATE runs SET {', '.join(sets)} WHERE id=?",
                            (*vals, r["id"]))
                updated += 1
        con.commit()
        return updated
    finally:
        if own:
            con.close()


def _bench_entry(bench_daily: pd.DataFrame, run_ts: datetime):
    """إغلاق المؤشر في آخر جلسة مكتملة قبل التشغيل."""
    idx = pd.to_datetime(bench_daily.index)
    dates = idx.tz_convert(ET).date if idx.tz is not None else idx.date
    before = [i for i, d in enumerate(dates) if d <= run_ts.date()]
    return float(bench_daily["Close"].iloc[before[-1]]) if before else None


def summary(con: Optional[sqlite3.Connection] = None) -> str:
    from .store import connect

    own = con is None
    con = con or connect()
    try:
        rows = [dict(r) for r in con.execute("SELECT * FROM runs WHERE gated=0").fetchall()]
    finally:
        if own:
            con.close()

    if not rows:
        return "لا توجد تشغيلات مقيَّمة بعد."

    out = ["السؤال: هل الأخضر أفضل من الرمادي، وأفضل من المؤشر؟", ""]
    out.append(f"{'الضوء':<8}{'العدد':>7}{'الأفق':>8}{'المتوسط':>10}"
               f"{'الوسيط':>10}{'نسبة الربح':>12}{'مقابل المؤشر':>14}")
    out.append("-" * 70)
    for light in ("GREEN", "GRAY", "RED"):
        grp = [r for r in rows if r["light"] == light]
        if not grp:
            continue
        for col, bcol, n in HORIZONS:
            vals = [r[col] for r in grp if r[col] is not None]
            if not vals:
                continue
            ex = [r[col] - r[bcol] for r in grp
                  if r[col] is not None and r[bcol] is not None]
            hit = sum(1 for v in vals if v > 0) / len(vals)
            out.append(
                f"{light:<8}{len(vals):>7}{n:>7}ي{mean(vals)*100:>9.2f}%"
                f"{median(vals)*100:>9.2f}%{hit*100:>11.0f}%"
                f"{(mean(ex)*100 if ex else float('nan')):>13.2f}%"
            )
    out += ["", "قاعدة الحكم: إن لم يتفوّق الأخضر على الرمادي وعلى المؤشر معاً",
            "بفارق واضح وعبر عدد كافٍ من التشغيلات، فالقواعد تحتاج مراجعة لا السوق."]
    return "\n".join(out)
