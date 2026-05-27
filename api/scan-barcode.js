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

    const prompt = `You are an OCR system reading a retail product label.

Read EVERY number and code visible in this image. Look at:
- Barcodes (the digits printed under the bars)
- SKU stickers, price tags, carton labels
- Any alphanumeric product code

Common code format here: digits + optional letter + digits (example 26068616B005).
But codes may vary in length or format — read whatever is printed exactly.

Return your answer as JSON only, no other text:
{"codes": ["all", "codes", "you", "see"]}

If you see nothing readable, return: {"codes": []}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
          generationConfig: { maxOutputTokens: 200, temperature: 0 },
        }),
      }
    );

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    let raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

    // نستخرج JSON من الرد (قد يكون محاطاً بـ ```json)
    raw = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

    let codes = [];
    try {
      const parsed = JSON.parse(raw);
      codes = Array.isArray(parsed.codes) ? parsed.codes : [];
    } catch {
      // لو فشل JSON، نستخرج أي كود يشبه الباركود من النص الخام
      codes = raw.match(/[A-Za-z0-9]{6,}/g) ?? [];
    }

    // ننظف كل كود ونبقي المرشحين الصالحين
    const cleaned = codes
      .map(c => String(c).replace(/\s+/g, "").replace(/了/g, "B").toUpperCase().replace(/[^A-Z0-9]/g, ""))
      .filter(c => c.length >= 6);

    if (cleaned.length === 0) {
      return res.status(200).json({ barcode: null, candidates: [], message: "لم يُعثر على باركود" });
    }

    // نرجّع الأطول كأفضل مرشح + باقي المرشحين للمطابقة الذكية
    cleaned.sort((a, b) => b.length - a.length);
    return res.status(200).json({ barcode: cleaned[0], candidates: cleaned });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
