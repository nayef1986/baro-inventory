/**
 * مولّد الموقع الثابت — نظام أكواد خصم بواجهة تطبيق جوال (PWA).
 *
 *   node build.js                          → ينتج dist/
 *   SITE_URL=https://x.com node build.js   → يتجاوز الدومين المكتوب في data/site.json
 *
 * كل صفحة HTML كاملة قبل أن يصل أي جافاسكربت، فمحركات البحث تقرأ الأكواد نصًّا.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');

const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const rawStores = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stores.json'), 'utf8'));
const rawAds = readJsonOr('data/ads.json', []);
const rawPosts = readJsonOr('data/posts.json', []);

function readJsonOr(rel, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  } catch (e) {
    return fallback;
  }
}

const ORIGIN = (process.env.SITE_URL || site.domain || '').replace(/\/+$/, '');
const NOW = new Date();
const BUILT_AT = NOW.toISOString().slice(0, 10);
const YEAR = NOW.getFullYear();
const DAY = 86400000;

/* ======================= أدوات ======================= */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * رابط مطلق مُرمَّز. تصنيفات الموقع بأسماء عربية في المسار — وهو أفضل لنتائج البحث
 * العربية — لكن canonical وخريطة الموقع تتطلبان ترميز النسبة المئوية.
 * الأقواس المعقوفة تُستثنى لأن قالب SearchAction يحتاجها كما هي.
 */
const abs = (p) =>
  ORIGIN +
  encodeURI(p.startsWith('/') ? p : '/' + p)
    .replace(/%7B/g, '{')
    .replace(/%7D/g, '}');

/** تحويل نصٍّ عربي أو لاتيني إلى معرّف صالح للروابط. */
const slugify = (s) =>
  String(s || '')
    .trim()
    .replace(/[\u0617-\u061A\u064B-\u0652\u0640]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ar', { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
};

/** صيغة العدد بالعربية: مفرد، مثنّى، جمع قلّة (٣-١٠)، ثم تمييز منصوب مفرد (١١+). */
function arCount(n, one, two, few, many) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

const codesLabel = (n) => arCount(n, 'كود فعّال', 'كودان فعّالان', 'أكواد فعّالة', 'كودًا فعّالًا');
const soonLabel = (n) =>
  n <= 0 ? 'ينتهي اليوم' : `ينتهي بعد ${arCount(n, 'يوم واحد', 'يومين', 'أيام', 'يومًا')}`;
const storesLabel = (n) => arCount(n, 'متجر واحد', 'متجران', 'متاجر', 'متجرًا');

/** لون نص مقروء فوق لون العلامة — أسود على الفاتح وأبيض على الداكن. */
function readableInk(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '#ffffff';
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? '#16181d' : '#ffffff';
}

/* ======================= تجهيز البيانات ======================= */

const daysUntil = (iso) => {
  if (!iso) return Infinity;
  const d = new Date(iso + 'T23:59:59Z').getTime();
  return Number.isNaN(d) ? Infinity : Math.ceil((d - NOW.getTime()) / DAY);
};

const daysSince = (iso) => {
  if (!iso) return Infinity;
  const d = new Date(iso + 'T00:00:00Z').getTime();
  return Number.isNaN(d) ? Infinity : Math.floor((NOW.getTime() - d) / DAY);
};

/** ترتيب الأكواد: المميّز أولًا، ثم الأعلى قيمة، ثم الأقرب انتهاءً. */
function codeRank(c) {
  const pct = /(\d+(?:\.\d+)?)\s*%/.exec(c.discount || '');
  const value = pct ? Number(pct[1]) : 0;
  return [c.featured ? 0 : 1, -value, daysUntil(c.expires)];
}

const stores = rawStores
  .map((s) => {
    const codes = (s.codes || [])
      .filter((c) => c.code && daysUntil(c.expires) >= 0)
      .map((c) => ({
        ...c,
        id: `${s.slug}-${slugify(c.code)}`,
        endingSoon: daysUntil(c.expires) <= 14,
        isNew: daysSince(c.addedAt) <= 14,
      }))
      .sort((a, b) => {
        const [ra, rb] = [codeRank(a), codeRank(b)];
        return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
      });
    return { ...s, codes, categorySlug: slugify(s.category) };
  })
  .filter((s) => s.codes.length > 0);

// مرجع راجع من الكود إلى متجره: بطاقة الكود تحتاج المتجر أينما عُرضت.
stores.forEach((s) => s.codes.forEach((c) => { c.store = s; }));

const allCodes = stores.flatMap((s) => s.codes);
allCodes.sort((a, b) => {
  const [ra, rb] = [codeRank(a), codeRank(b)];
  return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
});

const categories = [...new Map(stores.map((s) => [s.categorySlug, s.category])).entries()]
  .map(([slug, name]) => {
    const list = stores.filter((s) => s.categorySlug === slug);
    return { slug, name, stores: list, codes: list.flatMap((s) => s.codes) };
  })
  .sort((a, b) => b.codes.length - a.codes.length);

const TOTAL_CODES = allCodes.length;

/* ----------- الإعلانات المدفوعة ----------- */

/** الإعلان يظهر فقط داخل مدّته وفي موضعه؛ غير ذلك تُعرض مساحة الحجز. */
const ads = rawAds
  .filter((a) => a && a.url && a.title)
  .filter((a) => (!a.starts || a.starts <= BUILT_AT) && (!a.ends || a.ends >= BUILT_AT))
  .sort((a, b) => (a.priority || 99) - (b.priority || 99));

const adsFor = (slot, category) =>
  ads.filter((a) => a.slot === slot && (!a.targetCategory || a.targetCategory === category));

/* ----------- المدونة ----------- */

const storeBySlug = new Map(stores.map((s) => [s.slug, s]));

const posts = rawPosts
  .filter((p) => p && p.slug && p.title)
  .map((p) => ({
    ...p,
    url: `/blog/${p.slug}/`,
    store: p.store ? storeBySlug.get(p.store) || null : null,
    categorySlug: p.category ? slugify(p.category) : '',
    updated: p.updated || p.published || BUILT_AT,
  }))
  .sort((a, b) => String(b.published || '').localeCompare(String(a.published || '')));

/** ربط كل متجر بمقالته: أيقونة المتجر في الأعلى تقود إلى الدليل في الأسفل. */
const postByStore = new Map(posts.filter((p) => p.store).map((p) => [p.store.slug, p]));
const postsByCategory = new Map();
posts.forEach((p) => {
  if (!p.categorySlug) return;
  if (!postsByCategory.has(p.categorySlug)) postsByCategory.set(p.categorySlug, []);
  postsByCategory.get(p.categorySlug).push(p);
});

/* ======================= الخطوط ======================= */

/**
 * "thmanyah" → خط ثمانية (Sans + Serif Display) عبر حزمة الويب المجتمعية.
 * "plex"     → IBM Plex Sans Arabic + Noto Naskh Arabic (رخصة OFL، تجاري مسموح)،
 *              وهما الخطان المنصوص عليهما في نظام تصميم ثمانية الرسمي.
 * الاحتياطي المرخّص يُحمَّل في الوضعين، فلا يسقط الموقع إلى خط النظام إن تعذّر الأول.
 */
const FONT_SOURCES = {
  thmanyah: [
    'https://cdn.jsdelivr.net/npm/@dawod/thmanyah-font-web@1.2.0/sans.css',
    'https://cdn.jsdelivr.net/npm/@dawod/thmanyah-font-web@1.2.0/serif-display.css',
  ],
  plex: [
    'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Noto+Naskh+Arabic:wght@500;600;700&display=swap',
  ],
};

const FONT_MODE = FONT_SOURCES[site.font] ? site.font : 'plex';

/*
 * ملفّات الخطوط خارجية، ووسم stylesheet عادي يعطّل رسم الصفحة حتى تصل.
 * الحيلة القياسية: تحميلها بوسط "print" ثم تحويلها إلى "all" عند الاكتمال —
 * فيظهر النص فورًا بالخط الاحتياطي ثم يُستبدل. ونسخة noscript للمتصفحات بلا JS.
 */
const asyncSheet = (href) =>
  `<link rel="stylesheet" href="${href}" media="print" onload="this.media='all';this.onload=null">`;

const FONT_URLS = [...new Set([...FONT_SOURCES[FONT_MODE], ...FONT_SOURCES.plex])];

const FONT_LINKS = [
  '<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  ...FONT_URLS.map(asyncSheet),
  `<noscript>${FONT_URLS.map((h) => `<link rel="stylesheet" href="${h}">`).join('')}</noscript>`,
].join('\n');

/* ======================= مكوّنات ======================= */

function logoHtml(store, cls = '') {
  const classes = ('store-logo ' + cls).trim();
  if (store.logo) {
    return `<img class="${classes}" src="${esc(store.logo)}" alt="شعار ${esc(store.name)}" width="56" height="56" loading="lazy" decoding="async">`;
  }
  const letter = esc((store.name || '؟').trim().charAt(0));
  const bg = store.brandColor || '#FF9500';
  return `<span class="${classes} store-logo--text" style="background:${esc(bg)};color:${esc(readableInk(bg))}" role="img" aria-label="شعار ${esc(store.name)}">${letter}</span>`;
}

/** بطاقة الكود — الكود ظاهر بنصّه، قابل للنسخ، وقابل للفهرسة. */
function codeCard(code, { heading = 'h3', showStore = true, hero = false } = {}) {
  const s = code.store;
  const badges = [
    code.discount ? `<span class="tag tag--discount">${esc(code.discount)}</span>` : '',
    code.featured ? '<span class="tag tag--featured">الأفضل</span>' : '',
    code.isNew ? '<span class="tag tag--new">جديد</span>' : '',
    code.endingSoon ? `<span class="tag tag--soon">${esc(soonLabel(daysUntil(code.expires)))}</span>` : '',
  ].join('');

  const storeLine = showStore
    ? `<a class="code-store" href="/store/${esc(s.slug)}/">
         ${logoHtml(s, 'store-logo--sm')}
         <span class="code-store__name">${esc(s.name)}</span>
         <span class="code-store__cat">${esc(s.category || '')}</span>
       </a>`
    : '';

  const meta = [
    code.expires ? `<span>صالح حتى ${esc(fmtDate(code.expires))}</span>` : '',
    code.terms ? `<span>${esc(code.terms)}</span>` : '',
  ]
    .filter(Boolean)
    .join('<span class="sep" aria-hidden="true">·</span>');

  return `<article class="code-card${code.featured ? ' is-featured' : ''}${hero ? ' is-hero' : ''}" id="${esc(code.id)}"
         data-code-card data-store="${esc(s.slug)}" data-category="${esc(s.categorySlug)}"
         data-search="${esc([s.name, s.category, code.title, code.code, code.discount].filter(Boolean).join(' '))}">
  <div class="code-card__top">
    ${storeLine}
    <button type="button" class="fav-btn" data-fav="${esc(code.id)}" aria-pressed="false" aria-label="حفظ في المفضلة">
      <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M12 20.5 4.8 13a4.6 4.6 0 0 1 6.5-6.5l.7.7.7-.7A4.6 4.6 0 1 1 19.2 13Z"/></svg>
    </button>
  </div>

  <div class="code-card__tags">${badges}</div>
  <${heading} class="code-card__title">${esc(code.title || `كود خصم ${s.name}`)}</${heading}>
  ${meta ? `<p class="code-card__meta">${meta}</p>` : ''}

  <div class="code-card__action">
    <button type="button" class="copy-btn" data-code="${esc(code.code)}" data-url="${esc(s.url)}" data-id="${esc(code.id)}"
            aria-label="انسخ كود ${esc(code.code)} وافتح متجر ${esc(s.name)}">
      <span class="copy-btn__code">${esc(code.code)}</span>
      <span class="copy-btn__label">نسخ<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 5.5h-9a2 2 0 0 0-2 2v9"/></svg></span>
    </button>
    <a class="btn btn-ghost code-card__visit" href="${esc(s.url)}" target="_blank" rel="nofollow sponsored noopener">
      المتجر<span aria-hidden="true"> ↗</span>
    </a>
  </div>
</article>`;
}

function storeCard(s) {
  const best = s.codes[0];
  return `<a class="store-card" href="/store/${esc(s.slug)}/"
     data-store-card data-category="${esc(s.categorySlug)}"
     data-search="${esc([s.name, s.category, s.description].filter(Boolean).join(' '))}">
  ${logoHtml(s)}
  <span class="store-card__name">${esc(s.name)}</span>
  <span class="store-card__meta">${esc(codesLabel(s.codes.length))}</span>
  ${best && best.discount ? `<span class="store-card__best">حتى ${esc(best.discount)}</span>` : ''}
  ${postByStore.has(s.slug) ? '<span class="store-card__guide">دليل</span>' : ''}
</a>`;
}

/* ----------- مساحة إعلانية ----------- */

/**
 * الإعلانات موسومة صراحةً ﺑ«إعلان» وروابطها nofollow sponsored — هذا شرط قوقل
 * للمحتوى المدفوع، وتجاهله يعرّض فهرسة الموقع كلّه للعقوبة.
 * حين لا يوجد معلن للموضع تُعرض مساحة الحجز بدل فراغٍ في التصميم.
 */
function adSlot(slot, { category = '', className = '' } = {}) {
  const list = adsFor(slot, category);

  if (!list.length) {
    return `<aside class="ad ad--house ${className}" aria-label="مساحة إعلانية متاحة">
  <span class="ad__label">مساحة إعلانية</span>
  <div class="ad__body">
    <p class="ad__title">مساحتك الإعلانية هنا</p>
    <p class="ad__text">اعرض متجرك أمام متسوّقين يبحثون عن عرضٍ ليشتروا الآن.</p>
  </div>
  <a class="btn btn-primary ad__cta" href="/advertise/">احجز المساحة</a>
</aside>`;
  }

  return list
    .map((a) => {
      const accent = a.brandColor || '#FF9500';
      const media = a.image
        ? `<img class="ad__img" src="${esc(a.image)}" alt="" width="96" height="96" loading="lazy" decoding="async">`
        : '';
      return `<aside class="ad ${className}" style="--ad-accent:${esc(accent)}" aria-label="محتوى إعلاني">
  <span class="ad__label">إعلان</span>
  ${media}
  <div class="ad__body">
    <p class="ad__advertiser">${esc(a.advertiser || '')}</p>
    <p class="ad__title">${esc(a.title)}</p>
    ${a.body ? `<p class="ad__text">${esc(a.body)}</p>` : ''}
  </div>
  <a class="btn btn-primary ad__cta" href="${esc(a.url)}" target="_blank" rel="nofollow sponsored noopener">${esc(a.cta || 'اعرف أكثر')}</a>
</aside>`;
    })
    .join('\n');
}

/* ----------- بطاقة مقال ----------- */

function postCard(post, { compact = false } = {}) {
  const tie = post.store
    ? `<span class="post-card__tie">${logoHtml(post.store, 'store-logo--xs')}${esc(post.store.name)}</span>`
    : post.category
    ? `<span class="post-card__tie post-card__tie--cat">${esc(post.category)}</span>`
    : '';

  return `<a class="post-card${compact ? ' post-card--compact' : ''}" href="${esc(post.url)}">
  <span class="post-card__meta">${esc(fmtDate(post.published))} · ${esc(arCount(post.readMinutes || 5, 'دقيقة قراءة', 'دقيقتان', 'دقائق قراءة', 'دقيقة قراءة'))}</span>
  <h3 class="post-card__title">${esc(post.title)}</h3>
  ${compact ? '' : `<p class="post-card__excerpt">${esc(post.excerpt || '')}</p>`}
  ${tie}
</a>`;
}

/* ----------- كتل المقال ----------- */

/**
 * كتلة "codes" تقرأ من stores.json مباشرةً، فما تكتبه في بيانات الأكواد
 * يظهر في المقال فورًا دون تحرير نص المقال.
 */
function renderBlock(b) {
  switch (b.type) {
    case 'h2':
      return `<h2 id="${esc(slugify(b.text))}">${esc(b.text)}</h2>`;

    case 'h3':
      return `<h3 id="${esc(slugify(b.text))}">${esc(b.text)}</h3>`;

    case 'p':
      return `<p>${b.text}</p>`;

    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      return `<${tag}>${b.items.map((i) => `<li>${i}</li>`).join('')}</${tag}>`;
    }

    case 'callout':
      return `<div class="callout"><p>${b.text}</p></div>`;

    case 'table':
      return `<div class="table-wrap"><table>
  <thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
  <tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
</table></div>`;

    case 'faq':
      return `<div class="faq">${b.items
        .map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`)
        .join('')}</div>`;

    case 'codes': {
      let list;
      if (b.store) list = (storeBySlug.get(b.store) || { codes: [] }).codes;
      else if (b.category) list = allCodes.filter((c) => c.store.categorySlug === slugify(b.category));
      else if (b.scope === 'featured') list = allCodes.filter((c) => c.featured);
      else list = allCodes;

      list = list.slice(0, b.limit || 4);
      if (!list.length) return '';

      return `<section class="live-codes" aria-label="${esc(b.title || 'أكواد فعّالة')}">
  <h2 class="live-codes__title">${esc(b.title || 'أكواد فعّالة الآن')}</h2>
  ${b.note ? `<p class="live-codes__note">${esc(b.note)}</p>` : ''}
  <div class="code-grid">
${list.map((c) => codeCard(c, { heading: 'h3' })).join('\n')}
  </div>
</section>`;
    }

    default:
      return '';
  }
}

/** نصّ المقال مجرّدًا — لحساب عدد الكلمات ولوصف الميتا. */
function postPlainText(post) {
  return post.body
    .map((b) => {
      if (b.type === 'list') return b.items.join(' ');
      if (b.type === 'faq') return b.items.map((i) => i.join(' ')).join(' ');
      if (b.type === 'table') return [...b.head, ...b.rows.flat()].join(' ');
      return b.text || '';
    })
    .join(' ')
    .replace(/<[^>]+>/g, ' ');
}

/* ======================= الهيكل ======================= */

const TABS = [
  { href: '/', label: 'الأكواد', match: (p) => p === '/', icon: '<path d="M3 12.5 12 4l9 8.5"/><path d="M5.5 11v8.5h13V11"/>' },
  { href: '/stores/', label: 'المتاجر', match: (p) => p.startsWith('/store'), icon: '<path d="M4 9.5 5.5 4.5h13L20 9.5"/><path d="M4 9.5a2.6 2.6 0 0 0 5 .4 2.6 2.6 0 0 0 5 0 2.6 2.6 0 0 0 5-.4"/><path d="M5.5 12v7.5h13V12"/>' },
  { href: '/blog/', label: 'المدونة', match: (p) => p.startsWith('/blog'), icon: '<path d="M6 4.5h9l3.5 3.5v11.5H6z"/><path d="M14.5 4.5V8H18"/><path d="M9 12.5h6M9 16h4"/>' },
  { href: '/search/', label: 'بحث', match: (p) => p.startsWith('/search'), icon: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.6-3.6"/>' },
  { href: '/favorites/', label: 'المفضلة', match: (p) => p.startsWith('/favorites'), icon: '<path d="M12 20.5 4.8 13a4.6 4.6 0 0 1 6.5-6.5l.7.7.7-.7A4.6 4.6 0 1 1 19.2 13Z"/>' },
];

function tabBar(current) {
  return `<nav class="tabbar" aria-label="التنقل السريع">
${TABS.map((t) => {
  const on = t.match(current);
  return `  <a class="tabbar__item${on ? ' is-active' : ''}" href="${t.href}"${on ? ' aria-current="page"' : ''}>
    <svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true">${t.icon}</svg>
    <span>${t.label}</span>
  </a>`;
}).join('\n')}
</nav>`;
}

function layout({
  title,
  description,
  canonical,
  path: current = '/',
  body,
  schema = [],
  noindex = false,
  bodyClass = '',
}) {
  const robots = noindex
    ? '<meta name="robots" content="noindex, follow">'
    : '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
${robots}
<meta name="theme-color" content="#FF9500">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:locale" content="${esc(site.locale || 'ar_SA')}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
<meta property="og:image" content="${esc(abs('/og.png'))}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(abs('/og.png'))}">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="${esc(site.shortName || site.name)}">
<meta name="mobile-web-app-capable" content="yes">
${FONT_LINKS}
<link rel="stylesheet" href="/styles.css">
${schema.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">تخطَّ إلى المحتوى</a>

<header class="appbar">
  <div class="appbar__inner">
    <a class="brand" href="/">
      <span class="brand__mark" aria-hidden="true">%</span>
      <span class="brand__name">${esc(site.name)}</span>
    </a>
    <nav class="appbar__nav" aria-label="التنقل الرئيسي">
      <a href="/"${current === '/' ? ' aria-current="page"' : ''}>الأكواد</a>
      <a href="/stores/"${current.startsWith('/store') ? ' aria-current="page"' : ''}>المتاجر</a>
      <a href="/blog/"${current.startsWith('/blog') ? ' aria-current="page"' : ''}>المدونة</a>
      <a href="/favorites/"${current.startsWith('/favorites') ? ' aria-current="page"' : ''}>المفضلة</a>
    </nav>
    <button type="button" class="install-btn" id="install-btn" hidden>
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M12 4v11"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/></svg>
      ثبّت التطبيق
    </button>
  </div>
</header>

<main id="main">
${body}
</main>

<footer class="site-footer">
  <div class="shell">
    <p>© ${YEAR} ${esc(site.name)} — جميع الحقوق محفوظة.</p>
    <nav class="site-footer__links" aria-label="روابط إضافية">
      <a href="/blog/">المدونة</a>
      <a href="/stores/">المتاجر</a>
      <a href="/advertise/">أعلن معنا</a>
    </nav>
    <p>آخر تحديث للأكواد: ${esc(fmtDate(BUILT_AT))}</p>
  </div>
</footer>

${tabBar(current)}
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
<script src="/app.js" defer></script>
</body>
</html>
`;
}

/* ======================= مخطّطات البيانات المنظّمة ======================= */

const orgSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: site.name,
  url: abs('/'),
  inLanguage: 'ar',
  description: site.description,
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: abs('/search/?q={search_term_string}') },
    'query-input': 'required name=search_term_string',
  },
};

/** كل كود عرضٌ مستقل له رابط مباشر — هذا ما يجعله قابلًا للظهور في نتائج البحث. */
function offerSchema(code, pageUrl) {
  const s = code.store;
  return {
    '@type': 'Offer',
    name: code.title || `كود خصم ${s.name}`,
    description: code.terms || code.title || `كود خصم ${s.name}`,
    url: abs(`${pageUrl}#${code.id}`),
    priceCurrency: 'SAR',
    availability: 'https://schema.org/InStock',
    category: s.category,
    seller: { '@type': 'Organization', name: s.name, url: s.url },
    ...(code.expires ? { validThrough: code.expires } : {}),
    ...(code.discount ? { discount: code.discount } : {}),
  };
}

const breadcrumb = (trail) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((t, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: t.name,
    item: abs(t.url),
  })),
});

const FAQ = [
  ['ليش ما اشتغل الكود معي؟', 'أغلب الأكواد لها شروط: حد أدنى للطلب، أو قسم محدد، أو صلاحية للعملاء الجدد فقط. اقرأ الشروط تحت كل كود، وجرّب كودًا آخر من نفس المتجر.'],
  ['هل الأكواد مجانية؟', 'نعم، كل الأكواد مجانية تمامًا ولا تحتاج تسجيلًا ولا اشتراكًا.'],
  ['كم مرة تتحدّث الأكواد؟', 'نراجع الأكواد دوريًا، والمنتهية تُحذف تلقائيًا من الموقع، وتاريخ آخر تحديث ظاهر أسفل كل صفحة.'],
  ['هل أقدر أستخدم أكثر من كود في نفس الطلب؟', 'غالبًا لا — أغلب المتاجر تسمح بكود واحد لكل طلب، فاختر الأعلى قيمة.'],
  ['هل أقدر أضيف الموقع كتطبيق على جوالي؟', 'نعم. افتح الموقع في متصفح الجوال واختر «إضافة إلى الشاشة الرئيسية»، وسيعمل كتطبيق مستقل حتى بدون إنترنت للصفحات التي زرتها.'],
];

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(([q, a]) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
};

const faqHtml = `<section class="faq shell" id="الأسئلة">
  <h2 class="sec-title">الأسئلة الشائعة</h2>
${FAQ.map(([q, a]) => `  <details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
</section>`;

/* ======================= الصفحات ======================= */

function pageHome() {
  const featured = allCodes.filter((c) => c.featured).slice(0, 6);
  const rest = allCodes.filter((c) => !featured.includes(c));

  const chips = [
    `<button type="button" class="chip" data-filter="all" aria-pressed="true">الكل</button>`,
    ...categories.map(
      (c) => `<button type="button" class="chip" data-filter="${esc(c.slug)}" aria-pressed="false">${esc(c.name)}</button>`
    ),
  ].join('');

  /*
   * الإعلان يدخل القائمة كبطاقة بين البطاقات: أولًا بعد البطاقة الرابعة — لا في
   * المقدمة حيث يحجب ما جاء الزائر لأجله — ثم كل ثماني بطاقات بعدها.
   */
  const FIRST_AD_AFTER = 4;
  const AD_INTERVAL = 8;
  const feedWithAds = rest
    .map((c) => codeCard(c))
    .flatMap((card, i) => {
      const n = i + 1;
      const place = n === FIRST_AD_AFTER || (n > FIRST_AD_AFTER && (n - FIRST_AD_AFTER) % AD_INTERVAL === 0);
      return place ? [card, adSlot('feed', { className: 'ad--card' })] : [card];
    })
    .join('\n');

  const body = `
<section class="topline">
  <div class="shell">
    <h1>أكواد خصم <em>جاهزة للنسخ</em></h1>
    <p class="topline__meta"><span class="live-dot" aria-hidden="true"></span>${esc(codesLabel(TOTAL_CODES))} · ${esc(storesLabel(stores.length))} · حُدِّث ${esc(fmtDate(BUILT_AT))}</p>
    <form class="searchbar searchbar--slim" action="/search/" method="get" role="search">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.6-3.6"/></svg>
      <input type="search" name="q" id="home-search" placeholder="اكتب اسم المتجر…" aria-label="ابحث عن متجر" autocomplete="off">
    </form>
  </div>
</section>

<div class="shell">
  <div class="chips" role="group" aria-label="تصفية حسب التصنيف">${chips}</div>
</div>

${featured.length ? `<section class="shell" data-section>
  <div class="code-grid">
${featured.map((c) => codeCard(c)).join('\n')}
  </div>
</section>` : ''}

<section class="shell" data-section>
  <div class="code-grid">
${feedWithAds}
  </div>
</section>

<p class="empty shell" id="no-results" hidden>ما فيه أكواد في هذا التصنيف حاليًا.</p>

<section class="shell strip" data-section>
  <h2 class="sec-title">المتاجر</h2>
  <div class="store-strip">
${stores.map((s) => storeCard(s)).join('\n')}
  </div>
</section>

${adSlot('hero', { className: 'ad--wide ad--shell' })}

${posts.length ? `<section class="shell strip tail">
  <h2 class="sec-title">أدلّة التوفير</h2>
  <div class="post-grid">
${posts.slice(0, 3).map((x) => postCard(x, { compact: true })).join('\n')}
  </div>
  <p class="strip__more"><a href="/blog/">كل المقالات ←</a></p>
</section>` : ''}

${faqHtml}`;

  return layout({
    title: `${site.name} — ${site.tagline} ${YEAR}`,
    description: site.description,
    canonical: abs('/'),
    path: '/',
    body,
    schema: [
      orgSchema,
      faqSchema,
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `أكواد خصم فعّالة ${YEAR}`,
        numberOfItems: TOTAL_CODES,
        itemListElement: allCodes.map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: offerSchema(c, '/'),
        })),
      },
    ],
  });
}

function pageStores() {
  const body = `
<div class="shell">
  <nav class="crumbs" aria-label="مسار التصفح"><a href="/">الأكواد</a> <span aria-hidden="true">←</span> <span>المتاجر</span></nav>
  <header class="lander lander--plain">
    <div>
      <h1>كل المتاجر</h1>
      <p class="lander__meta">
        <span class="live-dot" aria-hidden="true"></span>${esc(storesLabel(stores.length))}
        <span class="sep" aria-hidden="true">·</span>${esc(codesLabel(TOTAL_CODES))}
      </p>
    </div>
  </header>
</div>

${categories
  .map(
    (cat) => `<section class="shell" data-section>
  <h2 class="sec-title"><a href="/category/${esc(cat.slug)}/">${esc(cat.name)}</a> <span>${esc(codesLabel(cat.codes.length))}</span></h2>
  <div class="store-grid">
${cat.stores.map((s) => storeCard(s)).join('\n')}
  </div>
</section>`
  )
  .join('\n')}`;

  return layout({
    title: `كل المتاجر — ${esc(storesLabel(stores.length))} بأكواد خصم فعّالة | ${site.name}`,
    description: `تصفّح ${storesLabel(stores.length)} لديها ${codesLabel(TOTAL_CODES)} — أزياء وإلكترونيات وتسوق عام وسفر. كود جاهز للنسخ مع رابط المتجر مباشرة.`,
    canonical: abs('/stores/'),
    path: '/stores/',
    body,
    schema: [
      breadcrumb([
        { name: 'الرئيسية', url: '/' },
        { name: 'المتاجر', url: '/stores/' },
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'المتاجر',
        numberOfItems: stores.length,
        itemListElement: stores.map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: `أكواد خصم ${s.name}`,
          url: abs(`/store/${s.slug}/`),
        })),
      },
    ],
  });
}

function pageStore(s) {
  const url = `/store/${s.slug}/`;
  const best = s.codes[0];
  const others = stores.filter((x) => x.slug !== s.slug && x.categorySlug === s.categorySlug).slice(0, 6);
  const guide = postByStore.get(s.slug);

  /*
   * صفحة المتجر هي صفحة الهبوط الحقيقية: زائرٌ كتب «كود نمشي» في قوقل ووصل هنا.
   * لا مقدّمة ولا شرح قبل الكود — أول ما يراه هو أعلى كود، ثم البقية.
   * كل ما عدا ذلك (وصف المتجر، الشروط، المشابه) أسفل الأكواد.
   */
  const body = `
<div class="shell page-narrow">
  <nav class="crumbs" aria-label="مسار التصفح">
    <a href="/">الأكواد</a> <span aria-hidden="true">←</span>
    <a href="/category/${esc(s.categorySlug)}/">${esc(s.category)}</a> <span aria-hidden="true">←</span>
    <span>${esc(s.name)}</span>
  </nav>

  <header class="lander">
    ${logoHtml(s, 'store-logo--lg')}
    <div>
      <h1>أكواد خصم ${esc(s.name)}</h1>
      <p class="lander__meta">
        <span class="live-dot" aria-hidden="true"></span>${esc(codesLabel(s.codes.length))}
        ${best && best.discount ? `<span class="sep" aria-hidden="true">·</span>أعلى خصم ${esc(best.discount)}` : ''}
        <span class="sep" aria-hidden="true">·</span>حُدِّث ${esc(fmtDate(BUILT_AT))}
      </p>
    </div>
  </header>

  <div class="code-grid code-grid--lander">
${s.codes.map((c, i) => codeCard(c, { heading: 'h2', showStore: false, hero: i === 0 })).join('\n')}
  </div>

  ${adSlot('store', { category: s.category, className: 'ad--wide' })}

  <section class="tail">
    <div class="about">
      <p>${esc(s.description || '')}</p>
      <a class="btn btn-ghost" href="${esc(s.url)}" target="_blank" rel="nofollow sponsored noopener">فتح ${esc(s.name)}<span aria-hidden="true"> ↗</span></a>
    </div>

    ${guide ? `<a class="post-tie post-tie--store" href="${esc(guide.url)}">
      <span><strong>${esc(guide.title)}</strong>دليل مكتوب عن أكواد ${esc(s.name)}</span>
      <span class="post-tie__go" aria-hidden="true">←</span>
    </a>` : ''}

    <div class="faq faq--mini">
      <details><summary>ما اشتغل الكود، ليه؟</summary><p>غالبًا لم تبلغ الحد الأدنى للطلب، أو أن المنتج من قسمٍ مستثنى. جرّب كودًا آخر من القائمة أعلاه.</p></details>
      <details><summary>كم يتحدّث الأكواد؟</summary><p>نراجعها دوريًا، والمنتهي يُحذف تلقائيًا. آخر تحديث: ${esc(fmtDate(BUILT_AT))}.</p></details>
      <details><summary>أقدر أستخدم كودين؟</summary><p>لا — ${esc(s.name)} يقبل كودًا واحدًا لكل طلب. اختر الأعلى قيمة.</p></details>
    </div>

    ${others.length ? `<div class="strip" data-section>
      <h2 class="sec-title">متاجر ${esc(s.category)}</h2>
      <div class="store-strip">
${others.map((x) => storeCard(x)).join('\n')}
      </div>
    </div>` : ''}
  </section>
</div>`;

  const title = `أكواد خصم ${s.name} ${YEAR}${best && best.discount ? ` — خصم ${best.discount}` : ''} | ${site.shortName || site.name}`;
  const description = `${codesLabel(s.codes.length)} لمتجر ${s.name}${best && best.discount ? ` تصل إلى ${best.discount}` : ''}. انسخ الكود بضغطة وادخل المتجر. محدَّث ${fmtDate(BUILT_AT)}.`;

  return {
    url,
    html: layout({
      title,
      description,
      canonical: abs(url),
      path: url,
      body,
      schema: [
        breadcrumb([
          { name: 'الرئيسية', url: '/' },
          { name: s.category, url: `/category/${s.categorySlug}/` },
          { name: `أكواد خصم ${s.name}`, url },
        ]),
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: s.name,
          url: s.url,
          description: s.description,
          ...(s.logo ? { logo: s.logo.startsWith('http') ? s.logo : abs(s.logo) } : {}),
          makesOffer: s.codes.map((c) => offerSchema(c, url)),
        },
      ],
    }),
  };
}

function pageCategory(cat) {
  const url = `/category/${cat.slug}/`;
  const catPosts = [
    ...(postsByCategory.get(cat.slug) || []),
    ...posts.filter((x) => x.store && x.store.categorySlug === cat.slug),
  ].slice(0, 3);

  const codes = cat.codes.slice().sort((a, b) => {
    const [ra, rb] = [codeRank(a), codeRank(b)];
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
  });

  const body = `
<div class="shell">
  <nav class="crumbs" aria-label="مسار التصفح">
    <a href="/">الأكواد</a> <span aria-hidden="true">←</span> <span>${esc(cat.name)}</span>
  </nav>

  <header class="lander lander--plain">
    <div>
      <h1>أكواد خصم ${esc(cat.name)}</h1>
      <p class="lander__meta">
        <span class="live-dot" aria-hidden="true"></span>${esc(codesLabel(codes.length))}
        <span class="sep" aria-hidden="true">·</span>${esc(storesLabel(cat.stores.length))}
        <span class="sep" aria-hidden="true">·</span>حُدِّث ${esc(fmtDate(BUILT_AT))}
      </p>
    </div>
  </header>

  <div class="code-grid">
${codes.map((c) => codeCard(c)).join('\n')}
  </div>

  ${adSlot('store', { category: cat.name, className: 'ad--wide' })}

  <section class="tail">
    <div class="strip" data-section>
      <h2 class="sec-title">متاجر ${esc(cat.name)}</h2>
      <div class="store-strip">
${cat.stores.map((s) => storeCard(s)).join('\n')}
      </div>
    </div>

    ${catPosts.length ? `<div class="strip">
      <h2 class="sec-title">أدلّة ${esc(cat.name)}</h2>
      <div class="post-grid">
${catPosts.map((x) => postCard(x, { compact: true })).join('\n')}
      </div>
    </div>` : ''}
  </section>
</div>`;

  return {
    url,
    html: layout({
      title: `أكواد خصم ${cat.name} ${YEAR} — ${codes.length} كوبون فعّال | ${site.name}`,
      description: `${codesLabel(codes.length)} في قسم ${cat.name} من ${storesLabel(cat.stores.length)}. انسخ الكود بضغطة وادخل المتجر. محدَّث ${fmtDate(BUILT_AT)}.`,
      canonical: abs(url),
      path: url,
      body,
      schema: [
        breadcrumb([
          { name: 'الرئيسية', url: '/' },
          { name: `أكواد خصم ${cat.name}`, url },
        ]),
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `أكواد خصم ${cat.name}`,
          numberOfItems: codes.length,
          itemListElement: codes.map((c, i) => ({ '@type': 'ListItem', position: i + 1, item: offerSchema(c, url) })),
        },
      ],
    }),
  };
}

function pageBlog() {
  const [lead, ...rest] = posts;

  const body = `
<div class="shell">
  <nav class="crumbs" aria-label="مسار التصفح"><a href="/">الأكواد</a> <span aria-hidden="true">←</span> <span>المدونة</span></nav>
  <h1 class="page-title">المدونة</h1>
  <p class="page-lede">أدلّة عملية في التوفير والتسوق الإلكتروني — مكتوبة لتقرأها، لا لتملأ صفحة. كل دليل مربوط بالأكواد الفعّالة في الموقع.</p>

  ${lead ? `<article class="post-lead">
    <a href="${esc(lead.url)}">
      <span class="post-card__meta">${esc(fmtDate(lead.published))} · ${esc(arCount(lead.readMinutes || 5, 'دقيقة قراءة', 'دقيقتان', 'دقائق قراءة', 'دقيقة قراءة'))}</span>
      <h2>${esc(lead.title)}</h2>
      <p>${esc(lead.excerpt || '')}</p>
      <span class="post-lead__cta">اقرأ الدليل ←</span>
    </a>
  </article>` : ''}

  ${adSlot('blog', { className: 'ad--wide' })}

  ${rest.length ? `<h2 class="sec-title">كل المقالات <span>${esc(arCount(posts.length, 'مقال واحد', 'مقالان', 'مقالات', 'مقالًا'))}</span></h2>
  <div class="post-grid">
${rest.map((x) => postCard(x)).join('\n')}
  </div>` : ''}
</div>`;

  return layout({
    title: `المدونة — أدلّة التوفير والتسوق الإلكتروني | ${site.name}`,
    description: 'أدلّة عملية في أكواد الخصم ومواسم التخفيضات والتسوق الإلكتروني، مربوطة بالأكواد الفعّالة في الموقع.',
    canonical: abs('/blog/'),
    path: '/blog/',
    body,
    schema: [
      breadcrumb([
        { name: 'الرئيسية', url: '/' },
        { name: 'المدونة', url: '/blog/' },
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: `مدونة ${site.name}`,
        url: abs('/blog/'),
        inLanguage: 'ar',
        blogPost: posts.map((x) => ({
          '@type': 'BlogPosting',
          headline: x.title,
          url: abs(x.url),
          datePublished: x.published,
          dateModified: x.updated,
        })),
      },
    ],
  });
}

function pagePost(post) {
  const words = postPlainText(post).split(/\s+/).filter(Boolean).length;
  const related = posts.filter((x) => x.slug !== post.slug).slice(0, 3);

  // فهرس المحتويات يُشتق من عناوين h2 — ملاحة أفضل للقارئ وروابط داخلية لقوقل.
  const toc = post.body.filter((b) => b.type === 'h2').map((b) => ({ id: slugify(b.text), text: b.text }));

  // كتلة الإعلان تُحقن بعد ثلث المقال لا في أوّله: احترامٌ للقارئ وأداءٌ أفضل للمعلن.
  const blocks = post.body.map(renderBlock);
  const adAt = Math.min(Math.max(2, Math.floor(blocks.length / 3)), blocks.length);
  blocks.splice(adAt, 0, adSlot('blog', { category: post.category, className: 'ad--wide' }));

  const tie = post.store
    ? `<a class="post-tie" href="/store/${esc(post.store.slug)}/">
         ${logoHtml(post.store, 'store-logo--sm')}
         <span><strong>أكواد ${esc(post.store.name)}</strong>${esc(codesLabel(post.store.codes.length))}</span>
         <span class="post-tie__go" aria-hidden="true">←</span>
       </a>`
    : post.categorySlug
    ? `<a class="post-tie" href="/category/${esc(post.categorySlug)}/">
         <span><strong>أكواد ${esc(post.category)}</strong>تصفّح القسم كاملًا</span>
         <span class="post-tie__go" aria-hidden="true">←</span>
       </a>`
    : '';

  const body = `
<div class="shell post-shell">
  <nav class="crumbs" aria-label="مسار التصفح">
    <a href="/">الأكواد</a> <span aria-hidden="true">←</span>
    <a href="/blog/">المدونة</a> <span aria-hidden="true">←</span>
    <span>${esc(post.title)}</span>
  </nav>

  <article class="post">
    <header class="post__head">
      <h1>${esc(post.title)}</h1>
      <p class="post__excerpt">${esc(post.excerpt || '')}</p>
      <p class="post__meta">
        ${esc(post.author || site.name)}
        <span class="sep" aria-hidden="true">·</span>نُشر ${esc(fmtDate(post.published))}
        ${post.updated !== post.published ? `<span class="sep" aria-hidden="true">·</span>حُدِّث ${esc(fmtDate(post.updated))}` : ''}
        <span class="sep" aria-hidden="true">·</span>${esc(arCount(post.readMinutes || 5, 'دقيقة قراءة', 'دقيقتان', 'دقائق قراءة', 'دقيقة قراءة'))}
      </p>
      ${tie}
    </header>

    ${toc.length > 2 ? `<nav class="toc" aria-label="محتويات المقال">
      <p class="toc__title">في هذا الدليل</p>
      <ol>${toc.map((t) => `<li><a href="#${esc(t.id)}">${esc(t.text)}</a></li>`).join('')}</ol>
    </nav>` : ''}

    <div class="post__body">
${blocks.join('\n')}
    </div>
  </article>

  ${related.length ? `<section class="strip">
    <h2 class="sec-title">اقرأ أيضًا</h2>
    <div class="post-grid">
${related.map((x) => postCard(x, { compact: true })).join('\n')}
    </div>
  </section>` : ''}
</div>`;

  return {
    url: post.url,
    html: layout({
      title: `${post.title} | ${site.name}`,
      description: post.excerpt || postPlainText(post).slice(0, 180),
      canonical: abs(post.url),
      path: post.url,
      body,
      schema: [
        breadcrumb([
          { name: 'الرئيسية', url: '/' },
          { name: 'المدونة', url: '/blog/' },
          { name: post.title, url: post.url },
        ]),
        {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.excerpt || '',
          url: abs(post.url),
          mainEntityOfPage: { '@type': 'WebPage', '@id': abs(post.url) },
          datePublished: post.published,
          dateModified: post.updated,
          inLanguage: 'ar',
          wordCount: words,
          keywords: (post.keywords || []).join('، '),
          image: abs('/og.png'),
          author: { '@type': 'Organization', name: post.author || site.name },
          publisher: {
            '@type': 'Organization',
            name: site.name,
            logo: { '@type': 'ImageObject', url: abs('/icons/icon-512.png') },
          },
        },
        ...post.body
          .filter((b) => b.type === 'faq')
          .map((b) => ({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: b.items.map(([q, a]) => ({
              '@type': 'Question',
              name: q,
              acceptedAnswer: { '@type': 'Answer', text: a },
            })),
          })),
      ],
    }),
  };
}

function pageAdvertise() {
  const body = `
<div class="shell post-shell">
  <nav class="crumbs" aria-label="مسار التصفح"><a href="/">الأكواد</a> <span aria-hidden="true">←</span> <span>أعلن معنا</span></nav>

  <h1 class="page-title">أعلن معنا</h1>
  <p class="page-lede">زوّار هذا الموقع لا يتصفّحون — يبحثون عن عرضٍ ليشتروا به الآن. هذه أقرب لحظة إلى قرار الشراء، وهي المساحة التي نبيعها.</p>

  <div class="ad-formats">
    <div class="ad-format">
      <span class="ad-format__tag">الأعلى ظهورًا</span>
      <h2>داخل قائمة الأكواد</h2>
      <p>بطاقة إعلانية بتصميم الموقع نفسه تظهر بين بطاقات الأكواد في الصفحة الرئيسية.</p>
      <ul>
        <li>عنوان حتى ٦٠ حرفًا، ونص حتى ١٢٠ حرفًا</li>
        <li>شعار مربّع ٢٠٠×٢٠٠ بكسل (اختياري)</li>
        <li>زر إجراء بنصٍّ من اختيارك</li>
      </ul>
    </div>
    <div class="ad-format">
      <span class="ad-format__tag">استهداف دقيق</span>
      <h2>داخل صفحة متجر أو تصنيف</h2>
      <p>يظهر إعلانك لمن يتصفّح تصنيفًا بعينه — الإلكترونيات مثلًا — فتصل لمن يبحث عن منتجك تحديدًا.</p>
      <ul>
        <li>استهداف تصنيف واحد أو أكثر</li>
        <li>مناسب للعروض الموسمية قصيرة المدة</li>
        <li>تُضبط مدة الحملة باليوم</li>
      </ul>
    </div>
    <div class="ad-format">
      <span class="ad-format__tag">محتوى</span>
      <h2>داخل المدونة</h2>
      <p>مساحة داخل أدلّة التسوق، يقرؤها زائر قادم من بحث قوقل بنيّة واضحة.</p>
      <ul>
        <li>ظهور بعد ثلث المقال — حيث يكون القارئ منخرطًا</li>
        <li>يبقى ظاهرًا ما دام المقال يجلب زيارات</li>
        <li>خيار مقال تعريفي كامل عن علامتك</li>
      </ul>
    </div>
  </div>

  <section class="prose">
    <h2>كيف نعمل</h2>
    <ol>
      <li><strong>تواصل معنا</strong> وحدّد الموضع والمدة والتصنيف المستهدف.</li>
      <li><strong>نرسل لك أرقام الزيارات الحالية</strong> للموضع الذي اخترته، ونتفق على السعر بناءً عليها.</li>
      <li><strong>ترسل المواد</strong> — عنوان ونص وشعار ورابط الهبوط.</li>
      <li><strong>ينشر الإعلان</strong> خلال ٢٤ ساعة، ونرسل لك تقرير النقرات في نهاية الحملة.</li>
    </ol>

    <h2>ما لا نفعله</h2>
    <ul>
      <li>لا نعرض إعلانًا دون وسم «إعلان» واضح عليه.</li>
      <li>لا نبيع روابط تمرّر وزنًا لمحركات البحث — كل روابط المعلنين <code>nofollow sponsored</code>.</li>
      <li>لا نقبل إعلانات القروض السريعة ولا المضاربات ولا المنتجات الطبية غير المرخّصة.</li>
    </ul>

    <h2>للتواصل</h2>
    <p>${site.contactEmail ? `راسلنا على <a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a> وسنرد خلال يوم عمل.` : 'أضف بريد التواصل في <code>data/site.json</code> ليظهر هنا.'}</p>
  </section>
</div>`;

  return layout({
    title: `أعلن معنا — مساحات إعلانية | ${site.name}`,
    description: 'مساحات إعلانية داخل قوائم أكواد الخصم وصفحات المتاجر والمدونة. استهداف بالتصنيف، ووسم إعلاني واضح، وتقرير نقرات في نهاية كل حملة.',
    canonical: abs('/advertise/'),
    path: '/advertise/',
    body,
    schema: [
      breadcrumb([
        { name: 'الرئيسية', url: '/' },
        { name: 'أعلن معنا', url: '/advertise/' },
      ]),
    ],
  });
}

function pageSearch() {
  const body = `
<div class="shell">
  <h1 class="page-title">بحث</h1>
  <form class="searchbar searchbar--page" role="search" onsubmit="return false">
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.6-3.6"/></svg>
    <input type="search" name="q" id="live-search" placeholder="اسم متجر، أو تصنيف، أو كود…" aria-label="ابحث" autocomplete="off" autofocus>
  </form>
  <p class="page-lede" id="search-status">اكتب حرفين على الأقل للبحث في ${esc(codesLabel(TOTAL_CODES))}.</p>
  <div class="code-grid" id="search-results"></div>
</div>`;

  return layout({
    title: `بحث في الأكواد | ${site.name}`,
    description: 'ابحث في أكواد الخصم حسب اسم المتجر أو التصنيف أو الكود نفسه.',
    canonical: abs('/search/'),
    path: '/search/',
    body,
    noindex: true,
  });
}

function pageFavorites() {
  const body = `
<div class="shell">
  <h1 class="page-title">المفضلة</h1>
  <p class="page-lede" id="fav-status">الأكواد التي حفظتها محفوظة على جهازك فقط.</p>
  <div class="code-grid" id="fav-results"></div>
  <p class="empty" id="fav-empty" hidden>
    ما حفظت أي كود بعد. اضغط على ♥ في أي بطاقة كود ليظهر هنا.
    <br><a class="btn btn-primary" href="/" style="margin-top:16px">تصفّح الأكواد</a>
  </p>
</div>`;

  return layout({
    title: `المفضلة | ${site.name}`,
    description: 'الأكواد التي حفظتها.',
    canonical: abs('/favorites/'),
    path: '/favorites/',
    body,
    noindex: true,
  });
}

function pageOffline() {
  return layout({
    title: `لا يوجد اتصال | ${site.name}`,
    description: 'لا يوجد اتصال بالإنترنت.',
    path: '/offline/',
    noindex: true,
    body: `<div class="shell">
  <p class="empty" style="margin-top:48px">
    <strong style="display:block;font-size:20px;margin-bottom:8px">لا يوجد اتصال بالإنترنت</strong>
    الصفحات التي زرتها من قبل تبقى متاحة. تحقّق من الاتصال ثم أعد المحاولة.
    <br><a class="btn btn-primary" href="/" style="margin-top:16px">الصفحة الرئيسية</a>
  </p>
</div>`,
  });
}

function page404() {
  return layout({
    title: `الصفحة غير موجودة | ${site.name}`,
    description: 'الصفحة غير موجودة.',
    path: '/404',
    noindex: true,
    body: `<div class="shell">
  <p class="empty" style="margin-top:48px">
    <strong style="display:block;font-size:20px;margin-bottom:8px">الصفحة غير موجودة</strong>
    الرابط الذي فتحته غير صحيح أو أن الكود انتهت صلاحيته وحُذف.
    <br><a class="btn btn-primary" href="/" style="margin-top:16px">تصفّح الأكواد</a>
  </p>
</div>`,
  });
}

/* ======================= ملفات مرافقة ======================= */

function buildSitemap(urls) {
  const entries = urls
    .map(
      (u) => `  <url>
    <loc>${esc(abs(u.loc))}</loc>
    <lastmod>${BUILT_AT}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

const buildRobots = () => `User-agent: *
Allow: /
Disallow: /search/
Disallow: /favorites/
Disallow: /offline/

Sitemap: ${abs('/sitemap.xml')}
`;

const buildManifest = () =>
  JSON.stringify(
    {
      name: site.name,
      short_name: site.shortName || site.name,
      description: site.description,
      lang: 'ar',
      dir: 'rtl',
      start_url: '/?src=pwa',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#ffffff',
      theme_color: '#FF9500',
      categories: ['shopping', 'lifestyle'],
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      shortcuts: [
        { name: 'كل الأكواد', url: '/' },
        { name: 'المتاجر', url: '/stores/' },
        { name: 'المفضلة', url: '/favorites/' },
      ],
    },
    null,
    2
  );

/** عامل الخدمة: يجعل الصفحات المزارة تعمل بلا إنترنت. */
const buildSW = (version) => `/* يُولَّد آليًا — لا تعدّله يدويًا */
const VERSION = '${version}';
const CACHE = 'baro-coupons-' + VERSION;
const SHELL = ['/', '/styles.css', '/app.js', '/offline/', '/favicon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // الصفحات: الشبكة أولًا حتى تصل الأكواد الجديدة، والمخزَّن احتياطًا.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/offline/')))
    );
    return;
  }

  // الملفات الثابتة: المخزَّن أولًا مع تحديثٍ صامت في الخلفية.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
`;

const faviconSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="15" fill="#FF9500"/>
  <text x="32" y="45" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="bold" fill="#fff">%</text>
</svg>
`;

/* ======================= التنفيذ ======================= */

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

function write(rel, content) {
  const full = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function main() {
  if (!ORIGIN) {
    console.warn('⚠️  لا يوجد دومين في data/site.json — الروابط المطلقة (canonical / sitemap) ستكون ناقصة.');
  }
  if (!stores.length) {
    console.warn('⚠️  لا يوجد أي كود فعّال — سيُبنى الموقع فارغًا.');
  }

  fs.rmSync(DIST, { recursive: true, force: true });
  copyDir(path.join(ROOT, 'public'), DIST);

  const urls = [
    { loc: '/', freq: 'daily', priority: '1.0' },
    { loc: '/stores/', freq: 'weekly', priority: '0.8' },
    { loc: '/advertise/', freq: 'monthly', priority: '0.4' },
  ];

  if (posts.length) {
    write('blog/index.html', pageBlog());
    urls.push({ loc: '/blog/', freq: 'weekly', priority: '0.8' });

    for (const post of posts) {
      const { url, html } = pagePost(post);
      write(path.join(url, 'index.html'), html);
      urls.push({ loc: url, freq: 'monthly', priority: '0.7' });
    }
  }

  write('index.html', pageHome());
  write('stores/index.html', pageStores());
  write('advertise/index.html', pageAdvertise());
  write('search/index.html', pageSearch());
  write('favorites/index.html', pageFavorites());
  write('offline/index.html', pageOffline());
  write('404.html', page404());
  write('favicon.svg', faviconSvg());

  for (const s of stores) {
    const { url, html } = pageStore(s);
    write(path.join(url, 'index.html'), html);
    urls.push({ loc: url, freq: 'weekly', priority: '0.9' });
  }

  for (const cat of categories) {
    const { url, html } = pageCategory(cat);
    write(path.join(url, 'index.html'), html);
    urls.push({ loc: url, freq: 'weekly', priority: '0.7' });
  }

  // فهرس الأكواد لصفحتي البحث والمفضلة — يُقرأ من المتصفح لا من الخادم.
  write(
    'data/codes.json',
    JSON.stringify(
      allCodes.map((c) => ({
        id: c.id,
        code: c.code,
        title: c.title || `كود خصم ${c.store.name}`,
        discount: c.discount || '',
        terms: c.terms || '',
        expires: c.expires || '',
        featured: !!c.featured,
        store: {
          slug: c.store.slug,
          name: c.store.name,
          url: c.store.url,
          category: c.store.category,
          logo: c.store.logo || '',
          brandColor: c.store.brandColor || '#FF9500',
          ink: readableInk(c.store.brandColor || '#FF9500'),
        },
      }))
    )
  );

  write('sitemap.xml', buildSitemap(urls));
  write('robots.txt', buildRobots());
  write('manifest.webmanifest', buildManifest());

  // نسخة عامل الخدمة مشتقّة من المحتوى: كل نشرٍ فيه جديد يُبطل المخزَّن القديم.
  const version = crypto
    .createHash('sha1')
    .update(
      JSON.stringify(rawStores) +
        JSON.stringify(rawPosts) +
        JSON.stringify(rawAds) +
        fs.readFileSync(path.join(ROOT, 'public/styles.css'))
    )
    .digest('hex')
    .slice(0, 10);
  write('sw.js', buildSW(version));

  console.log(
    `✅ ${urls.length} صفحة مفهرسة · ${TOTAL_CODES} كود · ${stores.length} متجر · ` +
      `${categories.length} تصنيف · ${posts.length} مقال · ${ads.length} إعلان مدفوع\n` +
      `   الدومين: ${ORIGIN || '(غير محدد)'} · الخط: ${FONT_MODE} · إصدار SW: ${version}`
  );
}

main();
