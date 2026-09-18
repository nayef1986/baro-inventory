# نشر COCO CAKE على Vercel

مشروع Vercel اسمه **`coco-cake-web`** في فريق `baro`. ينشر تطبيق
COCO CAKE وحده — تطبيق باروو لا يُنشر معه.

## لماذا هذه الطريقة

مشروع Vercel غير مربوط بـGitHub، لأن تطبيق Vercel على GitHub لا يملك
صلاحية على `nayef1986/baro-inventory`. بدل انتظار الصلاحية، المشروع
يحمل خمسة ملفات فقط، و`prepare.sh` يجلب المصدر من المستودع العام وقت
البناء ويثبّته قبل `vite build`.

المرجع في `prepare.sh` هو `main`، فكل إعادة نشر تأخذ آخر ما دُفع.

## الملفات

| الملف | دوره |
| --- | --- |
| `package.json` | الاعتماديات التي يحتاجها sweetcost فقط |
| `vite.config.js` | مدخل بناء واحد: `sweet-cost/index.html` |
| `tsconfig.json` | نفس إعدادات المستودع |
| `vercel.json` | تحويل `/` إلى `/sweet-cost/` وترويسات الـservice worker |
| `prepare.sh` | يجلب المصدر ويكتب `.env.production` |

## إعدادات البناء في Vercel

```
Framework:         vite
Install Command:   npm install
Build Command:     sh prepare.sh && npm run build
Output Directory:  dist
```

لا متغيّرات بيئة في لوحة Vercel — `prepare.sh` يكتب `.env.production`.

**بلا بوابة دخول** بطلب صاحب المتجر: السياسات للدور `anon`، ومفتاح anon
يظهر في حزمة المتصفح بطبيعته. من يصل إلى الرابط يقرأ ويكتب. الرابط وحده
هو ما يحمي القاعدة.

## نشر تحديث

1. ادفع التغيير إلى `main`.
2. أعد النشر بنفس الملفات الخمسة — `prepare.sh` يجلب `main` وحده.

## الأفضل لاحقاً

امنح تطبيق Vercel على GitHub صلاحية على `nayef1986/baro-inventory`
من <https://github.com/apps/vercel/installations/select_target>، ثم
اربط المشروع بالمستودع. عندها كل دفعة إلى `main` تنشر تلقائياً ويُستغنى
عن `prepare.sh`.
