# نشر COCO CAKE على Vercel

هذا المجلد هو جذر مشروع Vercel الذي ينشر تطبيق COCO CAKE وحده —
تطبيق باروو لا يُنشر معه.

## كيف يعمل

المجلد يحمل ملفات المشروع فقط، و`prepare.sh` يجهّز المصدر قبل البناء:

- **إن كان المستودع مسحوباً** (المشروع مربوط بـGitHub) ينسخ من
  `../../src/sweetcost` مباشرة.
- **وإلا** يجلب `main` من المستودع العام عبر codeload.

فيعمل في الحالتين بلا تغيير: مربوطاً بـGitHub أو منشوراً بالملفات مباشرة.

## الملفات

| الملف | دوره |
| --- | --- |
| `package.json` | الاعتماديات التي يحتاجها sweetcost فقط، وأمر البناء |
| `vite.config.js` | مدخل بناء واحد: `sweet-cost/index.html` |
| `tsconfig.json` | نفس إعدادات المستودع |
| `vercel.json` | تحويل `/` إلى `/sweet-cost/` وترويسات الـservice worker |
| `prepare.sh` | يجهّز المصدر ويكتب `.env.production` |
| `.gitignore` | ما يولّده `prepare.sh` — لا يُلتزم به هنا |

## إعدادات المشروع في Vercel

```
Root Directory:    deploy/coco-cake
Framework:         vite
Build Command:     npm run build     (يشغّل prepare.sh ثم vite build)
Output Directory:  dist
```

لا متغيّرات بيئة في لوحة Vercel — `prepare.sh` يكتب `.env.production`.

## تحذير: مصادر Tailwind

`src/sweetcost/styles.css` يحمل سطري `@source` صراحةً. الاكتشاف التلقائي
في Tailwind يتخطّى ما يتجاهله `.gitignore`، والنسخة هنا مُولَّدة
ومتجاهَلة — فبلا هذين السطرين يخرج CSS ناقصاً (‏7 ك.ب بدل 22) والتطبيق
مكسور الشكل بلا أي خطأ في البناء. لا تحذفهما.

## الوصول

**بلا بوابة دخول** بطلب صاحب المتجر: السياسات للدور `anon`، ومفتاح anon
يظهر في حزمة المتصفح بطبيعته. من يصل إلى الرابط يقرأ البيانات ويكتبها.
الرابط وحده هو ما يحمي القاعدة.

لإرجاع البوابة: انظر «الوصول» في `src/sweetcost/README.md`.

## نشر تحديث

ادفع إلى `main` — المشروع مربوط بالمستودع فينشر تلقائياً.
