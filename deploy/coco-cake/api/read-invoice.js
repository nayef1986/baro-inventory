// ============================================================
// api/read-invoice.js — قراءة فاتورة الشراء من صورة
//
// دالة تعمل على خادم Vercel لا في المتصفح، لأن مفتاح Gemini
// لا يجوز أن يدخل حزمة المتصفح: من يفتح الرابط يأخذه.
//
// ⚠️ هذا الطرف عام. تطبيق COCO CAKE بلا بوابة دخول، فمن يعرف
//    الرابط يستطيع استدعاءه واستهلاك رصيد المفتاح. الحماية
//    الحقيقية الوحيدة هي إرجاع بوابة الدخول.
//
// الدالة تقرأ فقط ولا تكتب في قاعدة البيانات. ما تُخرجه يُراجَع
// في الشاشة ويُحفظ بضغطة من صاحب المتجر — قراءة آلية خاطئة
// تُفسد كل تكلفة بعدها، فلا حفظ تلقائي أبداً.
// ============================================================

/** حدّ حجم الصورة — الصور فوقه تُرفض بدل إرهاق الخدمة */
const MAX_BYTES = 6 * 1024 * 1024

/** نجرّب الموديلات بالترتيب: أولها أسرع، وما بعده احتياط */
const MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-flash-latest']

const PROMPT = `أنت تقرأ صورة فاتورة شراء من مورّد (غالباً بالعربية، وقد تكون مكتوبة بخط اليد أو مطبوعة).

استخرج بنود الفاتورة فقط — لا تخترع شيئاً غير مكتوب.

لكل بند حدّد:
- name: اسم الصنف كما هو مكتوب بالضبط
- quantity: عدد العبوات المشتراة (رقم)
- package_size: حجم العبوة الواحدة إن كان مكتوباً (مثال: 25 لكيس 25 كجم، 30 لطبق 30 بيضة). إن لم يُذكر ضع null
- unit: وحدة حجم العبوة كما تفهمها: "kg" أو "g" أو "l" أو "ml" أو "piece". إن لم تعرف ضع null
- package_price: سعر العبوة الواحدة (رقم). إن كان المكتوب هو الإجمالي فقط، اقسمه على الكمية
- line_total: إجمالي سطر البند إن كان مكتوباً، وإلا null

وحدّد إن وُجدت:
- invoice_no: رقم الفاتورة
- purchased_on: تاريخ الفاتورة بصيغة YYYY-MM-DD
- supplier_name: اسم المورّد

أعد JSON فقط بلا أي شرح ولا علامات تنسيق:
{"invoice_no": null, "purchased_on": null, "supplier_name": null, "items": [{"name": "", "quantity": 1, "package_size": null, "unit": null, "package_price": 0, "line_total": null}]}

إن لم تستطع قراءة أي بند: {"items": []}`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { imageBase64 } = req.body ?? {}
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: 'imageBase64 required' })
  }
  if (imageBase64.length > MAX_BYTES) {
    return res.status(413).json({ error: 'الصورة كبيرة جداً. صغّرها وأعد المحاولة.' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY غير مضبوط على هذا المشروع.' })
  }

  const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/)
  const mimeType = mimeMatch?.[1] ?? 'image/jpeg'
  const data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

  let lastError = 'تعذّرت القراءة'

  for (const model of MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { parts: [{ inline_data: { mime_type: mimeType, data } }, { text: PROMPT }] },
            ],
            generationConfig: { temperature: 0, responseMimeType: 'application/json' },
          }),
        },
      )

      if (!response.ok) {
        lastError = `${model}: ${response.status}`
        continue
      }

      const body = await response.json()
      const text = body?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        lastError = `${model}: رد فارغ`
        continue
      }

      // الموديل قد يغلّف الرد بعلامات ```json رغم الطلب
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
      return res.status(200).json({ model, ...JSON.parse(cleaned) })
    } catch (e) {
      lastError = `${model}: ${e instanceof Error ? e.message : 'خطأ'}`
    }
  }

  return res.status(502).json({ error: lastError })
}
