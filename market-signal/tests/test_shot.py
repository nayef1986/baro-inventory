"""اختبارات مسار لقطة الشاشة — بلا شبكة وبلا استدعاء أي واجهة.

القراءة البصرية تُحاكى بكائن Extraction جاهز، فما يُختبَر هنا هو ما يلي
القراءة: التحويل، والتدهور المتدرّج، والبوابة، والخطة.
"""
from __future__ import annotations

import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from msignal import snapshot as snap_mod                    # noqa: E402
from msignal.decide import analyze_features, build_plan     # noqa: E402
from msignal.models import GRAY, GREEN                      # noqa: E402
from msignal.providers.base import ET                       # noqa: E402
from msignal.vision import Extraction, to_snapshot          # noqa: E402

CFG = yaml.safe_load(open(Path(__file__).resolve().parents[1] / "config.yaml",
                          encoding="utf-8"))


def full_read(**over) -> Extraction:
    base = dict(price=27.50, prev_close=27.00, change_pct=1.85, day_high=27.80,
                day_low=26.90, volume_today=3_200_000, vwap=27.20,
                index_change_pct=0.40, volume_vs_typical="much_higher",
                price_vs_ma50="above")
    base.update(over)
    return Extraction(**base)


# ثلاثاء ثابت في منتصف الجلسة — حتى لا تعتمد النتائج على وقت التشغيل
SESSION = datetime(2026, 3, 10, 12, 50, tzinfo=ET)


def features(**over):
    snap = to_snapshot("2222", full_read(**over))
    snap.captured_at = SESSION
    return snap_mod.to_features(snap, now=SESSION)


def verdict(**over):
    return analyze_features(features(**over), CFG)


# ------------------------------------------------------------ القراءة والتحويل
def test_read_without_price_is_refused():
    try:
        to_snapshot("2222", Extraction(day_high=10.0))
    except ValueError:
        return
    raise AssertionError("قراءة بلا سعر يجب أن تُرفض")


def test_prev_close_derived_from_change_when_absent():
    s = to_snapshot("2222", full_read(prev_close=None))
    assert s.prev_close and abs(s.prev_close - 27.0) < 0.02


def test_change_derived_from_prev_close_when_absent():
    s = to_snapshot("2222", full_read(change_pct=None))
    assert s.change_pct and abs(s.change_pct - 1.85) < 0.02


def test_history_absent_fields_stay_none():
    f = features()
    assert f.atr14 is None and f.ma50 is None and f.adv_usd is None
    assert f.prev_high is None and f.origin == "shot"


# -------------------------------------------------------------- التدهور المتدرّج
def test_missing_factors_are_reported_not_scored_as_zero():
    v = verdict()
    assert set(v.missing) == {"catalyst", "extension"}
    assert 0.75 < v.completeness < 0.95


def test_verdict_still_reachable_from_a_good_screen():
    assert verdict().light == GREEN


def test_visual_volume_estimate_is_labelled_as_estimate():
    f = features()
    assert "تقدير بصري" in f.read_notes["rvol"]


def test_too_little_evidence_forces_gray():
    """بلا مؤشر وبلا حجم وبلا VWAP لا يبقى إلا عامل واحد."""
    v = verdict(index_change_pct=None, volume_today=None, volume_vs_typical=None,
                price_vs_ma50=None, vwap=None)
    assert v.light == GRAY and v.completeness < 0.6


def test_screen_without_direction_reference_is_gated():
    v = verdict(vwap=None, change_pct=None, prev_close=None)
    assert v.gated and "مرجع" in v.reason


# ---------------------------------------------------------------------- الخطة
def test_plan_without_atr_says_so_and_still_sizes():
    f = features()
    p = build_plan(f, CFG)
    assert p.invalidation < f.price and p.shares > 0
    assert any("لا مقياس تقلّب" in n for n in p.notes)


def test_risk_cap_holds_on_snapshot_path():
    v = verdict()
    assert v.plan.risk_usd <= CFG["account"]["equity"] * CFG["account"]["risk_pct"] + 1e-6


# -------------------------------------------------------------- مرجع الحجم
def test_baseline_needs_enough_history():
    db = Path(tempfile.mkdtemp()) / "s.db"
    con = snap_mod.connect(db)
    now = datetime.now(ET)
    for i in range(1, 4):                      # ثلاثة أيام فقط
        s = snap_mod.Snapshot(symbol="T", price=10.0, volume_today=1_000_000,
                              captured_at=now - timedelta(days=i))
        snap_mod.save(s, con)
    assert snap_mod.volume_baseline("T", now.hour * 60 + now.minute, con=con) is None

    for i in range(4, 9):
        s = snap_mod.Snapshot(symbol="T", price=10.0, volume_today=1_000_000,
                              captured_at=now - timedelta(days=i))
        snap_mod.save(s, con)
    base = snap_mod.volume_baseline("T", now.hour * 60 + now.minute, con=con)
    con.close()
    assert base == 1_000_000


def test_baseline_ignores_other_times_of_day():
    db = Path(tempfile.mkdtemp()) / "s.db"
    con = snap_mod.connect(db)
    now = datetime.now(ET).replace(hour=12, minute=0)
    for i in range(1, 9):                      # لقطات قرب الإغلاق
        snap_mod.save(snap_mod.Snapshot(symbol="T", price=10.0, volume_today=9_000_000,
                                        captured_at=(now - timedelta(days=i)).replace(hour=15)), con)
    got = snap_mod.volume_baseline("T", 12 * 60, con=con)
    con.close()
    assert got is None, "حجم آخر اليوم ليس مرجعاً لمنتصفه"


if __name__ == "__main__":
    fns = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_")]
    failed = 0
    for name, fn in fns:
        try:
            fn(); print(f"  ✅ {name}")
        except AssertionError as e:
            failed += 1; print(f"  ❌ {name}  — {e}")
        except Exception as e:
            failed += 1; print(f"  💥 {name}  — {type(e).__name__}: {e}")
    print(f"\n{len(fns) - failed}/{len(fns)} اختباراً ناجحاً")
    sys.exit(1 if failed else 0)
