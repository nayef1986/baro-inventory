// ============================================================
// fetch-fonts.mjs — تنزيل خط ثمانية محلياً
//
// التشغيل: npm run fonts:local
//
// بدونه يعمل التطبيق أيضاً: ملفات @font-face تسقط تلقائياً
// إلى نسخة CDN. تنزيلها محلياً يلغي الاعتماد الخارجي ويجعل
// الخط يعمل داخل التطبيق المثبّت بلا شبكة.
// ============================================================

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = 'https://cdn.jsdelivr.net/gh/engdawood/thmanyah-font-web@4266a9d/fonts'
const OUT = join(import.meta.dirname, '..', 'public', 'sweet-cost', 'fonts')

const FILES = [
  'thmanyah-sans/woff2/thmanyah-sans-Regular.woff2',
  'thmanyah-sans/woff2/thmanyah-sans-Medium.woff2',
  'thmanyah-sans/woff2/thmanyah-sans-Bold.woff2',
  'thmanyah-serif-display/woff2/thmanyah-serif-display-Regular.woff2',
  'thmanyah-serif-display/woff2/thmanyah-serif-display-Bold.woff2',
]

await mkdir(OUT, { recursive: true })

let ok = 0
for (const path of FILES) {
  const name = path.split('/').pop()
  try {
    const res = await fetch(`${BASE}/${path}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    await writeFile(join(OUT, name), Buffer.from(await res.arrayBuffer()))
    console.log(`✓ ${name}`)
    ok++
  } catch (e) {
    console.error(`✗ ${name} — ${e.message}`)
  }
}

console.log(`\n${ok}/${FILES.length} ملف. الخط مرخّص من ثمانية: https://font.thmanyah.com/licenses`)
if (ok < FILES.length) process.exitCode = 1
