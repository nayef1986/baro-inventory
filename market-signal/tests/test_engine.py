"""اختبارات المحرك على بيانات صناعية — لا شبكة، ونتائج حتمية.

    python -m pytest tests -q      أو      python tests/test_engine.py
"""
from __future__ import annotations

import sys
import tempfile
from datetime import datetime
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from msignal import store                                   # noqa: E402
from msignal.decide import analyze, build_plan              # noqa: E402
from msignal.evaluate import _forward_return                # noqa: E402
from msignal.features import build_features                 # noqa: E402
from msignal.models import GRAY, GREEN, RED                 # noqa: E402
from msignal.providers import SyntheticProvider             # noqa: E402
from msignal.providers.base import ET                       # noqa: E402

CFG = yaml.safe_load(open(Path(__file__).resolve().parents[1] / "config.yaml",
                          encoding="utf-8"))


def run(scenario: str, **kw):
    return analyze(SyntheticProvider(scenario, **kw).fetch("TEST"), CFG)


# ------------------------------------------------------------------ الميزات
def test_rvol_matches_generated_ratio():
    f = build_features(SyntheticProvider("bull").fetch("T"))
    assert abs(f.rvol - 2.6) < 0.01, "الحجم النسبي يجب أن يطابق النسبة المولَّدة"


def test_vwap_side_follows_trend():
    fu = build_features(SyntheticProvider("bull").fetch("T"))
    fb = build_features(SyntheticProvider("bear").fetch("T"))
    assert fu.price > fu.vwap and fb.price < fb.vwap


def test_partial_session_excluded_from_daily():
    md = SyntheticProvider("bull").fetch("T")
    assert md.daily.index[-1].date() < md.asof.date(), \
        "شمعة اليوم الجارية تسرّب المستقبل ويجب استبعادها"


# ------------------------------------------------------------------ القرارات
def test_clean_uptrend_is_green():
    v = run("bull")
    assert v.light == GREEN and v.plan is not None


def test_extended_stock_is_rejected():
    v = run("bull_extended")
    assert v.light == GRAY and "متمدّد" in v.reason


def test_downtrend_is_red_without_short_advice():
    v = run("bear")
    assert v.light == RED and v.plan is None and "المكشوف" in v.reason


def test_quiet_tape_is_gray():
    assert run("quiet").light == GRAY


def test_volume_is_directional_not_bullish_by_default():
    """حجم ضخم في يوم هابط يجب أن يكون تأكيداً سلبياً لا إشارة شراء."""
    s = {x.name: x for x in run("bear").signals}["rvol"]
    assert s.score < 0


# -------------------------------------------------------------------- البوابة
def test_thin_liquidity_is_gated():
    v = run("thin")
    assert v.gated and v.light == GRAY and "سيولة" in v.reason


def test_stale_data_is_gated():
    v = run("stale")
    assert v.gated and "متأخرة" in v.reason


def test_gate_blocks_before_scoring():
    assert run("thin").score == 0.0, "لا حكم رقمي على بيانات مرفوضة"


# --------------------------------------------------------------- خطة المخاطر
def test_risk_never_exceeds_configured_pct():
    v = run("bull")
    max_risk = CFG["account"]["equity"] * CFG["account"]["risk_pct"]
    assert v.plan.risk_usd <= max_risk + 1e-6


def test_position_respects_concentration_cap():
    v = run("bull")
    cap = CFG["account"]["equity"] * CFG["risk"]["max_position_pct"]
    assert v.plan.position_usd <= cap + v.features.price


def test_stop_is_below_price_and_not_noise_tight():
    f = build_features(SyntheticProvider("bull").fetch("T"))
    p = build_plan(f, CFG)
    assert p.invalidation < f.price
    assert (f.price - p.invalidation) >= 0.5 * f.atr14 - 1e-9


# ------------------------------------------------------------------- التخزين
def test_run_is_logged_and_readable():
    db = Path(tempfile.mkdtemp()) / "t.db"
    con = store.connect(db)
    rid = store.log_run(run("bull"), con)
    rows = store.recent(5, con)
    con.close()
    assert rid > 0 and rows and rows[0]["light"] == GREEN


def test_forward_return_refuses_future_it_cannot_see():
    md = SyntheticProvider("bull").fetch("T")
    ts = datetime.combine(md.daily.index[-2].date(), datetime.min.time(), tzinfo=ET)
    assert _forward_return(md.daily, ts, 100.0, 20) is None


if __name__ == "__main__":
    fns = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_")]
    failed = 0
    for name, fn in fns:
        try:
            fn()
            print(f"  ✅ {name}")
        except AssertionError as e:
            failed += 1
            print(f"  ❌ {name}  — {e}")
        except Exception as e:
            failed += 1
            print(f"  💥 {name}  — {type(e).__name__}: {e}")
    print(f"\n{len(fns) - failed}/{len(fns)} اختباراً ناجحاً")
    sys.exit(1 if failed else 0)
