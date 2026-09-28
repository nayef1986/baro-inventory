/**
 * لوحة الإدارة — تعمل في المتصفح وحده، بلا خادم.
 *
 * الشعار المرفوع يُصغَّر إلى مربّع ٢٥٦ ويُخزَّن داخل stores.json نفسه كـ data:URI،
 * فيبقى كل شيء في ملفٍّ واحد يُنزَّل ويُرفع. مولّد الموقع يفكّه إلى صورة حقيقية
 * عند البناء، فلا يحمل الزائر البيانات مضمّنةً في كل صفحة.
 */
(function () {
  'use strict';

  var KEY = 'akwad:admin:stores';
  var LOGO_PX = 256;

  var state = { stores: [], active: 0 };

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- أدوات ---------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** معرّف صالح للروابط — يقبل العربية والإنجليزية. */
  function slugify(s) {
    return String(s || '').trim()
      .replace(/[ؗ-ًؚ-ْـ]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  function readableInk(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return '#fff';
    var h = m[1];
    var p = [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; });
    var lin = function (c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    var L = 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
    return L > 0.45 ? '#16181d' : '#ffffff';
  }

  var toastTimer;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('is-on'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-on');
      setTimeout(function () { el.hidden = true; }, 260);
    }, 2000);
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state.stores));
    } catch (e) {
      toast('تعذّر الحفظ التلقائي — نزّل الملف كي لا يضيع عملك');
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    } catch (e) { /* تخزين معطّل أو تالف */ }
    return null;
  }

  /* ---------------- الشعار ---------------- */

  /** يُصغّر أي صورة إلى مربّع شفاف ٢٥٦×٢٥٦ محافظًا على النسبة. */
  function processLogo(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('ليست صورة'));

      // SVG يُحفظ كما هو: متجهٌ لا يستفيد من إعادة الرسم
      if (file.type === 'image/svg+xml') {
        var r = new FileReader();
        r.onload = function () { resolve(String(r.result)); };
        r.onerror = function () { reject(new Error('فشل القراءة')); };
        r.readAsDataURL(file);
        return;
      }

      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var cv = document.createElement('canvas');
        cv.width = cv.height = LOGO_PX;
        var ctx = cv.getContext('2d');
        ctx.imageSmoothingQuality = 'high';

        var scale = Math.min(LOGO_PX / img.width, LOGO_PX / img.height);
        var w = Math.round(img.width * scale);
        var h = Math.round(img.height * scale);
        ctx.drawImage(img, (LOGO_PX - w) / 2, (LOGO_PX - h) / 2, w, h);

        // webp أصغر بكثير؛ نعود إلى png إن لم يدعمه المتصفح
        var out = cv.toDataURL('image/webp', 0.9);
        if (out.indexOf('data:image/webp') !== 0) out = cv.toDataURL('image/png');
        resolve(out);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('تعذّرت قراءة الصورة'));
      };
      img.src = url;
    });
  }

  /* ---------------- نماذج فارغة ---------------- */

  function blankStore() {
    return {
      slug: '', name: '', url: '', logo: '', brandColor: '#FF9500',
      category: '', description: '', codes: [blankCode()],
    };
  }

  function blankCode() {
    return { code: '', title: '', discount: '', expires: '' };
  }

  /* ---------------- العرض ---------------- */

  function current() { return state.stores[state.active] || null; }

  function renderList() {
    var ul = $('brand-list');
    $('brand-count').textContent = state.stores.length;

    if (!state.stores.length) {
      ul.innerHTML = '<li class="empty-side">لا يوجد براند بعد.<br>اضغط «+ براند».</li>';
      return;
    }

    ul.innerHTML = state.stores.map(function (s, i) {
      var mark = s.logo
        ? '<img class="mini" src="' + esc(s.logo) + '" alt="">'
        : '<span class="mini" style="background:' + esc(s.brandColor || '#FF9500') +
          ';color:' + readableInk(s.brandColor) + '">' + esc((s.name || '؟').trim().charAt(0)) + '</span>';

      var n = (s.codes || []).filter(function (c) { return c.code; }).length;

      return '<li><button type="button" data-i="' + i + '" aria-current="' + (i === state.active) + '">' +
        mark +
        '<span class="n">' + esc(s.name || 'بدون اسم') + '</span>' +
        '<span class="c">' + n + '</span>' +
        '</button></li>';
    }).join('');
  }

  function renderEditor() {
    var s = current();
    $('editor').hidden = !s;
    if (!s) { $('preview').innerHTML = ''; return; }

    $('f-name').value = s.name || '';
    $('f-url').value = s.url || '';
    $('f-category').value = s.category || '';
    $('f-color').value = /^#[0-9a-f]{6}$/i.test(s.brandColor || '') ? s.brandColor : '#FF9500';
    $('f-slug').value = s.slug || '';
    $('f-desc').value = s.description || '';

    var drop = $('logo-drop');
    drop.classList.toggle('has-img', !!s.logo);
    $('logo-preview').style.backgroundImage = s.logo ? 'url("' + s.logo + '")' : '';
    drop.querySelector('.logo-drop__label').textContent = s.logo ? 'تغيير' : 'ارفع الشعار';

    renderCodes();
    renderCats();
    renderPreview();
  }

  function renderCodes() {
    var s = current();
    if (!s) return;
    $('code-count').textContent = s.codes.length;

    $('code-list').innerHTML = s.codes.map(function (c, i) {
      return '<div class="coderow" data-ci="' + i + '">' +
        '<label class="field"><span>الكود</span><input dir="ltr" data-k="code" value="' + esc(c.code) + '" placeholder="SAVE20"></label>' +
        '<label class="field"><span>الوصف <em>اختياري</em></span><input data-k="title" value="' + esc(c.title) + '" placeholder="خصم على كل الطلب"></label>' +
        '<label class="field"><span>النسبة <em>اختياري</em></span><input data-k="discount" value="' + esc(c.discount) + '" placeholder="20%"></label>' +
        '<label class="field"><span>الانتهاء <em>اختياري</em></span><input type="date" data-k="expires" value="' + esc(c.expires) + '"></label>' +
        '<button type="button" class="del" data-del="' + i + '" aria-label="حذف الكود">×</button>' +
        '</div>';
    }).join('');
  }

  function renderCats() {
    var seen = {};
    state.stores.forEach(function (s) { if (s.category) seen[s.category] = 1; });
    $('cats').innerHTML = Object.keys(seen).map(function (c) {
      return '<option value="' + esc(c) + '">';
    }).join('');
  }

  /** معاينة مطابقة لبلاطة الموقع — نفس الأصناف تمامًا. */
  function renderPreview() {
    var s = current();
    if (!s) return;
    var c = s.codes.find(function (x) { return x.code; }) || s.codes[0] || blankCode();

    var logo = s.logo
      ? '<img class="store-logo tile__logo store-logo--img" src="' + esc(s.logo) + '" alt="">'
      : '<span class="store-logo tile__logo store-logo--text" style="--logo-bg:' + esc(s.brandColor || '#FF9500') +
        ';color:' + readableInk(s.brandColor) + '">' + esc((s.name || '؟').trim().charAt(0)) + '</span>';

    $('preview').innerHTML =
      '<article class="tile">' +
        (c.discount ? '<span class="tile__off">' + esc(c.discount) + '</span>' : '') +
        '<span class="tile__fav" aria-hidden="true"><svg viewBox="0 0 24 24" width="17" height="17"><path d="M12 20.5 4.8 13a4.6 4.6 0 0 1 6.5-6.5l.7.7.7-.7A4.6 4.6 0 1 1 19.2 13Z"/></svg></span>' +
        '<div class="tile__brand">' + logo +
          '<span class="tile__name">' + esc(s.name || 'اسم البراند') + '</span>' +
        '</div>' +
        '<div class="tile__row">' +
          '<span class="tile__code">' + esc(c.code || 'CODE') + '</span>' +
          '<button type="button" class="tile__copy">نسخ</button>' +
        '</div>' +
        (c.expires ? '<p class="tile__exp">ينتهي ' + esc(c.expires) + '</p>' : '') +
      '</article>';
  }

  function renderAll() { renderList(); renderEditor(); }

  /* ---------------- الأحداث ---------------- */

  $('add-brand').addEventListener('click', function () {
    state.stores.push(blankStore());
    state.active = state.stores.length - 1;
    save(); renderAll();
    $('f-name').focus();
  });

  $('brand-list').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-i]');
    if (!b) return;
    state.active = Number(b.dataset.i);
    renderAll();
  });

  $('del-brand').addEventListener('click', function () {
    var s = current();
    if (!s) return;
    if (!confirm('حذف «' + (s.name || 'هذا البراند') + '» وكل أكواده؟')) return;
    state.stores.splice(state.active, 1);
    state.active = Math.max(0, state.active - 1);
    save(); renderAll();
  });

  // حقول البراند: المعرّف يتبع الاسم ما لم يحرّره المستخدم بنفسه
  [['f-name', 'name'], ['f-url', 'url'], ['f-category', 'category'],
   ['f-color', 'brandColor'], ['f-slug', 'slug'], ['f-desc', 'description']].forEach(function (pair) {
    $(pair[0]).addEventListener('input', function () {
      var s = current();
      if (!s) return;
      s[pair[1]] = this.value;

      if (pair[1] === 'name' && !s._slugTouched) {
        s.slug = slugify(this.value);
        $('f-slug').value = s.slug;
      }
      if (pair[1] === 'slug') s._slugTouched = true;

      save(); renderList(); renderPreview(); renderCats();
    });
  });

  $('add-code').addEventListener('click', function () {
    var s = current();
    if (!s) return;
    s.codes.push(blankCode());
    save(); renderCodes(); renderList();
  });

  $('code-list').addEventListener('input', function (e) {
    var input = e.target.closest('input[data-k]');
    if (!input) return;
    var row = input.closest('.coderow');
    var s = current();
    if (!s || !row) return;
    s.codes[Number(row.dataset.ci)][input.dataset.k] = input.value;
    save(); renderPreview(); renderList();
  });

  $('code-list').addEventListener('click', function (e) {
    var del = e.target.closest('[data-del]');
    if (!del) return;
    var s = current();
    if (!s) return;
    s.codes.splice(Number(del.dataset.del), 1);
    if (!s.codes.length) s.codes.push(blankCode());
    save(); renderCodes(); renderPreview(); renderList();
  });

  /* ---- رفع الشعار: زر، وسحب وإفلات، ولصق ---- */

  var drop = $('logo-drop');

  function applyLogo(file) {
    var s = current();
    if (!s || !file) return;
    processLogo(file).then(function (dataUri) {
      s.logo = dataUri;
      save(); renderEditor(); renderList();
      toast('تم رفع الشعار');
    }, function (err) {
      toast(err.message || 'تعذّر رفع الصورة');
    });
  }

  $('logo-file').addEventListener('change', function () {
    applyLogo(this.files && this.files[0]);
    this.value = '';
  });

  ['dragenter', 'dragover'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
  });
  drop.addEventListener('drop', function (e) {
    applyLogo(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });

  document.addEventListener('paste', function (e) {
    if (!current()) return;
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image/') === 0) {
        applyLogo(items[i].getAsFile());
        return;
      }
    }
  });

  /* ---- تنزيل واستيراد ---- */

  /** يُخرج بيانات نظيفة: بلا حقول فارغة وبلا علامات داخلية. */
  function clean() {
    return state.stores
      .filter(function (s) { return s.name && s.url; })
      .map(function (s) {
        var out = {
          slug: s.slug || slugify(s.name),
          name: s.name,
          url: s.url,
          logo: s.logo || '',
          brandColor: s.brandColor || '#FF9500',
          category: s.category || 'أخرى',
          description: s.description || '',
          codes: (s.codes || [])
            .filter(function (c) { return c.code; })
            .map(function (c) {
              var o = { code: c.code.trim() };
              if (c.title) o.title = c.title;
              if (c.discount) o.discount = c.discount;
              if (c.expires) o.expires = c.expires;
              return o;
            }),
        };
        return out;
      })
      .filter(function (s) { return s.codes.length; });
  }

  $('export-btn').addEventListener('click', function () {
    var data = clean();
    if (!data.length) { toast('أضف براندًا واحدًا بكود واحد على الأقل'); return; }

    var blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'stores.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);

    var n = data.reduce(function (t, s) { return t + s.codes.length; }, 0);
    var st = $('status');
    st.classList.add('is-ok');
    st.innerHTML = 'نُزِّل الملف: ' + data.length + ' براند و' + n +
      ' كود. ضعه في <code>coupons/data/stores.json</code> ثم ارفعه — سيُبنى الموقع تلقائيًا.';
  });

  $('import-btn').addEventListener('click', function () { $('import-file').click(); });

  $('import-file').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var arr = JSON.parse(String(r.result));
        if (!Array.isArray(arr)) throw new Error('بنية غير متوقعة');
        state.stores = arr.map(function (s) {
          return Object.assign(blankStore(), s, {
            codes: (s.codes && s.codes.length ? s.codes : [blankCode()]).map(function (c) {
              return Object.assign(blankCode(), c);
            }),
            _slugTouched: true,
          });
        });
        state.active = 0;
        save(); renderAll();
        toast('استُورد ' + state.stores.length + ' براند');
      } catch (err) {
        toast('ملف غير صالح');
      }
    };
    r.readAsText(f);
  });

  /* ---------------- الإقلاع ---------------- */

  var saved = load();
  if (saved && saved.length) {
    state.stores = saved.map(function (s) {
      return Object.assign(blankStore(), s, {
        codes: (s.codes && s.codes.length ? s.codes : [blankCode()]).map(function (c) {
          return Object.assign(blankCode(), c);
        }),
      });
    });
  }

  renderAll();

  // الأكواد الحالية للموقع تُحمَّل مرّة واحدة كنقطة بداية
  if (!state.stores.length) {
    fetch('/data/codes.json')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (codes) {
        var by = {};
        codes.forEach(function (c) {
          var k = c.store.slug;
          if (!by[k]) {
            by[k] = Object.assign(blankStore(), {
              slug: k, name: c.store.name, url: c.store.url, logo: c.store.logo,
              brandColor: c.store.brandColor, category: c.store.category, codes: [], _slugTouched: true,
            });
          }
          by[k].codes.push({ code: c.code, title: c.title, discount: c.discount, expires: c.expires });
        });
        state.stores = Object.keys(by).map(function (k) { return by[k]; });
        if (state.stores.length) { save(); renderAll(); }
      })
      .catch(function () { /* موقع فارغ — نبدأ من الصفر */ });
  }
})();
