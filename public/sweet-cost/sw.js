// ============================================================
// sw.js — Service Worker لتطبيق سويت كوست
//
// الهدف: فتح التطبيق فوراً من الشاشة الرئيسية حتى مع شبكة
// بطيئة. بيانات Supabase لا تُخزَّن أبداً — الأرقام المالية
// يجب أن تكون حيّة، لا نسخة قديمة من الكاش.
// ============================================================

const VERSION = 'sweetcost-v1'
const SHELL = '/sweet-cost/'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll([SHELL]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // أي طلب خارجي (Supabase، الخطوط) يمرّ للشبكة كما هو.
  if (url.origin !== self.location.origin) return

  // التنقّل: الشبكة أولاً، والكاش شبكة أمان فقط.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(VERSION).then((cache) => cache.put(SHELL, copy))
          return response
        })
        .catch(() => caches.match(SHELL).then((cached) => cached ?? offlineResponse())),
    )
    return
  }

  // ملفات البناء: من الكاش فوراً مع تحديث في الخلفية.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/sweet-cost/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(VERSION).then((cache) => cache.put(request, copy))
            }
            return response
          })
          .catch(() => cached)

        return cached ?? network
      }),
    )
  }
})

function offlineResponse() {
  return new Response(
    '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">' +
      '<title>غير متصل</title>' +
      '<body style="margin:0;display:grid;place-items:center;min-height:100vh;' +
      'background:#26381F;color:#f5efe6;font-family:system-ui;text-align:center;padding:24px">' +
      '<div><h1 style="font-size:20px;margin:0 0 8px">لا يوجد اتصال</h1>' +
      '<p style="margin:0;color:#a3b491;font-size:14px;line-height:1.8">' +
      'سويت كوست يحتاج اتصالاً لقراءة أرقامك من قاعدة البيانات.<br>افتح التطبيق مرة أخرى بعد عودة الشبكة.' +
      '</p></div></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
  )
}
