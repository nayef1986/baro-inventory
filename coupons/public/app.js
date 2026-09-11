/* واجهة التطبيق: نسخ، مفضلة، تصفية، بحث، تثبيت — بدون أي مكتبات خارجية. */
(function () {
  'use strict';

  var FAV_KEY = 'baro:favorites';
  var COPIED_KEY = 'baro:copied';

  /* ---------------- تخزين آمن ---------------- */
  /* التخزين قد يكون معطّلًا (تصفّح خاص، حظر الكوكيز) — كل قراءة وكتابة محمية. */
  function readSet(key) {
    try {
      var raw = localStorage.getItem(key);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function writeSet(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr.slice(0, 400)));
    } catch (e) {
      /* ممتلئ أو محظور — نتجاهل بصمت */
    }
  }

  /* ---------------- تنبيه عائم ---------------- */
  var toastEl = document.getElementById('toast');
  var toastTimer;

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    requestAnimationFrame(function () {
      toastEl.classList.add('is-on');
    });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-on');
      setTimeout(function () {
        toastEl.hidden = true;
      }, 260);
    }, 2200);
  }

  /* ---------------- النسخ ---------------- */
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  function markCopied(btn) {
    var label = btn.querySelector('.copy-btn__label');
    if (label && !btn.dataset.idle) btn.dataset.idle = label.innerHTML;
    btn.classList.add('is-copied');
    if (label) label.textContent = 'تم النسخ ✓';
    clearTimeout(btn._t);
    btn._t = setTimeout(function () {
      btn.classList.remove('is-copied');
      if (label && btn.dataset.idle) label.innerHTML = btn.dataset.idle;
    }, 2200);

    var id = btn.dataset.id;
    if (id) {
      var copied = readSet(COPIED_KEY).filter(function (x) {
        return x !== id;
      });
      copied.unshift(id);
      writeSet(COPIED_KEY, copied);
      var card = btn.closest('[data-code-card]');
      if (card) card.classList.add('was-copied');
    }
  }

  function copyCode(btn) {
    var code = btn.dataset.code || '';
    if (!code) return;

    var done = function () {
      markCopied(btn);
      toast('نُسخ الكود ' + code + ' — الصقه في صفحة الدفع');
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code).then(done, function () {
        if (fallbackCopy(code)) done();
        else toast('تعذّر النسخ تلقائيًا — انسخ الكود يدويًا: ' + code);
      });
    } else if (fallbackCopy(code)) {
      done();
    } else {
      toast('تعذّر النسخ تلقائيًا — انسخ الكود يدويًا: ' + code);
    }

    /* فتح المتجر مباشرة بعد النسخ: النقرة نفسها، فلا يحجبها المتصفح. */
    if (btn.dataset.url) window.open(btn.dataset.url, '_blank', 'noopener');
  }

  /* ---------------- المفضلة ---------------- */
  function isFav(id) {
    return readSet(FAV_KEY).indexOf(id) !== -1;
  }

  function toggleFav(id) {
    var favs = readSet(FAV_KEY);
    var i = favs.indexOf(id);
    if (i === -1) {
      favs.unshift(id);
      writeSet(FAV_KEY, favs);
      return true;
    }
    favs.splice(i, 1);
    writeSet(FAV_KEY, favs);
    return false;
  }

  function paintState(root) {
    var favs = readSet(FAV_KEY);
    var copied = readSet(COPIED_KEY);

    (root || document).querySelectorAll('[data-fav]').forEach(function (b) {
      var on = favs.indexOf(b.dataset.fav) !== -1;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-on', on);
    });

    (root || document).querySelectorAll('[data-code-card]').forEach(function (c) {
      if (copied.indexOf(c.id) !== -1) c.classList.add('was-copied');
    });
  }

  /* ---------------- نقرة واحدة تخدم الزرّين ---------------- */
  document.addEventListener('click', function (e) {
    var copy = e.target.closest('.copy-btn');
    if (copy) {
      copyCode(copy);
      return;
    }

    var fav = e.target.closest('[data-fav]');
    if (fav) {
      e.preventDefault();
      var on = toggleFav(fav.dataset.fav);
      fav.setAttribute('aria-pressed', String(on));
      fav.classList.toggle('is-on', on);
      toast(on ? 'أُضيف إلى المفضلة' : 'أُزيل من المفضلة');
      if (document.getElementById('fav-results')) renderFavorites();
    }
  });

  /* ---------------- تطبيع النص العربي للبحث ---------------- */
  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[ؗ-ًؚ-ْـ]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .trim();
  }

  /* ---------------- تصفية الواجهة ---------------- */
  (function filters() {
    var chips = [].slice.call(document.querySelectorAll('.chip[data-filter]'));
    if (!chips.length) return;

    var cards = [].slice.call(document.querySelectorAll('[data-code-card]'));
    var empty = document.getElementById('no-results');

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var want = chip.dataset.filter;
        chips.forEach(function (c) {
          c.setAttribute('aria-pressed', String(c === chip));
        });

        var shown = 0;
        cards.forEach(function (card) {
          var ok = want === 'all' || card.dataset.category === want;
          card.hidden = !ok;
          if (ok) shown++;
        });

        document.querySelectorAll('[data-section]').forEach(function (sec) {
          if (!sec.querySelector('[data-code-card]')) return;
          sec.hidden = !sec.querySelector('[data-code-card]:not([hidden])');
        });

        if (empty) empty.hidden = shown > 0;
      });
    });
  })();

  /* ---------------- فهرس الأكواد (البحث والمفضلة) ---------------- */
  var indexPromise = null;

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch('/data/codes.json')
        .then(function (r) {
          if (!r.ok) throw new Error('bad response');
          return r.json();
        })
        .catch(function () {
          return [];
        });
    }
    return indexPromise;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function logoMarkup(store) {
    if (store.logo) {
      return '<img class="store-logo store-logo--sm" src="' + esc(store.logo) + '" alt="" width="36" height="36" loading="lazy">';
    }
    return (
      '<span class="store-logo store-logo--sm store-logo--text" style="background:' +
      esc(store.brandColor) + ';color:' + esc(store.ink) + '" aria-hidden="true">' +
      esc(store.name.trim().charAt(0)) + '</span>'
    );
  }

  /** نفس بنية البطاقة المولَّدة في build.js حتى تتطابق الأنماط. */
  function cardMarkup(c) {
    var favOn = isFav(c.id);
    var tags = '';
    if (c.discount) tags += '<span class="tag tag--discount">' + esc(c.discount) + '</span>';
    if (c.featured) tags += '<span class="tag tag--featured">الأفضل</span>';

    var meta = [];
    if (c.expires) meta.push('صالح حتى ' + esc(c.expires));
    if (c.terms) meta.push(esc(c.terms));

    return (
      '<article class="code-card' + (c.featured ? ' is-featured' : '') + '" id="' + esc(c.id) + '" data-code-card>' +
        '<div class="code-card__top">' +
          '<a class="code-store" href="/store/' + esc(c.store.slug) + '/">' +
            logoMarkup(c.store) +
            '<span class="code-store__name">' + esc(c.store.name) + '</span>' +
            '<span class="code-store__cat">' + esc(c.store.category) + '</span>' +
          '</a>' +
          '<button type="button" class="fav-btn' + (favOn ? ' is-on' : '') + '" data-fav="' + esc(c.id) + '"' +
            ' aria-pressed="' + favOn + '" aria-label="حفظ في المفضلة">' +
            '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M12 20.5 4.8 13a4.6 4.6 0 0 1 6.5-6.5l.7.7.7-.7A4.6 4.6 0 1 1 19.2 13Z"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="code-card__tags">' + tags + '</div>' +
        '<h3 class="code-card__title">' + esc(c.title) + '</h3>' +
        (meta.length ? '<p class="code-card__meta">' + meta.join('<span class="sep" aria-hidden="true">·</span>') + '</p>' : '') +
        '<div class="code-card__action">' +
          '<button type="button" class="copy-btn" data-code="' + esc(c.code) + '" data-url="' + esc(c.store.url) + '"' +
            ' data-id="' + esc(c.id) + '" aria-label="انسخ كود ' + esc(c.code) + '">' +
            '<span class="copy-btn__code">' + esc(c.code) + '</span>' +
            '<span class="copy-btn__label">نسخ</span>' +
          '</button>' +
          '<a class="btn btn-ghost code-card__visit" href="' + esc(c.store.url) + '" target="_blank" rel="nofollow sponsored noopener">المتجر<span aria-hidden="true"> ↗</span></a>' +
        '</div>' +
      '</article>'
    );
  }

  /* ---------------- صفحة البحث ---------------- */
  (function search() {
    var input = document.getElementById('live-search');
    var out = document.getElementById('search-results');
    var status = document.getElementById('search-status');
    if (!input || !out) return;

    var data = [];
    loadIndex().then(function (d) {
      data = d;
      var q = new URLSearchParams(location.search).get('q');
      if (q) {
        input.value = q;
        run();
      }
    });

    var timer;
    function run() {
      var q = normalize(input.value);
      if (q.length < 2) {
        out.innerHTML = '';
        if (status) status.textContent = 'اكتب حرفين على الأقل للبحث.';
        return;
      }

      var hits = data.filter(function (c) {
        return normalize([c.store.name, c.store.category, c.title, c.code, c.discount].join(' ')).indexOf(q) !== -1;
      });

      out.innerHTML = hits.map(cardMarkup).join('');
      paintState(out);
      if (status) {
        status.textContent = hits.length
          ? 'وجدنا ' + hits.length + ' نتيجة لـ «' + input.value.trim() + '».'
          : 'ما فيه نتائج لـ «' + input.value.trim() + '». جرّب اسم المتجر.';
      }
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(run, 140);
    });
  })();

  /* ---------------- صفحة المفضلة ---------------- */
  function renderFavorites() {
    var out = document.getElementById('fav-results');
    var empty = document.getElementById('fav-empty');
    var status = document.getElementById('fav-status');
    if (!out) return;

    loadIndex().then(function (data) {
      var favs = readSet(FAV_KEY);
      var byId = {};
      data.forEach(function (c) {
        byId[c.id] = c;
      });

      var list = favs
        .map(function (id) {
          return byId[id];
        })
        .filter(Boolean);

      out.innerHTML = list.map(cardMarkup).join('');
      paintState(out);

      if (empty) empty.hidden = list.length > 0;
      if (status) {
        status.textContent = list.length
          ? 'حفظت ' + list.length + ' كود. محفوظة على جهازك فقط.'
          : '';
        status.hidden = !list.length;
      }
    });
  }

  if (document.getElementById('fav-results')) renderFavorites();

  /* ---------------- تثبيت التطبيق ---------------- */
  (function install() {
    var btn = document.getElementById('install-btn');
    if (!btn) return;
    var deferred = null;

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      btn.hidden = false;
    });

    btn.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () {
        deferred = null;
        btn.hidden = true;
      });
    });

    window.addEventListener('appinstalled', function () {
      btn.hidden = true;
      toast('تم تثبيت التطبيق على جهازك');
    });
  })();

  /* ---------------- عامل الخدمة ---------------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {
        /* التخزين دون اتصال ميزة إضافية — فشلها لا يعطّل الموقع */
      });
    });
  }

  paintState(document);
})();
