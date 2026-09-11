/* نسخ الكود + البحث + التصنيف — بدون أي مكتبات خارجية */
(function () {
  'use strict';

  /* ---------- نسخ الكود ---------- */
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function markCopied(btn) {
    var label = btn.querySelector('.label');
    if (!btn.dataset.idleLabel && label) btn.dataset.idleLabel = label.textContent;
    btn.classList.add('copied');
    if (label) label.textContent = 'تم النسخ ✓';
    clearTimeout(btn._t);
    btn._t = setTimeout(function () {
      btn.classList.remove('copied');
      if (label) label.textContent = btn.dataset.idleLabel || 'اضغط للنسخ';
    }, 2000);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.copy-btn');
    if (!btn) return;
    var code = btn.dataset.code || '';
    if (!code) return;

    var done = function () { markCopied(btn); };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code).then(done, function () {
        if (fallbackCopy(code)) done();
      });
    } else if (fallbackCopy(code)) {
      done();
    }

    // فتح المتجر في تبويب جديد بعد النسخ مباشرة
    var url = btn.dataset.url;
    if (url) window.open(url, '_blank', 'noopener');
  });

  /* ---------- البحث والتصنيف ---------- */
  var search = document.getElementById('store-search');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-store-card]'));
  var empty = document.getElementById('no-results');
  if (!cards.length) return;

  var activeCat = 'all';

  function normalize(s) {
    return (s || '')
      .toLowerCase()
      .replace(/[ؗ-ًؚ-ْـ]/g, '') // تشكيل وتطويل
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .trim();
  }

  function apply() {
    var q = normalize(search ? search.value : '');
    var shown = 0;

    cards.forEach(function (card) {
      var haystack = normalize(card.dataset.search);
      var catOk = activeCat === 'all' || card.dataset.category === activeCat;
      var qOk = !q || haystack.indexOf(q) !== -1;
      var show = catOk && qOk;
      card.hidden = !show;
      if (show) shown++;
    });

    // إخفاء العناوين التي لم يبقَ تحتها شيء
    document.querySelectorAll('[data-section]').forEach(function (sec) {
      var any = sec.querySelectorAll('[data-store-card]:not([hidden])').length;
      sec.hidden = !any;
    });

    if (empty) empty.hidden = shown > 0;
  }

  if (search) {
    search.addEventListener('input', apply);
    search.addEventListener('search', apply);
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      activeCat = chip.dataset.category;
      chips.forEach(function (c) {
        c.setAttribute('aria-pressed', String(c === chip));
      });
      apply();
    });
  });
})();
