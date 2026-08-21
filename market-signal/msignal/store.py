"""سجل التشغيلات — بدونه لا تعرف أبداً إن كانت أداتك تنفع.

كل ضغطة زر تُخزَّن، ثم تُملأ نتائجها لاحقاً في evaluate.py.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

from .models import Verdict

DB_PATH = Path(__file__).resolve().parent.parent / "runs.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ts            TEXT NOT NULL,
    symbol        TEXT NOT NULL,
    light         TEXT NOT NULL,
    score         REAL,
    reason        TEXT,
    gated         INTEGER DEFAULT 0,
    price         REAL,
    invalidation  REAL,
    shares        INTEGER,
    factors_json  TEXT,
    features_json TEXT,
    ret_1d  REAL, ret_5d  REAL, ret_20d  REAL,
    bench_1d REAL, bench_5d REAL, bench_20d REAL,
    evaluated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_symbol_ts ON runs(symbol, ts);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
"""


def connect(path: Optional[Path] = None) -> sqlite3.Connection:
    con = sqlite3.connect(path or DB_PATH)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    return con


def log_run(v: Verdict, con: Optional[sqlite3.Connection] = None) -> int:
    own = con is None
    con = con or connect()
    try:
        factors = [
            {"name": s.name, "score": round(s.score, 4), "weight": s.weight,
             "evidence": s.evidence, "fresh": s.is_fresh}
            for s in v.signals
        ]
        f = v.features
        cur = con.execute(
            """INSERT INTO runs (ts, symbol, light, score, reason, gated, price,
                                 invalidation, shares, factors_json, features_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                (f.asof if f else datetime.now()).isoformat(),
                v.symbol, v.light, round(v.score, 4), v.reason, int(v.gated),
                f.price if f else None,
                v.plan.invalidation if v.plan else None,
                v.plan.shares if v.plan else None,
                json.dumps(factors, ensure_ascii=False),
                json.dumps(f.as_row(), ensure_ascii=False, default=str) if f else None,
            ),
        )
        con.commit()
        return int(cur.lastrowid)
    finally:
        if own:
            con.close()


def accepted_disclaimer(con: Optional[sqlite3.Connection] = None) -> bool:
    own = con is None
    con = con or connect()
    try:
        row = con.execute("SELECT v FROM meta WHERE k='disclaimer_ack'").fetchone()
        return bool(row and row["v"])
    finally:
        if own:
            con.close()


def accept_disclaimer(con: Optional[sqlite3.Connection] = None) -> None:
    own = con is None
    con = con or connect()
    try:
        con.execute("INSERT OR REPLACE INTO meta (k, v) VALUES ('disclaimer_ack', ?)",
                    (datetime.now().isoformat(),))
        con.commit()
    finally:
        if own:
            con.close()


def recent(limit: int = 50, con: Optional[sqlite3.Connection] = None) -> list[dict]:
    own = con is None
    con = con or connect()
    try:
        rows = con.execute(
            "SELECT * FROM runs ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        if own:
            con.close()
