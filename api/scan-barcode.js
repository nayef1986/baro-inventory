// api/scan-barcode.js — قراءة الباركود والأرقام من الصورة عبر Gemini

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { imageBase64 } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  try {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const prompt = `You are a barcode and product code reader.

Look at this image and find any barcode or product number.

Step 1: Try to read any barcode (EAN13, CODE128, QR code, DataMatrix).
Step 2: If no barcode found, read any numbers printed on the product, label, carton, or sticker using OCR.

Rules for a valid code:
- Length exactly 8, 12, 13, or 14 digits
- OR starts with: 24, 62, 69
- Digits only (no letters unless format like XXX123XXX)

Return ONLY the code number. Nothing else.
If multiple codes found, return the most prominent one.
If nothing found, return: NOT_FOUND`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: "image/jpeg", data: base64Data } },
              { text: prompt }
            ]
          }],
          generationConfig: { maxOutputTokens: 50, temperature: 0 },
        }),
      }
    );

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "NOT_FOUND";

    if (raw === "NOT_FOUND" || raw.length < 3) {
      return res.status(200).json({ barcode: null, message: "لم يُعثر على باركود" });
    }

    // تنظيف
    let cleaned = raw.replace(/\s+/g, "").replace(/了/g, "B").toUpperCase();
    // نزيل أي رموز غير ضرورية
    cleaned = cleaned.replace(/[^A-Z0-9]/g, "");

    // التحقق من صحة الكود
    const isValid =
      [8, 12, 13, 14].includes(cleaned.length) ||
      cleaned.startsWith("24") ||
      cleaned.startsWith("62") ||
      cleaned.startsWith("69") ||
      cleaned.length >= 6;

    if (!isValid) {
      return res.status(200).json({ barcode: null, message: "الكود المقروء غير صالح: " + cleaned });
    }

    return res.status(200).json({ barcode: cleaned });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
