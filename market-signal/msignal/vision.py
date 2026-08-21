"""قراءة لقطة شاشة من منصة التداول وتحويلها إلى Snapshot.

مبدأ صارم: هذه الطبقة **تقرأ ولا تحلّل**. تستخرج الأرقام المطبوعة على الصورة
فقط، ولا تحسب ولا تخمّن ولا تعطي رأياً. التحليل يبقى في محرك القواعد، والقراءة
لا تدخل المحرك قبل أن يؤكّدها الإنسان.
"""
from __future__ import annotations

import base64
import mimetypes
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field

from .snapshot import Snapshot

MODEL = "claude-opus-5"

VolumeWord = Literal["much_higher", "higher", "normal", "lower", "much_lower"]
Side = Literal["above", "below"]

INSTRUCTIONS = """\
أنت تقرأ لقطات شاشة من منصة تداول أسهم. مهمتك **النسخ الحرفي للأرقام الظاهرة**.

قواعد لا تُخالَف:
1. انسخ فقط ما هو مطبوع ومقروء في الصورة. لا تحسب، ولا تستنتج، ولا تقدّر رقماً
   غير معروض.
2. أي حقل غير ظاهر أو غير واضح → null، وأضف اسمه إلى unreadable.
3. لا تعطِ رأياً ولا توصية ولا تحليلاً. أنت ناسخ أرقام فقط.
4. انتبه للفواصل العشرية وفواصل الآلاف وللأرقام العربية والهندية.
5. إن كانت الصورة تعرض رصيد حساب أو مراكز مملوكة أو اسم مالك أو رقم حساب،
   اضبط contains_account_info = true (سيُنبَّه المستخدم لاقتصاص الصورة).

عن صورة الشارت إن وُجدت — تقديرات بصرية خشنة لا قياسات:
• volume_vs_typical: قارن عمود حجم اليوم بأعمدة الأيام الظاهرة.
• price_vs_ma50 / price_vs_ma20: موقع السعر من المتوسطات إن كانت مرسومة
  ومُسمّاة بوضوح فقط. إن لم تكن مُسمّاة → null.

إن ظهرت عدة أسهم في اللقطة، اقرأ السهم المطلوب فقط: {symbol}
"""


class Extraction(BaseModel):
    """ما قُرئ من الصور. كل حقل قد يكون null إذا لم يظهر."""

    symbol_seen: Optional[str] = Field(None, description="رمز أو اسم السهم كما ظهر")
    currency: Optional[str] = Field(None, description="عملة الأسعار إن ظهرت")

    price: Optional[float] = Field(None, description="آخر سعر تداول")
    prev_close: Optional[float] = Field(None, description="إغلاق أمس")
    change_pct: Optional[float] = Field(None, description="نسبة التغيّر اليوم")
    day_high: Optional[float] = None
    day_low: Optional[float] = None
    volume_today: Optional[float] = Field(None, description="عدد الأسهم المتداولة اليوم")
    trades_today: Optional[int] = Field(None, description="عدد الصفقات اليوم")
    vwap: Optional[float] = Field(None, description="فقط إذا كان معروضاً صراحة")
    bid: Optional[float] = None
    ask: Optional[float] = None

    index_name: Optional[str] = Field(None, description="اسم المؤشر العام إن ظهر")
    index_change_pct: Optional[float] = Field(None, description="تغيّر المؤشر اليوم")

    volume_vs_typical: Optional[VolumeWord] = None
    price_vs_ma50: Optional[Side] = None
    price_vs_ma20: Optional[Side] = None

    timestamp_seen: Optional[str] = Field(None, description="وقت التحديث كما ظهر")
    unreadable: list[str] = Field(default_factory=list)
    contains_account_info: bool = False


def _image_block(path: Path) -> dict:
    media = mimetypes.guess_type(path.name)[0] or "image/png"
    if media not in ("image/png", "image/jpeg", "image/gif", "image/webp"):
        raise ValueError(f"صيغة غير مدعومة: {path.name} — استخدم PNG أو JPEG")
    data = base64.standard_b64encode(path.read_bytes()).decode("utf-8")
    return {"type": "image",
            "source": {"type": "base64", "media_type": media, "data": data}}


def read_screens(symbol: str, paths: list[str | Path], client=None) -> Extraction:
    """يقرأ لقطة واحدة أو أكثر ويعيد ما استُخرج منها."""
    import anthropic

    files = [Path(p) for p in paths]
    for f in files:
        if not f.exists():
            raise FileNotFoundError(f"الصورة غير موجودة: {f}")
        if f.stat().st_size > 5 * 1024 * 1024:
            raise ValueError(f"الصورة كبيرة جداً ({f.name}) — اقتصّها أو صغّرها")

    client = client or anthropic.Anthropic()
    content: list[dict] = [_image_block(f) for f in files]
    content.append({"type": "text", "text": INSTRUCTIONS.format(symbol=symbol)})

    response = client.messages.parse(
        model=MODEL,
        max_tokens=8000,
        messages=[{"role": "user", "content": content}],
        output_format=Extraction,
    )
    return response.parsed_output


def to_snapshot(symbol: str, ex: Extraction) -> Snapshot:
    """يحوّل قراءة مؤكَّدة إلى Snapshot. يرفض القراءة بلا سعر."""
    if ex.price is None:
        raise ValueError("لم يُقرأ سعر من الصورة — لا يمكن المتابعة")

    return Snapshot(
        symbol=symbol,
        price=ex.price,
        prev_close=ex.prev_close,
        day_high=ex.day_high,
        day_low=ex.day_low,
        change_pct=ex.change_pct,
        volume_today=ex.volume_today,
        vwap=ex.vwap,
        bid=ex.bid,
        ask=ex.ask,
        trades_today=ex.trades_today,
        index_name=ex.index_name,
        index_change_pct=ex.index_change_pct,
        volume_vs_typical=ex.volume_vs_typical,
        price_vs_ma50=ex.price_vs_ma50,
        price_vs_ma20=ex.price_vs_ma20,
        unreadable=list(ex.unreadable),
        read_notes={"source": "لقطة شاشة مؤكَّدة يدوياً",
                    "timestamp_seen": ex.timestamp_seen or "غير ظاهر"},
    )


# الحقول التي يراجعها المستخدم قبل أي تحليل، بالترتيب
REVIEW_FIELDS = [
    ("price", "السعر الحالي"),
    ("prev_close", "إغلاق أمس"),
    ("change_pct", "التغيّر اليوم %"),
    ("day_high", "أعلى سعر اليوم"),
    ("day_low", "أدنى سعر اليوم"),
    ("volume_today", "حجم التداول اليوم"),
    ("vwap", "VWAP إن ظهر"),
    ("index_change_pct", "تغيّر المؤشر العام %"),
    ("volume_vs_typical", "الحجم مقارنة بالمعتاد"),
    ("price_vs_ma50", "السعر من متوسط 50"),
]
