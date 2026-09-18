#!/usr/bin/env python3
"""يولّد أيقونات COCO CAKE من ملف الشعار الأصلي.

    pip install Pillow numpy
    python3 brand/make-icons.py

العلامة المعتمدة هي حرف الـC بساقه الطويلة — أوضح جزء من الشعار عند
حجم الأيقونة الحقيقي على الشاشة (نحو 60 بكسل). الشعار كاملاً يصير
لطخة غير مقروءة عند هذا الحجم، فمكانه داخل النظام وعلى الفواتير.
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'brand' / 'coco-cake-logo.png'
OUT = ROOT / 'public' / 'sweet-cost'

# ألوان الهوية — نفس الرموز في src/sweetcost/styles.css
BARK = (0x2A, 0x1D, 0x15)
CREAM = (0xF7, 0xF1, 0xE8)

# حدود حرف الـC مع ساقه داخل ملف الشعار (بكسل)
MARK_BOX = (170, 86, 578, 795)

# الحبر في الشعار ليس أسود خالصاً، فنعايره حتى تبقى الحواف ناعمة
INK_LUM = 40.0


def mark() -> Image.Image:
    """يعيد العلامة كقناع ألفا، مقصوصاً على حدود الحبر."""
    rgb = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
    alpha = np.clip((255.0 - rgb.sum(axis=2) / 3) / (255.0 - INK_LUM), 0, 1)

    x0, y0, x1, y1 = MARK_BOX
    a = alpha[y0:y1, x0:x1]
    ys, xs = np.where(a > 0.08)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return Image.fromarray((a * 255).astype(np.uint8), 'L')


def icon(size: int, coverage: float) -> Image.Image:
    """يركّب العلامة وسط مربّع. coverage = أكبر نسبة من الضلع تشغلها."""
    m = mark()
    limit = size * coverage
    scale = min(limit / m.width, limit / m.height)
    w, h = max(1, round(m.width * scale)), max(1, round(m.height * scale))
    m = m.resize((w, h), Image.LANCZOS)

    canvas = Image.new('RGB', (size, size), BARK)
    canvas.paste(Image.new('RGB', (w, h), CREAM), ((size - w) // 2, (size - h) // 2), m)
    return canvas


# maskable يقصّه النظام إلى دائرة، فالمنطقة الآمنة 80% من الضلع —
# نُبقي العلامة داخل نصفه حتى لا يُقتطع منها شيء على أي جهاز.
FILES = [
    ('icon-192.png', 192, 0.62),
    ('icon-512.png', 512, 0.62),
    ('icon-maskable-512.png', 512, 0.50),
    ('apple-touch-icon.png', 180, 0.60),
]

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size, coverage in FILES:
        path = OUT / name
        icon(size, coverage).save(path, optimize=True)
        print(f'{name:24} {size}×{size}  {path.stat().st_size / 1024:.1f} ك.ب')
