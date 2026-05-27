// api/scan-barcode.js — قراءة الباركود والأرقام من الصورة

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { imageBase64 } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  try {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const prompt = `Look at this image carefully. Find the product SKU or barcode number.

The code format is usually: 8 digits + letter B + 3 digits
Examples: 26068616B005, 25252201B001, 26049616B004

Steps:
1. Look for any printed numbers/letters on labels, stickers, boxes, or tags
2. Find the longest number sequence that looks like a product code
3. Include the letter B if present (e.g. 26068616B005)

Return ONLY the code with no spaces or explanation.
If you cannot find any code, return: NOT_FOUND`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: "image/png", data: base64Data } },
              { text: prompt }
            ]
          }],
          generationConfig: { maxOutputTokens: 30, temperature: 0 },
        }),
      }
    );

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "NOT_FOUND";

    if (raw === "NOT_FOUND" || raw.length < 4) {
      return res.status(200).json({ barcode: null, message: "لم يُعثر على باركود" });
    }

    // تنظيف: نبقي أحرف وأرقام فقط
    const cleaned = raw.replace(/\s+/g, "").replace(/了/g, "B").toUpperCase().replace(/[^A-Z0-9]/g, "");

    if (cleaned.length < 4) {
      return res.status(200).json({ barcode: null, message: "الكود قصير جداً" });
    }

    return res.status(200).json({ barcode: cleaned });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
