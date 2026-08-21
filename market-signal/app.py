"""واجهة الزر الواحد. التشغيل:  streamlit run app.py"""
from __future__ import annotations

from pathlib import Path

import streamlit as st

from cli import load_config
from msignal import disclaimer, evaluate, store
from msignal.decide import analyze
from msignal.models import GRAY, GREEN, RED

ROOT = Path(__file__).resolve().parent

st.set_page_config(page_title="إشارة شخصية", page_icon="🔎", layout="centered")
st.markdown(
    """<style>
    .stApp, .stApp p, .stApp li, .stApp label, .stApp h1, .stApp h2, .stApp h3
        { direction: rtl; text-align: right; }
    .card { border-radius: 14px; padding: 18px 22px; margin: 6px 0 14px; }
    .green { background: rgba(22,163,74,.12); border: 1px solid rgba(22,163,74,.45); }
    .red   { background: rgba(220,38,38,.12); border: 1px solid rgba(220,38,38,.45); }
    .gray  { background: rgba(120,120,120,.12); border: 1px solid rgba(120,120,120,.40); }
    .big { font-size: 1.6rem; font-weight: 700; }
    .muted { opacity:.75; font-size:.92rem; }
    </style>""",
    unsafe_allow_html=True,
)

STYLE = {GREEN: ("green", "🟢 إشارة إيجابية"),
         RED: ("red", "🔴 قراءة سلبية"),
         GRAY: ("gray", "⚪ لا إعداد واضح")}


# ------------------------------------------------------ بوابة إخلاء المسؤولية
if not store.accepted_disclaimer():
    st.title("قبل البدء")
    st.code(disclaimer.FULL, language=None)
    if st.checkbox(disclaimer.ACK_LINE):
        store.accept_disclaimer()
        st.rerun()
    st.stop()


cfg = load_config(ROOT / "config.yaml")

with st.sidebar:
    st.header("الإعدادات")
    demo = st.selectbox(
        "وضع البيانات",
        ["مباشر (yfinance)", "bull", "bull_extended", "bear", "quiet", "thin", "stale"],
        help="السيناريوهات بيانات مولَّدة للتجربة — لا علاقة لها بأي سوق حقيقي",
    )
    cfg["account"]["equity"] = st.number_input(
        "رأس المال ($)", 100, 10_000_000, int(cfg["account"]["equity"]), step=500)
    cfg["account"]["risk_pct"] = st.slider(
        "المخاطرة لكل صفقة %", 0.25, 3.0, float(cfg["account"]["risk_pct"]) * 100, 0.25) / 100
    st.divider()
    if st.button("تقرير أداء الإشارات"):
        st.session_state["show_summary"] = True

st.title("🔎 أداة الإشارة الشخصية")
st.caption(disclaimer.SHORT)

col1, col2 = st.columns([3, 1])
symbol = col1.text_input("الرمز", value="AAPL", label_visibility="collapsed").upper()
go = col2.button("حلّل", type="primary", use_container_width=True)


def provider():
    if demo.startswith("مباشر"):
        from msignal.providers import YahooProvider
        return YahooProvider()
    from msignal.providers import SyntheticProvider
    st.warning("وضع تجريبي: البيانات مولَّدة بالكامل ولا تمثّل أي سوق.")
    return SyntheticProvider(demo)


def show(v):
    cls, title = STYLE[v.light]
    f = v.features
    st.markdown(
        f'<div class="card {cls}"><div class="big">{title} — {v.symbol}</div>'
        f'<div class="muted">النتيجة {v.score:+.2f} · {v.reason}</div></div>',
        unsafe_allow_html=True,
    )

    if f:
        c = st.columns(4)
        c[0].metric("السعر", f"{f.price:,.2f}", f"{f.ret_today*100:+.2f}%")
        c[1].metric("VWAP", f"{f.vwap:,.2f}" if f.vwap else "—")
        c[2].metric("الحجم النسبي", f"{f.rvol:.1f}x" if f.rvol else "—")
        c[3].metric("عمر البيانات", f"{f.data_age_min:.0f} د")

    st.subheader("العوامل")
    for s in v.signals:
        icon = "✅" if s.score >= 0.5 else ("❌" if s.score <= -0.3 else "⚪")
        stale = "" if s.is_fresh else " · بيانات ناقصة"
        st.progress(
            (s.score + 1) / 2,
            text=f"{icon} **{s.name}** {s.score:+.2f} (وزن {s.weight:.2f}) — {s.evidence}{stale}",
        )

    if v.plan:
        p = v.plan
        st.subheader("خطة التنفيذ")
        c = st.columns(3)
        c[0].metric("مستوى الإبطال", f"{p.invalidation:,.2f}", f"-{p.stop_pct*100:.1f}%")
        c[1].metric("الحجم المقترح", f"{p.shares:,} سهم", f"${p.position_usd:,.0f}")
        c[2].metric("الخسارة عند الإبطال", f"${p.risk_usd:,.0f}")
        for n in p.notes:
            st.caption(f"• {n}")
    elif v.light == RED:
        st.info("قراءة سلبية = تجنّب أو خروج. الأداة لا تقترح بيعاً على المكشوف.")

    st.divider()
    with st.expander("إخلاء المسؤولية الكامل"):
        st.code(disclaimer.FULL, language=None)


if go and symbol:
    with st.spinner("جاري الجلب والحساب…"):
        try:
            md = provider().fetch(symbol, benchmark=cfg.get("benchmark", "SPY"))
            v = analyze(md, cfg)
            store.log_run(v)
            show(v)
        except Exception as exc:
            st.error(f"تعذّر التحليل: {exc}")

if st.session_state.get("show_summary"):
    st.divider()
    st.subheader("هل الأداة تنفع؟")
    st.code(evaluate.summary(), language=None)
