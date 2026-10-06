// ============================================================
// api/ping.js — النبّاض: يُبقي قاعدة البيانات مستيقظة
//
// خطة Supabase المجانية توقف المشروع إذا مضت سبعة أيام بلا أي
// طلب. وقتها يبقى التطبيق معلّقاً على شاشة التحميل — لا يفتح،
// ولا يقول لماذا. حدث هذا فعلاً بين ١٩ سبتمبر و١ أكتوبر ٢٠٢٦.
//
// هذه الدالة تقرأ صفاً واحداً تافهاً كل يوم (جدولتها في
// vercel.json)، فيصفَّر عدّاد الخمول ولا يصل السبعة أبداً.
//
// تقرأ ولا تكتب. والمفتاح هنا هو نفسه المفتاح العام الموجود في
// حزمة المتصفح — ليس سرّاً جديداً نكشفه.
//
// ملاحظة: النبّاض يمنع النوم، ولا يوقظ من نام. إن توقف المشروع
// لسبب آخر فإرجاعه من لوحة Supabase بضغطة.
// ============================================================

const SUPABASE_URL = 'https://tdlpikekpnxuzyfcvqzo.supabase.co'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkbHBpa2VrcG54dXp5ZmN2cXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2ODg2NzIsImV4cCI6MjEwNTI2NDY3Mn0.jxKvvA_0ySwQVcRDAznZNwQwpwAOwjaj1M6CHY9F8uM'

/** مهلة قصيرة: القاعدة النائمة لا تردّ، ولا فائدة من الانتظار طويلاً */
const TIMEOUT_MS = 10_000

export default async function handler(req, res) {
  // إن ضُبط CRON_SECRET على المشروع لم يَعُد أحد غير Vercel يستدعيها.
  // وبدونه الطرف مفتوح — وما يفعله قراءة صفٍّ واحد، فلا ضرر.
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const startedAt = Date.now()

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/sc_settings?select=id&limit=1`,
      {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    )

    const ms = Date.now() - startedAt

    if (!response.ok) {
      return res.status(502).json({ awake: false, status: response.status, ms })
    }

    return res.status(200).json({ awake: true, ms, at: new Date().toISOString() })
  } catch (e) {
    return res.status(502).json({
      awake: false,
      error: e instanceof Error ? e.message : 'fetch failed',
      ms: Date.now() - startedAt,
    })
  }
}
