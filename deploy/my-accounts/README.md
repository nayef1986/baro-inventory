# حساباتي — نشر على Vercel

صفحة حسابات شخصية مستقلة: حسابات بنسب، حركات وارد/صادر، توزيع مبلغ
على الحسابات بالنسب، وتصدير **Excel** وطباعة **PDF** (للكل أو لحساب واحد،
مع فلتر فترة ورصيد افتتاحي).

ملف واحد `index.html` بلا بناء — المكتبات من CDN بإصدارات مثبّتة.

## إعدادات مشروع Vercel

```
Root Directory:    deploy/my-accounts
Framework:         Other
Build Command:     (فارغ)
Output Directory:  .
```

مربوط بنفس المستودع — كل دفعة إلى `main` تنشره تلقائياً.

## القاعدة

نفس مشروع Supabase الخاص بـCOCO CAKE (`sweet-cost`)، جدولا
`pa_accounts` و`pa_entries` — انظر `supabase/migrations/0009_personal_accounts.sql`.
نبّاض COCO CAKE اليومي يُبقي القاعدة مستيقظة للتطبيقين.

## الوصول

بخلاف COCO CAKE: **دخول بالبريد وكلمة المرور إلزامي**. كل صف مقفول على
صاحبه (RLS على `auth.uid()`)، والدور `anon` بلا أي صلاحية على الجدولين.
