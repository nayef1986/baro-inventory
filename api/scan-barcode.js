// api/scan-barcode.js — قراءة الباركود والأرقام من الصورة

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { imageBase64 } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  try {
    // نستخرج mime_type الصحيح من الـ data URL بدل افتراض PNG
    const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
    const mimeType  = mimeMatch?.[1] ?? "image/jpeg";
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const prompt = `Read the product codes printed on this retail label image.

The most important code is usually the LARGE number printed in big bold text (often near the price).

Code formats to expect:
1. Internal code: 8 digits + letter B + 3 digits (example: 26058622B002)
2. Commercial barcode: 12-13 digits (example: 6976082021063)

Read EVERY code you can see, digit by digit, exactly as printed. Include the large bold code.

Return JSON only, nothing else:
{"codes": ["26058622B002"]}

If truly nothing readable, return: {"codes": []}`;

    // نجرّب عدة موديلات — لو فشل واحد ننتقل للتالي (يمنع الخطأ الأحمر)
    const MODELS = ["gemini-2.0-flash", "gemini-flash-latest", "gemini-2.5-flash", "gemini-1.5-flash-latest"];
    let data = null, lastErr = "";

    let codes = [];
    for (const model of MODELS) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inline_data: { mime_type: mimeType, data: base64Data } },
                  { text: prompt }
                ]
              }],
              generationConfig: { maxOutputTokens: 500, temperature: 0 },
            }),
          }
        );
        const json = await response.json();
        if (json.error) { lastErr = json.error.message; continue; }

        // نستخرج الأكواد من رد هذا الموديل
        let raw = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
        raw = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
        let modelCodes = [];
        try {
          const parsed = JSON.parse(raw);
          modelCodes = Array.isArray(parsed.codes) ? parsed.codes : [];
        } catch {
          modelCodes = raw.match(/[A-Za-z0-9]{6,}/g) ?? [];
        }

        data = json;
        if (modelCodes.length > 0) { codes = modelCodes; break; } // نجح بقراءة فعلية
        // رد فاضي → نجرّب الموديل التالي
      } catch (e) { lastErr = e.message; continue; }
    }

    if (!data) return res.status(500).json({ error: lastErr || "كل الموديلات فشلت" });

    // ننظف كل كود ونبقي المرشحين الصالحين
    const cleaned = codes
      .map(c => String(c).replace(/\s+/g, "").replace(/了/g, "B").toUpperCase().replace(/[^A-Z0-9]/g, ""))
      .filter(c => c.length >= 6);

    if (cleaned.length === 0) {
      // نرفق تشخيص: آخر خطأ + أول 80 حرف مما رجّعه Gemini
      let rawText = "";
      try { rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 80) ?? ""; } catch {}
      return res.status(200).json({
        barcode: null, candidates: [],
        message: "لم يُعثر على باركود",
        debug: { lastErr: lastErr || "لا يوجد", geminiText: rawText || "فاضي" },
      });
    }

    // نرجّع الأطول كأفضل مرشح + باقي المرشحين للمطابقة الذكية
    cleaned.sort((a, b) => b.length - a.length);
    return res.status(200).json({ barcode: cleaned[0], candidates: cleaned });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
