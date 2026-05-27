// api/scan-barcode.js — قراءة الباركود والأرقام من الصورة عبر Gemini

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { imageBase64 } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  try {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const prompt = `You are an expert at reading product barcodes and SKU codes from images.

TASK: Find the product code/barcode in this image.

LOOK FOR:
1. Any number+letter combination like: 26068616B005, 25252201B001
2. Barcodes printed as lines (EAN13, CODE128)
3. QR codes
4. Any SKU printed on labels, stickers, cartons

IMPORTANT: Arabic/Chinese product codes often have format: NUMBERS + LETTER + NUMBERS
Example: 26068616B005 (8 digits + B + 3 digits)

Return ONLY the code. No spaces. No explanation.
If not found, return: NOT_FOUND`;

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

    // التحقق: أي كود بطول 6+ حروف/أرقام
    if (cleaned.length < 6) {
      return res.status(200).json({ barcode: null, message: "الكود المقروء قصير جداً: " + cleaned });
    }

    return res.status(200).json({ barcode: cleaned });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
