// api/scan-barcode.js — قراءة الباركود من الصورة عبر Gemini

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { imageBase64 } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  try {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: base64Data,
                }
              },
              {
                text: "Read the barcode or product code in this image. Return ONLY the barcode number/text, nothing else. If multiple barcodes exist, return the most prominent one. If no barcode is found, return 'NOT_FOUND'."
              }
            ]
          }],
          generationConfig: { maxOutputTokens: 100, temperature: 0 },
        }),
      }
    );

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "NOT_FOUND";

    if (text === "NOT_FOUND" || text.length < 3) {
      return res.status(200).json({ barcode: null, message: "لم يُعثر على باركود في الصورة" });
    }

    // تنظيف الباركود
    const cleaned = text.replace(/\s+/g, "").replace(/了/g, "B").toUpperCase();
    return res.status(200).json({ barcode: cleaned });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
