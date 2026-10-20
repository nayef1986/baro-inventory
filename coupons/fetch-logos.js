/**
 * جالب شعارات المتاجر.
 *
 *   node fetch-logos.js            → يجلب شعار كل متجر ليس له شعار محلي
 *   node fetch-logos.js --force    → يعيد جلب الجميع
 *   node fetch-logos.js noon shein → متاجر بعينها
 *
 * يحفظ الملفات في public/images/ ويكتب مسارها في data/stores.json.
 * يُشغَّل يدويًا لا في كل بناء: الشعارات لا تتغيّر، والبناء يجب أن يبقى بلا شبكة.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STORES = path.join(ROOT, 'data/stores.json');
const IMAGES = path.join(ROOT, 'public/images');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = args.filter((a) => !a.startsWith('--'));

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

/** ملفٌّ أصغر من هذا غالبًا أيقونة شفافة أو صفحة خطأ لا شعار. */
const MIN_BYTES = 600;

const EXT_BY_TYPE = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'image/gif': '.gif',
};

async function get(url, { asText = false } = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: asText ? 'text/html,*/*' : 'image/*,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (asText) return res.text();

  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const buf = Buffer.from(await res.arrayBuffer());
  return { type, buf };
}

/** يقرأ وسوم الأيقونات من صفحة المتجر ويرتّبها بالأكبر أولًا. */
async function iconsFromPage(origin) {
  const html = await get(origin, { asText: true });
  const found = [];

  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (/\brel\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1] || '';
    if (!/\b(apple-touch-icon|icon|shortcut icon|mask-icon)\b/i.test(rel)) continue;

    const href = (/\bhref\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1];
    if (!href || href.startsWith('data:')) continue;

    const sizes = (/\bsizes\s*=\s*["'](\d+)x\d+["']/i.exec(tag) || [])[1];
    found.push({
      url: new URL(href, origin).href,
      size: sizes ? Number(sizes) : /apple-touch/i.test(rel) ? 180 : 32,
    });
  }

  // og:image كخيار أخير — أحيانًا يحمل الشعار بجودة عالية
  const og = /<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(html);
  if (og) found.push({ url: new URL(og[1], origin).href, size: 1 });

  return found.sort((a, b) => b.size - a.size).map((x) => x.url);
}

/** مصادر مرتّبة من الأدقّ إلى الأضمن. */
async function candidates(storeUrl) {
  const origin = new URL(storeUrl).origin;
  const host = new URL(storeUrl).hostname.replace(/^www\./, '');

  let fromPage = [];
  try {
    fromPage = await iconsFromPage(origin);
  } catch (e) {
    /* الموقع قد يمنع الزحف — ننتقل للمصادر العامة */
  }

  return [
    ...fromPage,
    `${origin}/apple-touch-icon.png`,
    `${origin}/apple-touch-icon-precomposed.png`,
    `${origin}/favicon.ico`,
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
    `https://www.google.com/s2/favicons?domain=${host}&sz=256`,
  ];
}

async function fetchLogo(store) {
  for (const url of await candidates(store.url)) {
    try {
      const { type, buf } = await get(url);
      const ext = EXT_BY_TYPE[type] || path.extname(new URL(url).pathname).toLowerCase();
      if (!ext || !Object.values(EXT_BY_TYPE).includes(ext)) continue;
      if (buf.length < MIN_BYTES) continue;

      const file = `${store.slug}${ext}`;
      fs.mkdirSync(IMAGES, { recursive: true });
      fs.writeFileSync(path.join(IMAGES, file), buf);
      return { file: `/images/${file}`, from: url, bytes: buf.length };
    } catch (e) {
      /* المصدر التالي */
    }
  }
  return null;
}

async function main() {
  const stores = JSON.parse(fs.readFileSync(STORES, 'utf8'));
  const rows = [];
  let changed = 0;

  for (const store of stores) {
    if (ONLY.length && !ONLY.includes(store.slug)) continue;

    const hasLocal = store.logo && store.logo.startsWith('/images/');
    if (hasLocal && !FORCE) {
      rows.push([store.name, 'موجود', store.logo]);
      continue;
    }

    process.stdout.write(`… ${store.name}\r`);
    const hit = await fetchLogo(store);

    if (hit) {
      store.logo = hit.file;
      changed++;
      rows.push([store.name, `${(hit.bytes / 1024).toFixed(0)} ك.ب`, hit.file]);
    } else {
      rows.push([store.name, 'تعذّر', 'سيُستخدم الحرف الأول']);
    }
  }

  if (changed) fs.writeFileSync(STORES, JSON.stringify(stores, null, 2) + '\n');

  const w = Math.max(...rows.map((r) => r[0].length), 6);
  console.log('\n' + 'المتجر'.padEnd(w) + '  الحالة    الملف');
  console.log('─'.repeat(w + 34));
  for (const [a, b, c] of rows) console.log(a.padEnd(w) + '  ' + b.padEnd(9) + ' ' + c);
  console.log(`\n${changed ? `✅ حُدِّث ${changed} شعارًا في data/stores.json` : 'لا جديد.'}`);
  console.log('شغّل `npm run build` لإعادة بناء الموقع.');
}

main().catch((e) => {
  console.error('فشل:', e.message);
  process.exit(1);
});
