#!/usr/bin/env python3
"""يولّد أصول COCO CAKE البصرية من ملف الشعار الأصلي.

    pip install Pillow numpy
    python3 brand/make-assets.py

يخرج نوعان:

**الأيقونات** — حرف الـC بساقه الطويلة على مربّع شوكولاتة. الشعار كاملاً
عند حجم الأيقونة الحقيقي (نحو 60 بكسل) تصير فيه CAKE و SWEETS & TARTS
لطخة غير مقروءة، فالحرف وحده هو ما يصمد.

**الشعار الكامل** — للترويسة داخل النظام، حيث يوجد عرض كافٍ. يخرج مساراً
متجهاً داخل مكوّن React، فيتلوّن بلون النص ويبقى حاداً بأي مقاس. صورة
نقطية بنفس الوضوح تزن 181 ك.ب؛ المسار المتجه 7.7 ك.ب.

يحتاج potrace لتوليد المسار:  apt-get install potrace
"""

import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'brand' / 'coco-cake-logo.png'
OUT = ROOT / 'public' / 'sweet-cost'

# ألوان الهوية — نفس الرموز في src/sweetcost/styles.css
BARK = (0x2A, 0x1D, 0x15)
CREAM = (0xF7, 0xF1, 0xE8)

# حدود كل علامة داخل ملف الشعار (بكسل)
MARK_BOX = (170, 86, 578, 795)    # حرف C مع ساقه
FULL_BOX = (170, 86, 1325, 839)   # الشعار كاملاً

# الحبر في الشعار ليس أسود خالصاً، فنعايره حتى تبقى الحواف ناعمة
INK_LUM = 40.0


def alpha_of(box: tuple[int, int, int, int]) -> Image.Image:
    """يقصّ منطقة من الشعار ويعيدها كقناع ألفا على حدود الحبر."""
    rgb = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
    a = np.clip((255.0 - rgb.sum(axis=2) / 3) / (255.0 - INK_LUM), 0, 1)

    x0, y0, x1, y1 = box
    a = a[y0:y1, x0:x1]
    ys, xs = np.where(a > 0.08)
    return Image.fromarray((a[ys.min():ys.max() + 1, xs.min():xs.max() + 1] * 255).astype(np.uint8), 'L')


def icon(size: int, coverage: float) -> Image.Image:
    """يركّب حرف الـC وسط مربّع معتم. coverage = أكبر نسبة من الضلع يشغلها."""
    m = alpha_of(MARK_BOX)
    limit = size * coverage
    scale = min(limit / m.width, limit / m.height)
    w, h = max(1, round(m.width * scale)), max(1, round(m.height * scale))
    m = m.resize((w, h), Image.LANCZOS)

    canvas = Image.new('RGB', (size, size), BARK)
    canvas.paste(Image.new('RGB', (w, h), CREAM), ((size - w) // 2, (size - h) // 2), m)
    return canvas


def wordmark_component() -> str:
    """يحوّل الشعار الكامل إلى مسار متجه داخل مكوّن React."""
    m = alpha_of(FULL_BOX)

    with tempfile.TemporaryDirectory() as tmp:
        pgm = Path(tmp) / 'logo.pgm'
        svg = Path(tmp) / 'logo.svg'
        # potrace يعتبر الداكن هو الشكل، فنعكس القناع
        Image.eval(m, lambda v: 255 - v).save(pgm)
        subprocess.run(
            ['potrace', '-s', '-a', '1.1', '-O', '0.25', '--flat', '-o', str(svg), str(pgm)],
            check=True,
        )
        traced = svg.read_text()

    group = re.search(r'<g transform="([^"]+)"[^>]*>(.*?)</g>', traced, re.S)
    if group is None:
        raise SystemExit('potrace أخرج شكلاً غير متوقّع')
    paths = re.findall(r'<path d="(.*?)"', group.group(2), re.S)
    transform = group.group(1)

    body = '\n'.join(f'        <path d="{p.strip()}" />' for p in paths)
    return f'''// ============================================================
// Wordmark.tsx — شعار COCO CAKE الكامل
//
// ملف مُولَّد. لا تحرّره بيدك — شغّل:
//     python3 brand/make-assets.py
// المصدر: brand/coco-cake-logo.png
//
// المسار متجه ويرث اللون من النص (fill="currentColor")، فيكفي
// تمرير صنف لون مثل text-cream أو text-bark.
// ============================================================

export function Wordmark({{ className }}: {{ className?: string }}) {{
  return (
    <svg
      viewBox="0 0 {m.width} {m.height}"
      className={{className}}
      role="img"
      aria-label="Coco Cake — Sweets & Tarts"
      fill="currentColor"
    >
      <g transform="{transform}">
{body}
      </g>
    </svg>
  )
}}
'''


# maskable يقصّه النظام إلى دائرة، فالمنطقة الآمنة 80% من الضلع —
# نُبقي العلامة داخل نصفه حتى لا يُقتطع منها شيء على أي جهاز.
ICONS = [
    ('icon-192.png', 192, 0.62),
    ('icon-512.png', 512, 0.62),
    ('icon-maskable-512.png', 512, 0.50),
    ('apple-touch-icon.png', 180, 0.60),
]

WORDMARK = ROOT / 'src' / 'sweetcost' / 'components' / 'Wordmark.tsx'

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)

    for name, size, coverage in ICONS:
        path = OUT / name
        icon(size, coverage).save(path, optimize=True)
        print(f'{name:24} {size}×{size}  {path.stat().st_size / 1024:.1f} ك.ب')

    WORDMARK.write_text(wordmark_component())
    print(f'{WORDMARK.name:24} متجه     {WORDMARK.stat().st_size / 1024:.1f} ك.ب')
