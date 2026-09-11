/**
 * مولّد الموقع الثابت.
 * يقرأ data/site.json و data/stores.json وينتج صفحات HTML جاهزة للفهرسة في محركات البحث.
 *   node build.js            → ينتج المجلد dist/
 *   SITE_URL=https://x.com node build.js   → يتجاوز الدومين المكتوب في site.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');

const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const stores = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stores.json'), 'utf8'));

const ORIGIN = (process.env.SITE_URL || site.domain || '').replace(/\/+$/, '');
const BUILT_AT = new Date().toISOString().slice(0, 10);

/* ------------------------- أدوات ------------------------- */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const abs = (p) => ORIGIN + (p.startsWith('/') ? p : '/' + p);

const isExpired = (code) => {
  if (!code.expires) return false;
  const d = new Date(code.expires + 'T23:59:59Z');
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
};

const activeCodes = (store) => (store.codes || []).filter((c) => c.code && !isExpired(c));

/** صيغة العدد بالعربية: مفرد، مثنّى، جمع قلّة (٣-١٠)، ثم تمييز منصوب مفرد (١١+). */
function arCount(n, one, two, few, many) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

const codesLabel = (n) => arCount(n, 'كود فعّال', 'كودان فعّالان', 'أكواد فعّالة', 'كودًا فعّالًا');
const storesLabel = (n) => arCount(n, 'متجر واحد', 'متجران', 'متاجر', 'متجرًا');

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ar', { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
};

/** لون نص مقروء فوق لون العلامة — أسود على الألوان الفاتحة وأبيض على الداكنة. */
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

/** شعار المتجر: صورة إن وُجدت، وإلا مربع بحرف الاسم الأول بلون العلامة. */
function logoHtml(store, cls = '') {
  const classes = ('store-logo ' + cls).trim();
  if (store.logo) {
    return `<img class="${classes}" src="${esc(store.logo)}" alt="شعار ${esc(store.name)}" width="52" height="52" loading="lazy" decoding="async">`;
  }
  const letter = esc((store.name || '؟').trim().charAt(0));
  const bg = store.brandColor || '#1f6feb';
  const ink = readableInk(bg);
  return `<div class="${classes} store-logo--text" style="background:${esc(bg)};color:${esc(ink)}" role="img" aria-label="شعار ${esc(store.name)}">${letter}</div>`;
}

function jsonLd(obj) {
  // </script> داخل JSON يكسر الصفحة — نهرّبه
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

/* ------------------------- الخطوط ------------------------- */

/**
 * وضعان:
 *  "thmanyah" → خط ثمانية (Thmanyah Sans + Serif Display) عبر حزمة الويب المجتمعية.
 *  "plex"     → IBM Plex Sans Arabic + Noto Naskh Arabic (رخصة OFL، تجاري مسموح) —
 *               وهما الخطان المنصوص عليهما في نظام تصميم ثمانية الرسمي.
 * ملفات styles.css تُرتّب العائلتين في نفس المكدّس، فالتبديل لا يحتاج أي تعديل آخر.
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

const FONT_LINKS = [
  '<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  // الاحتياطي المرخّص تجاريًا يُحمَّل دائمًا: يظهر فورًا ريثما يصل خط ثمانية، وإن تعذّر بقي الموقع بهويته.
  ...new Set([...FONT_SOURCES[FONT_MODE], ...FONT_SOURCES.plex]),
].map((v) => (v.startsWith('<') ? v : `<link rel="stylesheet" href="${v}">`)).join('\n');

/* ------------------------- القالب العام ------------------------- */

function layout({ title, description, canonical, bodyClass = '', head = '', body, schema = [] }) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="theme-color" content="#1f6feb">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:locale" content="${esc(site.locale || 'ar_SA')}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(abs('/og.png'))}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(abs('/og.png'))}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${FONT_LINKS}
<link rel="stylesheet" href="/styles.css">
${head}
${schema.map(jsonLd).join('\n')}
</head>
<body class="${bodyClass}">
<header class="site-header">
  <div class="wrap">
    <a class="logo" href="/">
      <span class="logo-mark" aria-hidden="true">%</span>
      <span class="logo-text">${esc(site.name)}</span>
    </a>
    <nav aria-label="التنقل الرئيسي">
      <a href="/">المتاجر</a>
      <a href="/#كيف-يعمل">كيف يعمل</a>
      <a href="/#الأسئلة">الأسئلة</a>
    </nav>
  </div>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <span>© ${new Date().getFullYear()} ${esc(site.name)} — جميع الحقوق محفوظة.</span>
    <span>آخر تحديث للأكواد: ${esc(fmtDate(BUILT_AT))}</span>
  </div>
</footer>
<script src="/app.js" defer></script>
</body>
</html>
`;
}

/* ------------------------- بطاقة كود ------------------------- */

function codeCard(store, code, heading = 'h3') {
  const featured = code.featured ? '<span class="tag tag--featured">الأكثر استخدامًا</span>' : '';
  const discount = code.discount ? `<span class="tag tag--discount">${esc(code.discount)}</span>` : '';
  const expires = code.expires ? `<span class="tag">ينتهي ${esc(fmtDate(code.expires))}</span>` : '';
  const terms = code.terms ? `<p class="terms">${esc(code.terms)}</p>` : '';

  return `<article class="code-card${code.featured ? ' is-featured' : ''}">
  <div class="body">
    <div class="tags">${discount}${featured}${expires}</div>
    <${heading}>${esc(code.title || `كود خصم ${store.name}`)}</${heading}>
    ${terms}
  </div>
  <div class="copy-area">
    <button type="button" class="copy-btn" data-code="${esc(code.code)}" data-url="${esc(store.url)}"
            aria-label="انسخ كود ${esc(code.code)} وافتح متجر ${esc(store.name)}">
      <span>${esc(code.code)}</span>
      <span class="label">اضغط للنسخ</span>
    </button>
    <a class="btn btn-ghost btn-block" href="${esc(store.url)}" target="_blank" rel="nofollow sponsored noopener">
      زيارة المتجر ↗
    </a>
  </div>
</article>`;
}

/* ------------------------- الصفحة الرئيسية ------------------------- */

function buildIndex() {
  const withCodes = stores
    .map((s) => ({ ...s, active: activeCodes(s) }))
    .filter((s) => s.active.length > 0);

  const categories = [...new Set(withCodes.map((s) => s.category).filter(Boolean))];

  const chips =
    `<button type="button" class="chip" data-category="all" aria-pressed="true">الكل</button>` +
    categories
      .map((c) => `<button type="button" class="chip" data-category="${esc(c)}" aria-pressed="false">${esc(c)}</button>`)
      .join('');

  const totalCodes = withCodes.reduce((n, s) => n + s.active.length, 0);

  const cards = withCodes
    .map((s) => {
      const haystack = [s.name, s.category, s.description, ...s.active.map((c) => c.title)].join(' ');
      return `<article class="store-card" data-store-card data-category="${esc(s.category || '')}" data-search="${esc(haystack)}">
  <div class="head">
    ${logoHtml(s)}
    <div>
      <h3><a href="/store/${esc(s.slug)}/">أكواد خصم ${esc(s.name)}</a></h3>
      <div class="meta">${esc(s.category || '')}</div>
    </div>
  </div>
  <p class="desc">${esc(s.description || '')}</p>
  <div class="cta">
    <span class="count-badge">${codesLabel(s.active.length)}</span>
    <a class="btn btn-primary" href="/store/${esc(s.slug)}/">عرض الأكواد</a>
  </div>
</article>`;
    })
    .join('\n');

  const body = `
<section class="hero">
  <div class="wrap">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span> ${codesLabel(totalCodes)} · محدَّث ${esc(fmtDate(BUILT_AT))}</p>
    <h1>${esc(site.tagline).replace('جاهزة للنسخ', '<em>جاهزة للنسخ</em>')}</h1>
    <p class="lede">${esc(site.description)}</p>
    <div class="search-box">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>
      </svg>
      <input type="search" id="store-search" placeholder="ابحث عن متجر… مثال: نون" aria-label="ابحث عن متجر">
    </div>
  </div>
</section>

<div class="wrap">
  <div class="filters">${chips}</div>

  <section data-section>
    <h2 class="section-title">المتاجر <span>${storesLabel(withCodes.length)} · ${codesLabel(totalCodes)}</span></h2>
    <div class="grid">
${cards}
    </div>
  </section>

  <p class="empty" id="no-results" hidden>ما لقينا متجرًا بهذا الاسم. جرّب كلمة أخرى.</p>

  <div class="prose">
    <h2 id="كيف-يعمل">كيف تستخدم كود الخصم؟</h2>
    <ol>
      <li>اختر المتجر من القائمة أعلاه وافتح صفحته.</li>
      <li>اضغط على الكود لنسخه — ينسخ تلقائيًا ويفتح لك المتجر في تبويب جديد.</li>
      <li>أضف منتجاتك إلى السلة وانتقل إلى صفحة الدفع.</li>
      <li>الصق الكود في خانة «كود الخصم» أو «الكوبون» واضغط تطبيق.</li>
      <li>تأكد أن قيمة الخصم ظهرت في الإجمالي قبل إتمام الطلب.</li>
    </ol>

    <h2 id="الأسئلة">الأسئلة الشائعة</h2>
    <div class="faq">
      <details><summary>ليش ما اشتغل الكود معي؟</summary>
        <p>أغلب الأكواد لها شروط: حد أدنى للطلب، أو قسم محدد، أو صلاحية للعملاء الجدد فقط. اقرأ الشروط تحت كل كود، وجرّب كودًا آخر من نفس المتجر.</p></details>
      <details><summary>هل الأكواد مجانية؟</summary>
        <p>نعم، كل الأكواد في الموقع مجانية تمامًا ولا تحتاج تسجيل أو اشتراك.</p></details>
      <details><summary>كم مرة تتحدث الأكواد؟</summary>
        <p>نراجع الأكواد بشكل دوري ونحذف المنتهية منها تلقائيًا، وآخر تحديث موضّح في أسفل الصفحة.</p></details>
      <details><summary>هل أقدر أستخدم أكثر من كود في نفس الطلب؟</summary>
        <p>غالبًا لا — أغلب المتاجر تسمح بكود واحد لكل طلب. اختر الكود الأعلى قيمة.</p></details>
    </div>
  </div>
</div>`;

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: site.name,
      url: abs('/'),
      inLanguage: 'ar',
      description: site.description,
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: abs('/?q={search_term_string}') },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'متاجر لديها أكواد خصم فعّالة',
      numberOfItems: withCodes.length,
      itemListElement: withCodes.map((s, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: `أكواد خصم ${s.name}`,
        url: abs(`/store/${s.slug}/`),
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        ['ليش ما اشتغل الكود معي؟', 'أغلب الأكواد لها شروط: حد أدنى للطلب، أو قسم محدد، أو صلاحية للعملاء الجدد فقط. اقرأ الشروط تحت كل كود، وجرّب كودًا آخر من نفس المتجر.'],
        ['هل الأكواد مجانية؟', 'نعم، كل الأكواد في الموقع مجانية تمامًا ولا تحتاج تسجيل أو اشتراك.'],
        ['كم مرة تتحدث الأكواد؟', 'نراجع الأكواد بشكل دوري ونحذف المنتهية منها تلقائيًا.'],
        ['هل أقدر أستخدم أكثر من كود في نفس الطلب؟', 'غالبًا لا — أغلب المتاجر تسمح بكود واحد لكل طلب.'],
      ].map(([q, a]) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  ];

  return layout({
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    canonical: abs('/'),
    body,
    schema,
  });
}

/* ------------------------- صفحة متجر ------------------------- */

function buildStore(store) {
  const codes = activeCodes(store);
  const url = `/store/${store.slug}/`;
  const title = `أكواد خصم ${store.name} ${new Date().getFullYear()} — ${codes.length} كوبون فعّال`;
  const description = `أحدث أكواد وكوبونات خصم ${store.name} فعّالة ومجرّبة. انسخ الكود بضغطة واحدة وادخل المتجر مباشرة. ${store.description || ''}`.slice(0, 300);

  const codesHtml = codes.length
    ? `<div class="codes">${codes.map((c) => codeCard(store, c, 'h2')).join('\n')}</div>`
    : `<p class="empty">ما فيه أكواد فعّالة لهذا المتجر حاليًا — نحدّث الصفحة أول ما يتوفر كود جديد.</p>`;

  const body = `
<div class="wrap page-narrow">
  <nav class="crumbs" aria-label="مسار التصفح">
    <a href="/">الرئيسية</a> ← <span>${esc(store.name)}</span>
  </nav>

  <section class="store-hero">
    ${logoHtml(store)}
    <div class="info">
      <h1>أكواد خصم ${esc(store.name)}</h1>
      <p>${esc(store.description || '')}</p>
    </div>
    <div class="actions">
      <a class="btn btn-primary" href="${esc(store.url)}" target="_blank" rel="nofollow sponsored noopener">
        فتح ${esc(store.name)} ↗
      </a>
    </div>
  </section>

  <h2 class="section-title">الأكواد المتاحة <span>${codesLabel(codes.length)}</span></h2>
  ${codesHtml}

  <div class="prose">
    <h2>طريقة استخدام كود خصم ${esc(store.name)}</h2>
    <ol>
      <li>اضغط على الكود أعلاه — ينسخ تلقائيًا ويفتح موقع ${esc(store.name)} في تبويب جديد.</li>
      <li>اختر منتجاتك وأضفها إلى سلة التسوق.</li>
      <li>في صفحة الدفع، الصق الكود في خانة «كود الخصم» واضغط تطبيق.</li>
      <li>تأكد من ظهور قيمة الخصم في الإجمالي قبل تأكيد الطلب.</li>
    </ol>
    <h3>ملاحظات مهمة</h3>
    <ul>
      <li>كل كود له شروطه الخاصة، وهي مكتوبة تحته مباشرة.</li>
      <li>في الغالب لا يمكن دمج أكثر من كود في الطلب الواحد.</li>
      <li>إذا لم يعمل الكود، جرّب غيره من القائمة — بعض الأكواد تنتهي قبل تاريخها المعلن.</li>
    </ul>
  </div>
</div>`;

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: abs('/') },
        { '@type': 'ListItem', position: 2, name: `أكواد خصم ${store.name}`, item: abs(url) },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: store.name,
      url: store.url,
      description: store.description,
      ...(store.logo ? { logo: store.logo.startsWith('http') ? store.logo : abs(store.logo) } : {}),
    },
    ...codes.map((c) => ({
      '@context': 'https://schema.org',
      '@type': 'Offer',
      name: c.title || `كود خصم ${store.name}`,
      description: c.terms || c.title || '',
      url: abs(url),
      seller: { '@type': 'Organization', name: store.name, url: store.url },
      availability: 'https://schema.org/InStock',
      ...(c.expires ? { validThrough: c.expires } : {}),
    })),
  ];

  return { url, html: layout({ title, description, canonical: abs(url), body, schema }) };
}

/* ------------------------- ملفات مساعدة ------------------------- */

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

function buildRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${abs('/sitemap.xml')}
`;
}

function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1f6feb"/><stop offset="1" stop-color="#7b3ff2"/>
  </linearGradient></defs>
  <rect width="64" height="64" rx="15" fill="url(#g)"/>
  <text x="32" y="45" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="bold" fill="#fff">%</text>
</svg>
`;
}

/* ------------------------- التنفيذ ------------------------- */

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

  fs.rmSync(DIST, { recursive: true, force: true });
  copyDir(path.join(ROOT, 'public'), DIST);

  write('index.html', buildIndex());
  write('favicon.svg', faviconSvg());

  const urls = [{ loc: '/', freq: 'daily', priority: '1.0' }];

  let pages = 1;
  for (const store of stores) {
    if (activeCodes(store).length === 0) continue;
    const { url, html } = buildStore(store);
    write(path.join(url, 'index.html'), html);
    urls.push({ loc: url, freq: 'weekly', priority: '0.8' });
    pages++;
  }

  write('sitemap.xml', buildSitemap(urls));
  write('robots.txt', buildRobots());

  console.log(`✅ تم بناء ${pages} صفحة في dist/ — الدومين: ${ORIGIN || '(غير محدد)'}`);
}

main();
